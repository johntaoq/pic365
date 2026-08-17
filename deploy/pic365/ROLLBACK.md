# pic365 rollback

The first production release is `20260811-132842` using image `pic365:20260811-132842`.

To remove only the pic365 service without affecting `new-api`:

```bash
sudo docker compose \
  --env-file /opt/pic365/shared/deploy.env \
  --file /opt/pic365/current/deploy/pic365/docker-compose.yml \
  --project-name pic365 down
sudo rm -f /etc/nginx/sites-enabled/pic365
sudo nginx -t
sudo systemctl reload nginx
```

Persistent application state is under `/opt/pic365/shared/data` and the shared gallery is under
`/opt/pic365/shared/gallery/images`. Neither directory may be deleted during rollback. Normal code
releases intentionally exclude `dist/images`; the container receives the gallery through a read-only mount.

The active image-storage configuration is kept separately in `/opt/pic365/shared/storage.env` so normal
application deployments cannot overwrite it. Keep the previous Azurite configuration as
`/opt/pic365/shared/storage.azurite.env` during the Azure Blob migration rollback window.

Every normal release stores the previous current-release path, deployment image file and application
environment under `/opt/pic365/shared/backups`. To roll back a failed release without touching SQLite,
the gallery or Blob storage:

```bash
sudo bash /opt/pic365/releases/FAILED_RELEASE/deploy/pic365/rollback-remote.sh FAILED_RELEASE
```

`deploy-remote.sh` invokes this rollback automatically when the application switch or startup health
check fails. Post-deployment business verification must invoke the same command before reporting a
failed release.
