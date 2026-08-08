import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import sharp from 'sharp';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'awesome-gpt-image-render-'));
process.env.LOCAL_STORAGE_ROOT = tempDirectory;
const sourcePath = 'fixtures/source.png';
const logoPath = 'fixtures/logo.png';
fs.mkdirSync(path.join(tempDirectory, 'fixtures'), { recursive: true });
await sharp({ create: { width: 900, height: 1100, channels: 4, background: '#f8f8f8' } })
  .composite([{ input: Buffer.from('<svg width="900" height="1100"><rect x="250" y="180" width="400" height="720" rx="80" fill="#b7a58d"/></svg>') }])
  .png()
  .toFile(path.join(tempDirectory, sourcePath));
await sharp({ create: { width: 280, height: 90, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: Buffer.from('<svg width="280" height="90"><text x="10" y="62" font-size="46" font-family="Arial" font-weight="700" fill="#1b2940">BRAND</text></svg>') }])
  .png()
  .toFile(path.join(tempDirectory, logoPath));

const { analyzeDeliverySource, renderDeliveryDocument, renderDetailPage } = await import('../api/_lib/ecommerce-renderer.js');

after(() => fs.rmSync(tempDirectory, { recursive: true, force: true }));

const document = {
  targetWidth: 1024,
  targetHeight: 1024,
  outputFormat: 'png',
  documentType: 'benefit',
  themeId: 'glass-dark',
  layoutId: 'bottom-left',
  safeArea: true,
  content: {
    headline: 'Lightweight daily bottle',
    subtitle: 'Titanium construction',
    price: '$29.99',
    badge: 'NEW',
    bullets: ['500 ml', 'Leak resistant'],
    dimensions: {},
    comparison: {},
    packageItems: [],
    variants: [],
    steps: [],
    logoAssetId: 'logo'
  },
  advanced: {
    showText: true,
    imageFit: 'cover',
    overlayOpacity: 0.64,
    maskOpacity: 0.64,
    textOpacity: 0.82,
    maskBox: { x: 0.08, y: 0.58, width: 0.7, height: 0.34 },
    textBox: { x: 0.13, y: 0.63, width: 0.59, height: 0.24 },
    contentWidth: 0.7,
    padding: 0.055
  }
};

test('renderer creates exact delivery dimensions with structured overlays', async () => {
  const rendered = await renderDeliveryDocument({ document, sourceStoragePath: sourcePath, logoStoragePath: logoPath });
  const metadata = await sharp(rendered.bytes).metadata();
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(rendered.contentType, 'image/png');
  assert.ok(rendered.bytes.length > 10_000);
});

test('source analysis detects resolution and light corners', async () => {
  const diagnostics = await analyzeDeliverySource(sourcePath);
  assert.equal(diagnostics.sourceWidth, 900);
  assert.equal(diagnostics.sourceHeight, 1100);
  assert.ok(diagnostics.whiteCornerRatio > 0.8);
});

test('detail-page renderer joins delivery images vertically', async () => {
  const first = await renderDeliveryDocument({ document, sourceStoragePath: sourcePath });
  const longImage = await renderDetailPage([first, first], 800);
  const metadata = await sharp(longImage).metadata();
  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 1600);
});
