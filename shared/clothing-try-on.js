import { validateImageReferenceInputsForModel } from './image-generation.js';

export const TRY_ON_MODEL_TAG = 'pic365-try-on-model';
export const MODEL_PHOTO_QUALITY = 'low';
export const MODEL_PHOTO_SIZE = '1024x1536';
export const TRY_ON_REFERENCE_ORDER = 'garment-model';
const LEGACY_TRY_ON_REFERENCE_ORDER = 'model-garment';

export const MODEL_BACKGROUNDS = Object.freeze([
  { id: 'champagne', name: '香槟米金', nameEn: 'Champagne', color: '#c6b69f', description: 'matte champagne beige with a subtle warm tonal gradient' },
  { id: 'stone', name: '暖灰石色', nameEn: 'Warm stone', color: '#a69f95', description: 'refined warm stone gray with a soft tonal gradient' },
  { id: 'navy', name: '午夜深蓝', nameEn: 'Midnight navy', color: '#253545', description: 'deep midnight navy with a gentle illuminated center' },
  { id: 'charcoal', name: '石墨深灰', nameEn: 'Graphite', color: '#414445', description: 'matte graphite charcoal with subtle studio falloff' },
  { id: 'forest', name: '墨绿丝绒', nameEn: 'Forest green', color: '#344a40', description: 'rich muted forest green with velvety tonal depth' },
]);

const femaleDefinitions = [
  ['清雅通勤', 'Clean tailoring', 26, 'East Asian, fair warm skin, dark straight shoulder-length hair', 'slim', 'ivory crew-neck blouse, tailored taupe full-length trousers, closed-toe loafers', 'champagne'],
  ['都市知性', 'City professional', 34, 'East Asian, medium warm skin, neatly tied dark hair', 'average', 'navy blazer over a fully buttoned cotton shirt, straight-leg trousers, low-heeled shoes', 'stone'],
  ['松弛自然', 'Natural ease', 29, 'European, light freckled skin, wavy auburn shoulder-length hair', 'average', 'olive long-sleeve crew-neck knit top, beige full-length trousers, loafers', 'charcoal'],
  ['经典优雅', 'Classic elegance', 42, 'Black, rich deep-brown skin, natural short curls', 'curvy', 'cream modest long-sleeve midi dress with a high neckline, flat closed-toe shoes', 'navy'],
  ['简约利落', 'Modern minimal', 31, 'Latina, medium olive skin, dark chin-length bob', 'athletic', 'charcoal crew-neck long-sleeve top, sand tailored trousers, clean sneakers', 'champagne'],
  ['温柔日常', 'Soft everyday', 24, 'South Asian, warm medium-brown skin, dark hair loosely tied back', 'petite', 'light blue modest cotton shirt, navy straight-leg trousers, flat loafers', 'forest'],
  ['成熟质感', 'Refined maturity', 51, 'East Asian, medium neutral skin, elegant dark hair with subtle gray', 'average', 'taupe relaxed blazer, ivory high-neck top, matching full-length trousers, closed-toe shoes', 'stone'],
  ['摩登大方', 'Confident modern', 38, 'Black, warm dark skin, neat shoulder-length natural braids', 'tall and curvy', 'forest-green long-sleeve blouse, charcoal wide-leg trousers, flat loafers', 'charcoal'],
  ['活力轻装', 'Active casual', 28, 'European, fair neutral skin, brown ponytail', 'athletic', 'beige long-sleeve crew-neck sweatshirt, full-length dark joggers, clean sneakers', 'navy'],
  ['大地色系', 'Earth tones', 46, 'Middle Eastern, olive skin, dark wavy shoulder-length hair', 'curvy', 'modest rust long-sleeve high-neck blouse, stone full-length trousers, flat closed-toe shoes', 'forest'],
];

