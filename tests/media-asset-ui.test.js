import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../src/media-asset-search.css', import.meta.url), 'utf8');

function ruleFor(selector) {
  return css.split('}').find((block) => block.split('{')[0].split(',\n').map((item) => item.trim()).includes(selector))?.split('{')[1];
}

test('asset toolbar and pagination share the compact control typography', () => {
  const toolbar = ruleFor('.mediaAssetCenter .mediaAssetToolbar button');
  assert.equal(toolbar, ruleFor('.mediaAssetCenter .mediaAssetLoadMore'));
  assert.match(toolbar, /font-family:\s*inherit/);
  assert.match(toolbar, /font-size:\s*12px/);
  assert.match(toolbar, /font-weight:\s*650/);
  assert.match(toolbar, /letter-spacing:\s*0/);
  assert.match(toolbar, /border-radius:\s*8px/);
});

test('asset selected and hover states use theme tokens rather than dark-only colors', () => {
  const selected = ruleFor('.mediaAssetCenter .mediaAssetToolbar button.active:not(.mediaAssetUploadButton):not(.danger)');
  assert.match(selected, /color:\s*var\(--asset-search-accent\)/);
  assert.match(selected, /background:\s*var\(--asset-search-active\)/);
  assert.equal(selected, ruleFor('.mediaAssetCenter .mediaAssetLoadMore:hover:not(:disabled)'));
  const normal = ruleFor('.mediaAssetCenter .mediaAssetConfirmDialog button:not(.danger)');
  assert.match(normal, /color:\s*var\(--asset-search-ink\)/);
  assert.match(normal, /background:\s*var\(--asset-search-surface\)/);
  assert.match(css, /\.mediaAssetCenter \.mediaAssetLoadMore:disabled\s*\{[^}]*opacity:\s*\.58/);
  assert.ok(ruleFor('.mediaAssetCenter .mediaAssetLoadMore:focus-visible'));
});

test('asset light-theme actions, empty states and selected cards are theme-aware', () => {
  const upload = ruleFor('.siteThemeLight .mediaAssetCenter .mediaAssetToolbar button.mediaAssetUploadButton');
  assert.match(upload, /background:\s*var\(--asset-search-accent\)/);
  assert.match(upload, /color:\s*#fff/);
  assert.match(ruleFor('.mediaAssetCenter .mediaAssetEmpty'), /color:\s*var\(--asset-search-muted\)/);
  assert.match(ruleFor('.mediaAssetCenter .mediaAssetEmpty h2'), /color:\s*var\(--asset-search-ink\)/);
  assert.match(ruleFor('.siteThemeLight .mediaAssetCenter .mediaAssetCard.selectionMode.selected'), /border-color:\s*var\(--asset-search-accent\)/);
  assert.match(ruleFor('.siteThemeLight .mediaAssetCenter .mediaAssetConfirmDialog button.danger'), /color:\s*var\(--asset-search-error\)/);
});

test('asset management primary hover respects light and black themes', () => {
  const dialogCss = fs.readFileSync(new URL('../src/media-asset-management-dialog.css', import.meta.url), 'utf8');
  assert.match(dialogCss, /\.siteThemeLight \.mediaAssetManagementDialog \.mediaAssetManagementPrimary:hover:not\(:disabled\)\s*\{[^}]*background:\s*#0d5448;[^}]*color:\s*#fff/);
  assert.match(dialogCss, /\.siteThemeBlack \.mediaAssetManagementDialog \.mediaAssetManagementPrimary:hover:not\(:disabled\)\s*\{[^}]*color:\s*#00180a/);
});
