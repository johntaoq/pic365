#!/usr/bin/env bash
set -Eeuo pipefail

probe() {
  local label="$1"
  local expected="$2"
  local url="$3"
  shift 3
  local status
  status="$(curl -sS -o /dev/null -w '%{http_code}' "$@" "$url")"
  printf '%-28s %s\n' "$label" "$status"
  [[ "$status" == "$expected" ]]
}

json_health() {
  local url="$1"
  local body
  body="$(curl -fsS --max-time 15 "$url")" || return 1
  [[ "$body" == \{* ]] || return 1
  grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$body" || return 1
  printf '%s\n' "$body"
}

probe 'pic365 homepage' 200 https://www.pic365.org/
probe 'pic365 cases json' 200 https://www.pic365.org/cases.json
probe 'pic365 style library' 200 https://www.pic365.org/style-library.json
probe 'pic365 static image' 200 https://www.pic365.org/images/case1.jpg
probe 'pic365 logo' 200 https://www.pic365.org/images/pic365-logo.png
probe 'pic365 pricing api' 200 https://www.pic365.org/api/image-pricing
echo 'pic365 health api'
json_health https://www.pic365.org/api/health
echo 'pic365 deep health'
json_health 'https://www.pic365.org/api/health?deep=1'
probe 'pic365 auth session' 200 https://www.pic365.org/api/auth/session
probe 'pic365 protected projects' 401 https://www.pic365.org/api/ecommerce/projects
probe 'pic365 protected assets' 401 https://www.pic365.org/api/assets
probe 'pic365 protected free tasks' 401 https://www.pic365.org/api/generation-tasks
probe 'pic365 protected cancel' 401 https://www.pic365.org/api/generation-tasks/cancel \
  -X POST -H 'Content-Type: application/json' --data '{}'
probe 'pic365 protected providers' 401 https://www.pic365.org/api/admin/image-providers
probe 'pic365 invalid login' 401 https://www.pic365.org/api/auth/login \
  -X POST -H 'Content-Type: application/json' --data '{"email":"missing@example.com","password":"not-a-real-password"}'
probe 'api2 status unchanged' 200 https://api2.unikeyx.com/api/status

echo '--- PROVIDER ---'
sudo docker exec -i pic365-app node --input-type=module <<'NODE'
const response = await fetch('http://127.0.0.1:5173/api/health?deep=1');
if (!response.ok) process.exit(1);
const health = await response.json();
const providers = health?.checks?.providers || [];
console.log(JSON.stringify({ count: providers.length, providers }));
if (!health.ok || !providers.length || providers.some((provider) => !provider.configured || !provider.reachable)) process.exit(1);
NODE

echo '--- TLS ---'
echo | openssl s_client -connect www.pic365.org:443 -servername www.pic365.org 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

echo '--- SERVICES ---'
sudo nginx -t
sudo docker ps --filter name=pic365 --format '{{.Names}}|{{.Image}}|{{.Status}}'
sudo systemctl is-enabled certbot.timer
sudo systemctl is-active certbot.timer
