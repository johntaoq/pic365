import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'data', 'images', 'avatars', 'animals');

const animals = [
  ['fox', '#f36b32', '#fff0d3', 'point', ''], ['cat', '#8a98aa', '#f4e9d8', 'point', 'whiskers'],
  ['dog', '#c88b53', '#fff1d5', 'flop', 'spot'], ['rabbit', '#f1b9c8', '#fff1f5', 'long', ''],
  ['panda', '#f5f5f1', '#ffffff', 'round', 'panda'], ['bear', '#9a6746', '#ead0ad', 'round', ''],
  ['tiger', '#f49b2f', '#ffe4b0', 'round', 'stripes'], ['lion', '#d99227', '#ffe0a0', 'mane', ''],
  ['koala', '#93a5ac', '#eef3f2', 'wide', ''], ['raccoon', '#77828d', '#e9edf0', 'point', 'mask'],
  ['deer', '#c78a52', '#f6dfbf', 'deer', 'spots'], ['owl', '#8c6a55', '#f2d49c', 'owl', ''],
  ['penguin', '#263747', '#ffffff', 'round', 'penguin'], ['duck', '#ffd84d', '#fff4a8', 'round', 'beak'],
  ['chick', '#ffd04a', '#fff1a0', 'round', 'beak'], ['frog', '#63be69', '#d7f39c', 'frog', ''],
  ['pig', '#f29aaa', '#ffd2d9', 'round', 'snout'], ['cow', '#f1eee7', '#fffdf8', 'cow', 'spots'],
  ['sheep', '#f7f3e9', '#fffdf7', 'sheep', ''], ['horse', '#a76f46', '#f0ceb0', 'horse', 'blaze'],
  ['monkey', '#a96f45', '#f2c999', 'round', 'monkey'], ['elephant', '#8fa5bb', '#d9e3eb', 'wide', 'trunk'],
  ['giraffe', '#e4aa48', '#ffe0a0', 'giraffe', 'spots'], ['hippo', '#9585a9', '#d6cbe2', 'round', 'snout'],
  ['crocodile', '#5eaa68', '#cce9a4', 'croc', 'teeth'], ['whale', '#4c92c6', '#bfe9f5', 'fin', ''],
  ['dolphin', '#68abc9', '#d5f2f8', 'fin', 'smile'], ['seal', '#9aadb3', '#e5eef0', 'round', 'whiskers'],
  ['squirrel', '#c97c3f', '#f6d4aa', 'point', 'tooth'], ['hedgehog', '#8c684a', '#f1cfa4', 'spike', '']
];

const ears = {
  point: '<path d="M30 48 24 12 54 34M98 48l6-36-30 22"/>',
  flop: '<path d="M35 43C12 30 10 57 26 70M93 43c23-13 25 14 9 27"/>',
  long: '<path d="M43 38C27 7 36 1 51 34M85 38C101 7 92 1 77 34"/>',
  round: '<circle cx="34" cy="38" r="17"/><circle cx="94" cy="38" r="17"/>',
  mane: '<circle cx="64" cy="66" r="55"/>',
  wide: '<circle cx="28" cy="49" r="20"/><circle cx="100" cy="49" r="20"/>',
  deer: '<path d="M38 39 27 18m12 9-18-4m69 16 11-21m-12 9 18-4"/><path d="M38 42 27 29 46 35M90 42l11-13-19 6"/>',
  owl: '<path d="M23 35 38 15l15 22M105 35 90 15 75 37"/>',
  frog: '<circle cx="37" cy="37" r="20"/><circle cx="91" cy="37" r="20"/>',
  cow: '<path d="M35 40 14 28q5 23 24 27M93 40l21-12q-5 23-24 27"/><path d="M37 39 29 20M91 39l8-19"/>',
  sheep: '<circle cx="30" cy="39" r="18"/><circle cx="48" cy="28" r="20"/><circle cx="70" cy="26" r="21"/><circle cx="92" cy="38" r="19"/>',
  horse: '<path d="M39 42 27 18 52 34M89 42l12-24-25 16"/>',
  giraffe: '<path d="M39 40 32 15M89 40l7-25"/><circle cx="31" cy="13" r="6"/><circle cx="97" cy="13" r="6"/>',
  croc: '<path d="M23 48 10 35l25 2M105 48l13-13-25 2"/>',
  fin: '<path d="M32 48 14 25l32 13M96 48l18-23-32 13"/>',
  spike: '<path d="m25 50-13-17 20 2-4-21 18 12 5-21 13 18L79 5l3 21 19-11-5 21 20-1-13 17"/>'
};