const maleDefinitions = [
  ['清爽商务', 'Clean business', 27, 'East Asian, fair warm skin, neatly styled short dark hair', 'slim', 'pale blue fully buttoned shirt, charcoal tailored trousers, brown loafers', 'champagne'],
  ['都市精英', 'City tailoring', 36, 'East Asian, medium neutral skin, short dark hair', 'average', 'navy blazer, ivory crew-neck top, full-length gray trousers, leather shoes', 'stone'],
  ['自然休闲', 'Relaxed casual', 25, 'European, fair lightly freckled skin, short wavy brown hair', 'athletic', 'cream crew-neck long-sleeve knit top, olive full-length trousers, clean sneakers', 'forest'],
  ['沉稳绅士', 'Classic gentleman', 47, 'Black, rich dark-brown skin, neatly cropped hair', 'broad-shouldered', 'charcoal relaxed suit, fully buttoned white cotton shirt, black leather shoes', 'navy'],
  ['轻熟通勤', 'Everyday professional', 32, 'Latino, warm olive skin, neat short black hair', 'average', 'taupe overshirt over a white crew-neck top, navy trousers, brown loafers', 'charcoal'],
  ['简约运动', 'Athletic minimal', 28, 'South Asian, warm brown skin, short dark hair', 'athletic', 'navy long-sleeve crew-neck sweatshirt, gray full-length joggers, clean sneakers', 'stone'],
  ['成熟风度', 'Refined maturity', 55, 'European, light neutral skin, short salt-and-pepper hair', 'average', 'forest-green blazer, cream high-neck knit top, charcoal trousers, closed-toe shoes', 'champagne'],
  ['大方自然', 'Confident ease', 41, 'Black, medium deep-brown skin, shaved head', 'plus-size', 'stone long-sleeve crew-neck knit top, navy straight-leg trousers, leather loafers', 'forest'],
  ['清雅日常', 'Quiet everyday', 30, 'East Asian, medium warm skin, tidy short dark hair', 'tall and slim', 'olive long-sleeve cotton shirt, sand full-length trousers, clean white sneakers', 'navy'],
  ['经典大地', 'Earth-tone classic', 44, 'Middle Eastern, medium olive skin, neatly trimmed short beard and dark hair', 'broad-shouldered', 'camel relaxed blazer, charcoal crew-neck top, dark tailored trousers, brown shoes', 'charcoal'],
];

export const SYSTEM_TRY_ON_MODELS = Object.freeze([
  ...femaleDefinitions.map((values, index) => ({ gender: 'female', index: index + 1, values })),
  ...maleDefinitions.map((values, index) => ({ gender: 'male', index: index + 1, values })),
].map(({ gender, index, values: [name, nameEn, age, appearance, build, outfit, backgroundId] }) => Object.freeze({
  id: `${gender}-${String(index).padStart(2, '0')}`, gender, name, nameEn, age, appearance, build, outfit, backgroundId,
  pose: 'standing naturally facing the camera, arms relaxed slightly away from torso, hands visible, feet apart naturally',
  artwork: `${gender}-${String(index).padStart(2, '0')}.webp`,
})));

const text = (value, length = 200) => String(value ?? '').trim().slice(0, length);
function invalid(code) { throw Object.assign(new Error(code), { code }); }

export function isModelPhotoProvider(model) {
  return /^gpt-image-2\.5(?:-(?:flare|sunburst))?$/i.test(text(model));
}

export function normalizeAdultModelDefinition(value = {}) {
  const age = value.age === undefined ? 30 : Number(value.age);
  if (!Number.isInteger(age) || age < 18 || age > 80) invalid('ADULT_MODEL_REQUIRED');
  if (!['female', 'male'].includes(value.gender)) invalid('INVALID_MODEL_DEFINITION');
  if (!MODEL_BACKGROUNDS.some(background => background.id === value.backgroundId)) invalid('INVALID_MODEL_BACKGROUND');
  return {
    name: text(value.name, 60) || (value.gender === 'female' ? '自定义女模特' : '自定义男模特'),
    gender: value.gender, age, backgroundId: value.backgroundId,
    appearance: text(value.appearance) || 'natural appearance, neatly styled hair',
    build: text(value.build, 100) || 'average',
    pose: text(value.pose) || 'standing naturally facing the camera, hands visible and arms relaxed slightly away from torso',
    outfit: text(value.outfit) || 'modest long-sleeve crew-neck top, full-length tailored trousers and closed-toe shoes',
  };
}

