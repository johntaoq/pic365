import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('content/homepage-tutorials');
const output = path.resolve('src/assets/homepage');

async function cropTo(source, target, extract, position = 'centre') {
  await sharp(path.join(root, source))
    .extract(extract)
    .resize(1200, 720, { fit: 'cover', position })
    .webp({ quality: 88, effort: 6 })
    .toFile(path.join(output, target));
}

await cropTo(
  '10-story-to-picture-book/steps/step-07.webp',
  'free-studio.webp',
  { left: 0, top: 45, width: 743, height: 446 },
  'north'
);

await cropTo(
  '03-one-product-five-campaigns/steps/step-03.webp',
  'batch-edit.webp',
  { left: 0, top: 0, width: 730, height: 610 },
  'north'
);

await cropTo(
  '10-story-to-picture-book/steps/step-05.webp',
  'task-list.webp',
  { left: 0, top: 55, width: 665, height: 399 },
  'north'
);

await cropTo(
  '08-canvas-video-storyboard/steps/step-04.webp',
  'canvas-history.webp',
  { left: 0, top: 58, width: 1430, height: 690 },
  'centre'
);

await cropTo(
  '01-backpack-store-set/steps/step-04.webp',
  'ecommerce-generate.webp',
  { left: 0, top: 0, width: 1010, height: 630 },
  'north'
);

await cropTo(
  '01-backpack-store-set/steps/step-06.webp',
  'ecommerce-delivery.webp',
  { left: 0, top: 45, width: 1010, height: 790 },
  'centre'
);

await cropTo(
  '10-story-to-picture-book/steps/step-07.webp',
  'inspiration-gallery.webp',
  { left: 0, top: 555, width: 743, height: 445 },
  'west'
);

console.log('Rebuilt 7 homepage screenshots from current tutorial captures.');
