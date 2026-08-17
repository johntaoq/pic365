#!/usr/bin/env bash
set -Eeuo pipefail

json_health() {
  local url="$1"
  local body
  body="$(curl -fsS --max-time 15 "$url")" || return 1
  [[ "$body" == \{* ]] || return 1
  grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body" || return 1
  printf '%s\n' "$body"
}

sudo docker ps --filter name=pic365 --format '{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'

echo '--- APP API ---'
json_health http://127.0.0.1:5173/api/health
json_health 'http://127.0.0.1:5173/api/health?deep=1'
echo

echo '--- PAGE ---'
curl -fsS -o /dev/null -w 'status=%{http_code} type=%{content_type}\n' http://127.0.0.1:5173/

echo '--- GALLERY ---'
gallery_count="$(sudo find /opt/pic365/shared/gallery/images -type f | wc -l)"
echo "persistent_files=$gallery_count"
[[ "$gallery_count" -gt 500 ]]
curl -fsS -o /dev/null http://127.0.0.1:5173/images/pic365-logo.png

echo '--- DATA ---'
sudo docker exec -i pic365-app node --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync('/app/data/app.sqlite', { readOnly: true });
console.log(JSON.stringify({
  users: database.prepare('SELECT COUNT(*) AS count FROM users').get().count,
  projects: database.prepare("SELECT COUNT(*) AS count FROM ecommerce_projects WHERE status != 'deleted'").get().count,
  generations: database.prepare('SELECT COUNT(*) AS count FROM generations').get().count,
  credits: database.prepare('SELECT COALESCE(SUM(credit_balance), 0) AS count FROM users').get().count
}));
database.close();
NODE

echo '--- CONFIG ---'
sudo docker exec -i pic365-app node --input-type=module <<'NODE'
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync('/app/data/app.sqlite', { readOnly: true });
const providers = database.prepare(`
  SELECT name, provider_type, model, enabled, is_default
  FROM image_provider_configs
  WHERE enabled = 1
  ORDER BY is_default DESC, created_at ASC
`).all();
database.close();
console.log(JSON.stringify({
  providers: providers.map((provider) => ({
    name: provider.name,
    type: provider.provider_type,
    model: provider.model,
    default: Boolean(provider.is_default)
  })),
  storageBackend: /UseDevelopmentStorage=true|devstoreaccount1/i.test(process.env.AZURE_STORAGE_CONNECTION_STRING || '')
    ? 'azurite'
    : 'azure-blob',
  storageContainer: process.env.AZURE_STORAGE_CONTAINER,
  appUrl: process.env.APP_URL
}));
if (!providers.length || !providers.some((provider) => provider.is_default)) process.exit(1);
NODE

echo '--- HISTORICAL STORAGE ---'
sudo docker exec -i pic365-app node --input-type=module <<'NODE'
import { BlobServiceClient } from '@azure/storage-blob';
import { DatabaseSync } from 'node:sqlite';
const database = new DatabaseSync('/app/data/app.sqlite', { readOnly: true });
const generation = database.prepare(`
  SELECT storage_path FROM generations
  WHERE storage_path IS NOT NULL AND storage_path != ''
  ORDER BY created_at DESC LIMIT 1
`).get();
database.close();
if (!generation?.storage_path) throw new Error('NO_STORED_GENERATION');
const service = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
const blob = service.getContainerClient(process.env.AZURE_STORAGE_CONTAINER).getBlobClient(generation.storage_path);
const properties = await blob.getProperties();
console.log(JSON.stringify({ readable: true, bytes: Number(properties.contentLength || 0), contentType: properties.contentType || '' }));
NODE

echo '--- LOGS ---'
sudo docker logs --tail 30 pic365-app 2>&1
if sudo docker inspect pic365-azurite >/dev/null 2>&1; then
  sudo docker logs --tail 15 pic365-azurite 2>&1
fi
