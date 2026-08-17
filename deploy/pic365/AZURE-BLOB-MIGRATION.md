# Pic365 Azure Blob migration

The production application stores its active storage configuration in:

```text
/opt/pic365/shared/storage.env
```

Do not place Azure account keys in Git, release archives, shell history, or chat messages.

## Required destination

- Azure region: Japan East
- Storage type: Standard general-purpose v2
- Container: `generated-images`
- Container access: Private
- Access tier: Hot
- Secure transfer required: Enabled
- Minimum TLS: 1.2 or later

## Migration sequence

1. Keep the application running against Azurite.
2. Create `/opt/pic365/shared/storage.next.env` with mode `600` and these keys:

   ```text
   AZURE_STORAGE_CONNECTION_STRING=<destination connection string>
   AZURE_STORAGE_CONTAINER=generated-images
   ```

3. Run the migration tool from the current application image, using a temporary root-only Docker env file
   that maps the current Azurite connection to `SOURCE_STORAGE_CONNECTION_STRING` and the new Azure
   connection to `DESTINATION_STORAGE_CONNECTION_STRING`.
4. Run `--verify-only` and require every source blob to match the destination by path, byte length, and MD5.
5. Back up `storage.env`, atomically replace it with `storage.next.env`, and restart only `pic365-app`.
6. Verify historical reads, a new generation, a project-asset upload, and deletion of a disposable test blob.
7. Keep Azurite and `/opt/pic365/shared/data/azurite` unchanged during the rollback window.

Rollback is an atomic restore of the previous `storage.env`, followed by restarting `pic365-app`.
