import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gallery = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const workspace = fs.readFileSync(new URL('../src/free-image-workspace.jsx', import.meta.url), 'utf8');

test('example cards and previews have no direct generation action', () => {
  const card = gallery.slice(gallery.indexOf('function PromptCard('), gallery.indexOf('function PreviewDialog('));
  const preview = gallery.slice(gallery.indexOf('function PreviewDialog('), gallery.indexOf('function CooperationPage('));
  assert.match(card, /onOpen\(caseItem\)/);
  assert.match(card, /onCopy\(caseItem\)/);
  assert.doesNotMatch(card, /onGenerate|generateTest/);
  assert.match(preview, /getSavedGeneration\(preview\.item\.id\)/);
  assert.match(preview, /onCopyText\(promptText, copyId\)/);
  assert.doesNotMatch(preview, /handleGenerate|generationPanel|useServerImagePricing|requestImagePricing/);
});

test('single and batch creation show no example gallery underneath the workspace', () => {
  assert.match(workspace, /switchCreationMode\('single'\)/);
  assert.match(workspace, /switchCreationMode\('batch-repair'\)/);
  assert.doesNotMatch(workspace, /className="createCaseLibrary"/);
  assert.doesNotMatch(workspace, /className="createCaseGrid"/);
});

test('homepage workspace action matches navigation typography without losing compact breakpoints', () => {
  const css = fs.readFileSync(new URL('../src/homepage.css', import.meta.url), 'utf8');
  const rule = css.match(/^\.homeNavActions button\.homeWorkspaceButton\s*\{([^}]+)\}/m)?.[1];
  assert.ok(rule);
  assert.match(rule, /font-family:\s*inherit/);
  assert.match(rule, /font-size:\s*14px/);
  assert.match(rule, /font-weight:\s*750/);
  assert.match(rule, /line-height:\s*1\.25/);
  assert.match(rule, /letter-spacing:\s*0/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*?\.homeNavActions button\.homeWorkspaceButton\s*\{[^}]*font-size:\s*12px/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*?\.homeNavActions button\.homeWorkspaceButton\s*\{[^}]*font-size:\s*11px/);
});
