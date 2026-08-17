#!/usr/bin/env bash
set -Eeuo pipefail

config="${1:-/etc/nginx/sites-available/pic365}"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup="${config}.before-performance-${timestamp}"
temp="$(mktemp)"
trap 'rm -f "$temp"' EXIT

sudo test -f "$config"
sudo cp -a "$config" "$backup"

sudo python3 - "$config" <<'PY' > "$temp"
from pathlib import Path
import sys

source = Path(sys.argv[1])
text = source.read_text(encoding='utf-8')

if 'location ^~ /assets/' not in text:
    gzip = '''    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

'''
    marker = '    client_max_body_size 50m;\n\n'
    if marker not in text:
        raise SystemExit('client_max_body_size marker not found')
    text = text.replace(marker, marker + gzip, 1)

    static_locations = '''    location ^~ /assets/ {
        alias /opt/pic365/current/dist/assets/;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    location ^~ /images/ {
        alias /opt/pic365/shared/gallery/images/;
        add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800" always;
        access_log off;
    }

'''
    marker = '    location / {\n'
    if marker not in text:
        raise SystemExit('proxy location marker not found')
    text = text.replace(marker, static_locations + marker, 1)

text = text.replace('        proxy_buffering off;\n', '        proxy_buffering on;\n', 1)
text = text.replace('        expires 1y;\n', '')
text = text.replace(
    'add_header Cache-Control "public, max-age=31536000, immutable" always;\n        access_log off;\n    }\n\n    location / {',
    'add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800" always;\n        access_log off;\n    }\n\n    location / {',
    1,
)
sys.stdout.write(text)
PY

sudo install -m 644 "$temp" "$config"
if ! sudo nginx -t; then
  sudo cp -a "$backup" "$config"
  sudo nginx -t
  sudo systemctl reload nginx
  exit 1
fi
sudo systemctl reload nginx
printf 'nginx optimized; backup=%s\n' "$backup"