function feature(type, accent) {
  const dark = '#263238';
  if (type === 'whiskers') return '<path d="M45 78 17 71m28 13-29 7m67-13 28-7m-28 13 29 7" fill="none"/>';
  if (type === 'spot' || type === 'spots') return `<g fill="${dark}" opacity=".72"><circle cx="43" cy="55" r="10"/><circle cx="84" cy="43" r="6"/><circle cx="96" cy="72" r="5"/></g>`;
  if (type === 'panda') return `<g fill="${dark}"><ellipse cx="43" cy="60" rx="14" ry="18"/><ellipse cx="85" cy="60" rx="14" ry="18"/></g>`;
  if (type === 'stripes') return `<g fill="${dark}"><path d="m51 30 6 19 7-20 7 20 7-19"/><path d="m28 58 18 7-18 7m72-14-18 7 18 7"/></g>`;
  if (type === 'mask') return `<path d="M25 55q39-27 78 0-8 31-39 20-31 11-39-20Z" fill="${dark}" opacity=".8"/>`;
  if (type === 'penguin') return '<path d="M34 43q30-25 60 0l-10 61H44Z" fill="#fff"/>';
  if (type === 'beak') return '<path d="m53 76 11-9 11 9-11 9Z" fill="#f28c28"/>';
  if (type === 'snout') return `<ellipse cx="64" cy="82" rx="20" ry="14" fill="${accent}"/><circle cx="57" cy="82" r="3" fill="${dark}"/><circle cx="71" cy="82" r="3" fill="${dark}"/>`;
  if (type === 'blaze') return '<path d="M59 31h10l6 39-11 12-11-12Z" fill="#fff" opacity=".85"/>';
  if (type === 'monkey') return `<circle cx="38" cy="68" r="16" fill="${accent}"/><circle cx="90" cy="68" r="16" fill="${accent}"/>`;
  if (type === 'trunk') return `<path d="M57 76q14 0 14 13v21q0 11 11 5" fill="none" stroke="${accent}" stroke-width="13" stroke-linecap="round"/>`;
  if (type === 'teeth') return '<path d="m44 88 7 9 7-9 7 9 7-9 7 9 7-9" fill="#fff"/>';
  if (type === 'smile') return '<path d="M48 82q16 13 32 0" fill="none" stroke="#263238" stroke-width="4" stroke-linecap="round"/>';
  if (type === 'tooth') return '<path d="M58 84h12v14H58Z" fill="#fff"/>';
  return '';
}

function svg([id, primary, accent, ear, extra]) {
  const dark = '#263238';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${id} cartoon avatar">
  <rect width="128" height="128" rx="28" fill="#dff7ef"/>
  <g stroke="${dark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="${primary}">${ears[ear] || ears.round}</g>
  <circle cx="64" cy="68" r="46" fill="${primary}" stroke="${dark}" stroke-width="5"/>
${feature(extra, accent)}
  <ellipse cx="64" cy="80" rx="28" ry="23" fill="${accent}"/>
  <g fill="#fff" stroke="${dark}" stroke-width="4"><circle cx="47" cy="61" r="10"/><circle cx="81" cy="61" r="10"/></g>
  <g fill="${dark}"><circle cx="49" cy="63" r="4"/><circle cx="79" cy="63" r="4"/><ellipse cx="64" cy="78" rx="7" ry="5"/></g>
  <path d="M64 83q-8 10-16 2m16-2q8 10 16 2" fill="none" stroke="${dark}" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;
}

fs.mkdirSync(outputDir, { recursive: true });
for (const animal of animals) fs.writeFileSync(path.join(outputDir, `${animal[0]}.svg`), svg(animal));
console.log(`Generated ${animals.length} animal avatars in ${outputDir}`);
