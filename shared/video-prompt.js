export function buildVideoGenerationPrompt(userPrompt, { hasReference = false } = {}) {
  const request = String(userPrompt || '').trim();
  const common = [
    'Create one coherent, production-ready short video shot.',
    'Use stable motion, physically plausible lighting, consistent geometry, and clean temporal continuity.',
    'Do not add captions, watermarks, logos, labels, interface elements, or promotional claims unless the user explicitly requests them.',
    'Avoid sudden identity changes, duplicated objects, warped anatomy, flicker, frame tearing, and unintended camera cuts.',
    'Do not add spoken dialogue unless the user explicitly provides dialogue or asks for speech.'
  ];
  if (hasReference) common.unshift(
    'Use the supplied image as the only visual source of truth.',
    'Preserve the subject identity, shape, proportions, colors, materials, text, logos, packaging, accessories, and quantity exactly as shown.',
    'Animate the existing scene conservatively; do not redesign, replace, or invent product details.'
  );
  return `${common.join('\n')}\n\nUser request:\n${request}`;
}
