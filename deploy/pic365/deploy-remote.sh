#!/usr/bin/env bash
set -Eeuo pipefail

release="${1:?release id required}"
app_archive="${2:?application archive required}"
data_archive="${3:-}"
env_source="${4:-}"
gallery_archive="${5:-}"

root=/opt/pic365
release_dir="$root/releases/$release"
shared_dir="$root/shared"
env_file="$shared_dir/.env.production"
storage_env="$shared_dir/storage.env"
deploy_env="$shared_dir/deploy.env"
image="pic365:$release"
gallery_dir="$shared_dir/gallery/images"
rollback_armed=0

health_ready() {
  local body
  body="$(curl -fsS --max-time 10 http://127.0.0.1:5173/api/health)" || return 1
  [[ "$body" == \{* ]] || return 1
  grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body"
}

rollback_on_error() {
  local status=$?
  trap - ERR
  if [[ "$rollback_armed" == "1" ]]; then
    echo "deployment failed after switch; restoring the previous release" >&2
    sudo bash "$release_dir/deploy/pic365/rollback-remote.sh" "$release" || {
      echo "automatic rollback failed; manual intervention is required" >&2
    }
  fi
  exit "$status"
}
trap rollback_on_error ERR

sudo mkdir -p "$root/releases" "$shared_dir/data/generated" "$shared_dir/data/azurite" "$shared_dir/backups" "$gallery_dir"
sudo test ! -e "$release_dir"
sudo mkdir -p "$release_dir"
sudo tar -xzf "$app_archive" -C "$release_dir"

if [[ ! -f "$shared_dir/data/app.sqlite" ]]; then
  [[ -n "$data_archive" && -f "$data_archive" ]] || { echo 'data archive required for first deployment' >&2; exit 1; }
  import_dir="$(mktemp -d)"
  trap 'rm -rf "$import_dir"' EXIT
  tar -xzf "$data_archive" -C "$import_dir"
  sudo install -m 600 "$import_dir/app.sqlite" "$shared_dir/data/app.sqlite"
  sudo cp -a "$import_dir/data/azurite/." "$shared_dir/data/azurite/"
  rm -rf "$import_dir"
  trap - EXIT
fi

if ! sudo find "$gallery_dir" -type f -print -quit | grep -q .; then
  gallery_import_dir="$(mktemp -d)"
  trap 'rm -rf "$gallery_import_dir"' EXIT
  mkdir -p "$gallery_import_dir/images"
  if sudo docker inspect pic365-app >/dev/null 2>&1; then
    sudo docker cp pic365-app:/app/dist/images/. "$gallery_import_dir/images/"
  elif [[ -d "$release_dir/dist/images" ]]; then
    cp -a "$release_dir/dist/images/." "$gallery_import_dir/images/"
  else
    echo 'gallery bootstrap source is unavailable' >&2
    exit 1
  fi
  sudo cp -a "$gallery_import_dir/images/." "$gallery_dir/"
  rm -rf "$gallery_import_dir"
  trap - EXIT
fi

if [[ -n "$gallery_archive" ]]; then
  [[ -f "$gallery_archive" ]] || { echo 'gallery delta archive not found' >&2; exit 1; }
  gallery_delta_dir="$(mktemp -d)"
  gallery_backup_dir="$(mktemp -d)"
  trap 'rm -rf "$gallery_delta_dir" "$gallery_backup_dir"' EXIT
  tar -xzf "$gallery_archive" -C "$gallery_delta_dir"
  [[ -d "$gallery_delta_dir/images" ]] || { echo 'gallery delta must contain images/' >&2; exit 1; }
  while IFS= read -r -d '' source; do
    relative="${source#"$gallery_delta_dir/images/"}"
    target="$gallery_dir/$relative"
    if sudo test -f "$target"; then
      mkdir -p "$gallery_backup_dir/$(dirname "$relative")"
      sudo cp -a "$target" "$gallery_backup_dir/$relative"
    fi
    sudo mkdir -p "$(dirname "$target")"
    sudo install -m 644 "$source" "$target"
  done < <(find "$gallery_delta_dir/images" -type f -print0)
  if find "$gallery_backup_dir" -type f -print -quit | grep -q .; then
    tar -czf "/tmp/gallery-before-$release.tar.gz" -C "$gallery_backup_dir" .
    sudo mv "/tmp/gallery-before-$release.tar.gz" "$shared_dir/backups/gallery-before-$release.tar.gz"
  fi
  rm -rf "$gallery_delta_dir" "$gallery_backup_dir"
  trap - EXIT
fi

gallery_count="$(sudo find "$gallery_dir" -type f | wc -l)"
[[ "$gallery_count" -gt 0 ]] || { echo 'persistent gallery is empty' >&2; exit 1; }
sudo chmod -R a+rX "$shared_dir/gallery"

if [[ -f "$env_file" ]]; then
  sudo cp -a "$env_file" "$shared_dir/backups/env-$release"
fi
if [[ -f "$deploy_env" ]]; then
  sudo cp -a "$deploy_env" "$shared_dir/backups/deploy-env-before-$release"
fi
if [[ -n "$env_source" ]]; then
  [[ -f "$env_source" ]] || { echo 'environment source not found' >&2; exit 1; }
  sudo install -m 600 "$env_source" "$env_file.new"
elif [[ -f "$env_file" ]]; then
  sudo cp -a "$env_file" "$env_file.new"
else
  echo 'environment source required for first deployment' >&2
  exit 1
fi
sudo sed -i 's/\r$//' "$env_file.new"

read_env_value() {
  local file="$1"
  local key="$2"
  sudo sed -n "s/^${key}=//p" "$file" 2>/dev/null | head -n 1
}

if [[ ! -f "$storage_env" ]]; then
  storage_connection="$(read_env_value "$env_file.new" AZURE_STORAGE_CONNECTION_STRING)"
  storage_container="$(read_env_value "$env_file.new" AZURE_STORAGE_CONTAINER)"
  storage_connection="${storage_connection:-UseDevelopmentStorage=true}"
  storage_container="${storage_container:-generated-images}"
  storage_env_temp="$(mktemp)"
  printf 'AZURE_STORAGE_CONNECTION_STRING=%s\nAZURE_STORAGE_CONTAINER=%s\n' \
    "$storage_connection" "$storage_container" > "$storage_env_temp"
  sudo install -m 600 "$storage_env_temp" "$storage_env"
  rm -f "$storage_env_temp"
fi

# Storage credentials are server-owned and must survive normal application releases.
sudo sed -i '/^AZURE_STORAGE_CONNECTION_STRING=/d; /^AZURE_STORAGE_CONTAINER=/d' "$env_file.new"

set_env() {
  local key="$1"
  local value="$2"
  if sudo grep -q "^${key}=" "$env_file.new"; then
    sudo sed -i "s|^${key}=.*$|${key}=${value}|" "$env_file.new"
  else
    printf '%s=%s\n' "$key" "$value" | sudo tee -a "$env_file.new" >/dev/null
  fi
}

set_env NODE_ENV production
set_env HOST 127.0.0.1
set_env PORT 5173
set_env APP_URL https://www.pic365.org
set_env APP_DB_PATH /app/data/app.sqlite
set_env LOCAL_STORAGE_ROOT /app/data/generated
provider_config_secret="$(read_env_value "$env_file.new" PROVIDER_CONFIG_SECRET)"
if [[ -z "$provider_config_secret" ]]; then
  provider_config_secret="$(openssl rand -hex 32)"
  set_env PROVIDER_CONFIG_SECRET "$provider_config_secret"
fi
sudo mv "$env_file.new" "$env_file"
sudo chmod 600 "$env_file"

sudo docker build \
  --file "$release_dir/deploy/pic365/Dockerfile" \
  --tag "$image" \
  "$release_dir"

# Validate the live database with the new runtime before switching code. This
# fails closed when queued/running generation work exists, so no user task is
# interrupted by a release.
sudo docker run --rm \
  --env-file "$env_file" \
  --volume "$shared_dir/data:/app/data" \
  "$image" \
  node scripts/inspect-production-db-safety.mjs /app/data/app.sqlite

# Create an online-consistent SQLite snapshot after the image build and as
# close as possible to the container switch. The snapshot is integrity-checked
# before any symlink or Compose state is changed.
database_backup="/app/data/backups/app-before-$release.sqlite"
sudo docker run --rm \
  --volume "$shared_dir/data:/app/data" \
  "$image" \
  node scripts/create-sqlite-backup.mjs /app/data/app.sqlite "$database_backup"
sudo docker run --rm \
  --volume "$shared_dir/data:/app/data" \
  "$image" \
  node scripts/check-sqlite.mjs "$database_backup"
sudo test -s "$shared_dir/data/backups/app-before-$release.sqlite"

storage_connection="$(read_env_value "$storage_env" AZURE_STORAGE_CONNECTION_STRING)"
if [[ "$storage_connection" == 'UseDevelopmentStorage=true' || "$storage_connection" == *devstoreaccount1* ]]; then
  sudo docker pull mcr.microsoft.com/azure-storage/azurite:3.36.0
fi

if [[ -L "$root/current" ]]; then
  readlink -f "$root/current" | sudo tee "$shared_dir/backups/current-before-$release" >/dev/null
fi
sudo ln -sfn "$release_dir" "$root/current.next"
sudo mv -Tf "$root/current.next" "$root/current"
printf 'PIC365_IMAGE=%s\n' "$image" | sudo tee "$deploy_env.new" >/dev/null
sudo mv "$deploy_env.new" "$deploy_env"
rollback_armed=1

compose=(
  sudo docker compose
  --env-file "$deploy_env"
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
    rollback_armed=0
    exit 0
  fi
  sleep 2
done

sudo docker logs --tail 100 pic365-app >&2 || true
false
