#!/usr/bin/env bash
set -Eeuo pipefail

failed_release="${1:?failed release id required}"
root=/opt/pic365
shared_dir="$root/shared"
current_backup="$shared_dir/backups/current-before-$failed_release"
deploy_backup="$shared_dir/backups/deploy-env-before-$failed_release"
env_backup="$shared_dir/backups/env-$failed_release"
storage_env="$shared_dir/storage.env"

health_ready() {
  local body
  body="$(curl -fsS --max-time 10 http://127.0.0.1:5173/api/health)" || return 1
  [[ "$body" == \{* ]] || return 1
  grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body"
}

sudo test -s "$current_backup"
sudo test -f "$deploy_backup"
previous_current="$(sudo cat "$current_backup")"
sudo test -d "$previous_current"

sudo ln -sfn "$previous_current" "$root/current.rollback"
sudo mv -Tf "$root/current.rollback" "$root/current"
sudo cp -a "$deploy_backup" "$shared_dir/deploy.env"
if sudo test -f "$env_backup"; then
  sudo cp -a "$env_backup" "$shared_dir/.env.production"
  sudo chmod 600 "$shared_dir/.env.production"
fi

storage_connection="$(sudo sed -n 's/^AZURE_STORAGE_CONNECTION_STRING=//p' "$storage_env" | head -n 1)"
compose=(
  sudo docker compose
  --env-file "$shared_dir/deploy.env"
  --file "$root/current/deploy/pic365/docker-compose.yml"
  --project-name pic365
)
if [[ "$storage_connection" == 'UseDevelopmentStorage=true' || "$storage_connection" == *devstoreaccount1* ]]; then
  "${compose[@]}" --profile azurite up -d
else
  "${compose[@]}" up -d app
fi

for _ in $(seq 1 30); do
  if health_ready; then
    echo "rollback restored $(sudo sed -n 's/^PIC365_IMAGE=//p' "$shared_dir/deploy.env")"
    exit 0
  fi
  sleep 2
done

sudo docker logs --tail 100 pic365-app >&2 || true
echo 'rollback did not become healthy' >&2
exit 1
