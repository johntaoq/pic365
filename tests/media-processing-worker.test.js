import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-media-worker-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.ASSET_QUOTA_BYTES = String(512 * 1024 * 1024);
delete process.env.ASSET_PROCESSING_INLINE;
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [db, media] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/media-assets.js')
]);
const owner = db.createUser({ email: 'media-worker@example.com', password: 'testing-1234', fullName: 'Media Worker' });

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('video uploads persist immediately and complete variants through a durable queued job', { timeout: 120000 }, async () => {
  const videoPath = path.join(tempDirectory, 'queued.mp4');
  await execFileAsync(ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'color=c=0x0f766e:s=320x240:d=0.6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6', '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', videoPath
  ], { windowsHide: true });
  const created = await media.createUploadedAsset(owner.id, {
    bytes: fs.readFileSync(videoPath),
    mimeType: 'video/mp4',
    fileName: 'queued.mp4'
  });
  assert.equal(created.status, 'processing');
  assert.deepEqual(created.variants.map((variant) => variant.type), ['original']);
  const jobs = media.claimAssetProcessingJobs(1);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].assetId, created.id);
  const processed = await media.processAssetProcessingJob(jobs[0]);
  assert.equal(processed.status, 'ready');
  assert.ok(processed.variants.some((variant) => variant.type === 'preview'));
  assert.ok(processed.variants.some((variant) => variant.type === 'poster'));
  const job = db.getDb().prepare('SELECT status, progress FROM asset_processing_jobs WHERE id = ?').get(jobs[0].id);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.progress, 100);
});