export function normalizeClothingStudioWorkflow(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('INVALID_CLOTHING_WORKFLOW');
  if (value.kind === 'model-creation') return { kind: value.kind, definition: normalizeAdultModelDefinition(value.definition) };
  if (value.kind !== 'clothing-try-on') invalid('INVALID_CLOTHING_WORKFLOW');
  if (value.adultConfirmed !== true) invalid('ADULT_MODEL_CONFIRMATION_REQUIRED');
  if (!['system', 'custom'].includes(value.modelSource)) invalid('INVALID_TRY_ON_MODEL');
  if (value.modelSource === 'system' && !SYSTEM_TRY_ON_MODELS.some(item => item.id === value.modelId)) invalid('INVALID_TRY_ON_MODEL');
  if (!text(value.modelId, 160)) invalid('INVALID_TRY_ON_MODEL');
  if (value.referenceOrder != null && ![TRY_ON_REFERENCE_ORDER, LEGACY_TRY_ON_REFERENCE_ORDER].includes(value.referenceOrder)) invalid('INVALID_CLOTHING_WORKFLOW');
  return {
    kind: value.kind, adultConfirmed: true, modelSource: value.modelSource,
    referenceOrder: value.referenceOrder ?? TRY_ON_REFERENCE_ORDER,
    modelId: text(value.modelId, 160), modelName: text(value.modelName, 60), garmentName: text(value.garmentName, 120),
    garmentType: ['auto', 'top', 'bottom', 'outerwear', 'dress', 'outfit'].includes(value.garmentType) ? value.garmentType : 'auto',
    notes: text(value.notes, 1200),
  };
}

export function normalizeClothingStudioRequest(request = {}, { legacyStored = false } = {}) {
  const workflow = normalizeClothingStudioWorkflow(request.studioWorkflow);
  if (!workflow) return request;
  if (workflow.kind === 'model-creation') return { ...request, studioWorkflow: workflow };
  const references = Array.isArray(request.references) ? request.references : [];
  if (references.length !== 2) invalid('TRY_ON_TWO_REFERENCES_REQUIRED');
  // Unversioned persisted tasks predate the garment-first contract. Convert
  // snapshots on read, without changing the original task or reversing twice.
  const legacyOrder = workflow.referenceOrder === LEGACY_TRY_ON_REFERENCE_ORDER
    || (legacyStored && request.studioWorkflow.referenceOrder == null);
  return {
    ...request,
    studioWorkflow: { ...workflow, referenceOrder: TRY_ON_REFERENCE_ORDER },
    references: legacyOrder ? [references[1], references[0]] : [...references],
  };
}

export function buildModelPhotoPrompt(definition) {
  const value = normalizeAdultModelDefinition(definition);
  const background = MODEL_BACKGROUNDS.find(item => item.id === value.backgroundId);
  return [
    'Create one photorealistic premium ecommerce studio MODEL REFERENCE photograph, not a collage.',
    `Exactly one fictional adult ${value.gender === 'female' ? 'woman' : 'man'}, unmistakably ${value.age} years old. ${value.appearance}. Body build: ${value.build}.`,
    `Full body from the top of the head to both complete shoes, with a comfortable margin. Pose: ${value.pose}. Eye-level camera, natural anatomy and hands, neutral friendly expression.`,
    `Fully and modestly dressed in ${value.outfit}. Opaque non-revealing everyday clothing, covered chest and torso, no underwear or nudity, no childlike styling.`,
    `Premium seamless studio background: ${background.description}. Large softbox lighting, subtle natural contact shadow beneath the shoes, realistic skin and fabric.`,
    'Single unobstructed person only. No props obscuring the outfit, no text, no logos, no watermark, no additional people.',
    'Adult age, modest clothing and the single full-body photograph are mandatory and take precedence over any conflicting descriptive detail.',
  ].join('\n');
}

