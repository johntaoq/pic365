import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url, child, output) {
  let lastResponse = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`SERVER_EXITED: ${output.join('')}`);
    try {
      const response = await fetch(url);
      lastResponse = { status: response.status, body: await response.text() };
      if (response.ok) return;
    } catch {
      // Startup has not completed yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`SERVER_START_TIMEOUT: ${JSON.stringify(lastResponse)} ${output.join('')}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

test('production HTTP wrapper keeps streamed asset responses open through completion', { timeout: 30000 }, async () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-production-http-'));
  const port = await availablePort();
  const output = [];
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_DB_PATH: path.join(tempDirectory, 'app.sqlite'),
      LOCAL_STORAGE_ROOT: path.join(tempDirectory, 'storage'),
      AZURE_STORAGE_CONNECTION_STRING: '',
      PROVIDER_CONFIG_SECRET: 'production-http-provider-secret',
      SESSION_SECRET: 'production-http-session-secret',
      EMAIL_VERIFICATION_SECRET: 'production-http-email-secret',
      PIC365_ALLOW_TEST_EMAIL_TRANSPORT: 'true',
      EMAIL_VERIFICATION_TRANSPORT: 'test',
      AI_API_KEY: 'test-provider-key',
      AI_BASE_URL: 'https://provider.example.invalid',
      AI_IMAGE_MODEL: 'gpt-image-2'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk) => output.push(chunk.toString('utf8')));
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(`${baseUrl}/api/health`, child, output);
    const codeResponse = await fetch(`${baseUrl}/api/auth/send-verification-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'stream@example.com', language: 'en' })
    });
    assert.equal(codeResponse.status, 200);
    const verificationCode = (await codeResponse.json()).previewCode;
    assert.match(verificationCode, /^\d{6}$/);
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'stream@example.com', password: 'testing-1234', fullName: 'Stream Test', verificationCode })
    });
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('member_session='));

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGNkYPjPgA0wYRUAAAwAAf4B+ZQAAAAASUVORK5CYII=', 'base64');
    const upload = await fetch(`${baseUrl}/api/assets?fileName=stream-download`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'image/png' },
      body: png
    });
    assert.equal(upload.status, 201);
    const asset = (await upload.json()).asset;
    assert.ok(asset?.id);

    const ranged = await fetch(`${baseUrl}/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=original`, {
      headers: { cookie, range: 'bytes=0-9' }
    });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers.get('content-range'), `bytes 0-9/${png.length}`);
    assert.equal((await ranged.arrayBuffer()).byteLength, 10);

    const suffix = await fetch(`${baseUrl}/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=original`, {
      headers: { cookie, range: 'bytes=-8' }
    });
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 8);

    const full = await fetch(`${baseUrl}/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=original`, {
      headers: { cookie }
    });
    assert.equal(full.status, 200);
    assert.equal((await full.arrayBuffer()).byteLength, png.length);

    const download = await fetch(`${baseUrl}/api/assets/file?id=${encodeURIComponent(asset.id)}&variant=original&download=1`, {
      headers: { cookie }
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition') || '', /attachment;/);
    assert.match(download.headers.get('content-disposition') || '', /filename\*=UTF-8''stream-download\.png/);
    assert.equal(download.headers.get('content-type'), 'image/png');
    assert.equal((await download.arrayBuffer()).byteLength, png.length);
  } finally {
    await stopChild(child);
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
