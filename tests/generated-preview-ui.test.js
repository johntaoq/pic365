import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = fs.readFileSync(new URL('../src/free-image-workspace.jsx', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../src/generated-image-preview.jsx', import.meta.url), 'utf8');

test('main preview uses progressive variants and leaves original expansion and downloads unchanged', () => {
  const main = workspace.slice(workspace.indexOf('studioMainPreview'), workspace.indexOf('studioCurrentResults'));
  assert.match(main, /<GeneratedImagePreview\s+item=\{item\}/);
  assert.doesNotMatch(main, /src=\{item\.imageUrl\}/);
  assert.match(main, /href=\{item\.imageUrl\}/);
  assert.match(workspace, /src=\{previewImage\.imageUrl\}/);
  assert.match(component, /generatedImagePreviewSources\(item\)/);
  assert.match(component, /previewReady \? ready\.url : retryUrl\(thumbnail/);
  assert.match(component, /image\.decode/);
  assert.match(component, /clearTimeout\(timer\)/);
});