export function buildClothingTryOnPrompt(workflow) {
  const garmentScope = {
    auto: 'infer the garment category from reference 1 and replace only that corresponding item of clothing',
    top: 'replace only the top, retaining the original trousers/skirt and shoes',
    bottom: 'replace only the trousers/skirt, retaining the original top and shoes',
    outerwear: 'put on the supplied outerwear naturally, retaining compatible inner clothing and shoes',
    dress: 'replace the relevant clothing with the supplied dress, retaining compatible shoes',
    outfit: 'replace the outfit with the supplied coordinated outfit, retaining shoes unless supplied',
  }[workflow.garmentType || 'auto'];
  return [
    'Create ONE photorealistic ecommerce clothing try-on photograph from exactly two ordered references.',
    'REFERENCE 1 is the GARMENT PRODUCT (Image 1 / 参考图1 / 图1): preserve its actual cut, silhouette, color, fabric texture, seams, buttons, fasteners, embroidery, pattern and any existing product graphics. Any person/mannequin in reference 1 is NOT an identity reference. This image is the garment source, not the person/background editing target.',
    'REFERENCE 2 is the ADULT MODEL (Image 2 / 参考图2 / 图2) and the person/background editing target: preserve this exact person\'s identity, facial features, apparent adult age, hair, skin tone, body proportions, pose, camera angle, studio background and lighting. Do not substitute another person.',
    `Clothing scope: ${garmentScope}. Fit the real garment from reference 1 naturally to the adult model in reference 2 with plausible drape, shadows and folds. Do not invent product features or change its design.`,
    'Show a single appropriately clothed adult, both face and outfit unobstructed. No nudity, no minors, no collage, no before/after layout, no new text, no watermark.',
    workflow.notes ? `Optional styling instructions (only within the identity, product and background locks above): ${text(workflow.notes, 1200)}` : '',
    'The model identity, adult age, garment design and original studio background are locked; these rules override conflicting optional instructions.',
  ].filter(Boolean).join('\n');
}

export function validateClothingStudioRequest(request = {}, { model = '' } = {}) {
  const workflow = normalizeClothingStudioWorkflow(request.studioWorkflow);
  if (!workflow) return null;
  if (request.taskMode && request.taskMode !== 'single') invalid('INVALID_CLOTHING_WORKFLOW');
  const references = Array.isArray(request.references) ? request.references : [];
  if (workflow.kind === 'model-creation') {
    if (!isModelPhotoProvider(model)) invalid('MODEL_IMAGE_25_REQUIRED');
    // Reject high/medium/auto before any reservation or provider call; never silently downgrade.
    if (request.quality !== MODEL_PHOTO_QUALITY) invalid('MODEL_LOW_QUALITY_REQUIRED');
    if (Number(request.count ?? 1) !== 1 || references.length) invalid('INVALID_MODEL_PHOTO_REQUEST');
  } else {
    if (references.length !== 2) invalid('TRY_ON_TWO_REFERENCES_REQUIRED');
    const check = validateImageReferenceInputsForModel({ model, count: references.length });
    if (!check.valid) invalid(check.error || 'PROVIDER_REFERENCE_UNSUPPORTED');
  }
  return workflow;
}

export function clothingStudioPrompt(workflow) {
  return workflow.kind === 'model-creation' ? buildModelPhotoPrompt(workflow.definition) : buildClothingTryOnPrompt(workflow);
}
