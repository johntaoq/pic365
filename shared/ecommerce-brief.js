export const AI_BRIEF_IDENTITY_FIELDS = [
  'structure',
  'colorsMaterials',
  'brandMarks',
  'packaging',
  'includedItems',
  'mustKeep',
  'mustAvoid'
];

const CONSTRAINT_PATTERN = /(?:核验|确认|检查|拍摄前|避免|不得|不要|禁止|必须|确保|仅限|以.+为准|未提供|未确认|宣称|适配所有|verify|confirm|check|before shooting|avoid|must|never|do not|only if|source of truth|claim all)/i;
const NEGATIVE_CONSTRAINT_PATTERN = /(?:避免|不得|不要|禁止|未提供|未确认|宣称|适配所有|avoid|never|do not|must not|unsupported|claim)/i;
const BRIEF_INSTRUCTION_PATTERN = /(?:拍摄前|核验|避免|不得|不要|禁止|必须|未确认|before shooting|verify|avoid|must not|do not)/i;
const STALE_AI_IDENTITY_PATTERN = /(?:当前无.{0,20}(?:证据|素材|参考图)|依据后续上传|需依据.{0,30}核验|不作猜测|未提供.{0,20}(?:证据|素材|参考图)|no .{0,20}(?:evidence|source image|reference image)|verify from (?:later )?uploaded|not provided.{0,20}(?:evidence|source image|reference image)|do not guess)/i;

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, maxLength);
}

function listEntries(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value || '').split(/\r?\n|[；;]/);
  return [...new Set(entries
    .map((item) => cleanText(String(item).replace(/^[-*•\d.、)\s]+/, ''), 1200))
    .filter(Boolean))];
}

export function countSellingPointWords(value, language = 'zh') {
  const text = cleanText(value, 200);
  if (!text) return 0;
  if (globalThis.Intl?.Segmenter) {
    const locale = language === 'zh' ? 'zh-CN' : 'en-US';
    return [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)]
      .filter((segment) => segment.isWordLike)
      .length;
  }
  return language === 'zh'
    ? (text.match(/[\p{Script=Han}]+|[A-Za-z0-9]+/gu) || []).length
    : (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length;
}

function isConciseSellingPoint(value, language) {
  const text = cleanText(value, 200);
  if (!text || CONSTRAINT_PATTERN.test(text)) return false;
  if (/[，,。.!！?？:：；;]/.test(text)) return false;
  return countSellingPointWords(text, language) <= 4;
}

export function normalizeAiSellingPoints(value, language = 'zh') {
  return listEntries(value)
    .filter((item) => isConciseSellingPoint(item, language))
    .slice(0, 4)
    .join('\n');
}

export function normalizeAiIdentitySpec(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    AI_BRIEF_IDENTITY_FIELDS
      .map((field) => [field, cleanText(value[field], field === 'mustKeep' || field === 'mustAvoid' ? 1600 : 1200)])
      .filter(([, content]) => Boolean(content))
  );
}

export function mergeRefreshedAiIdentitySpec(currentValue, generatedValue, originalValue) {
  const current = normalizeAiIdentitySpec(currentValue);
  const generated = normalizeAiIdentitySpec(generatedValue);
  const originals = normalizeAiIdentitySpec(originalValue);
  const identitySpec = { ...current };
  const aiOriginals = { ...originals };
  const replacedFields = [];
  for (const field of AI_BRIEF_IDENTITY_FIELDS) {
    const next = String(generated[field] || '').trim();
    if (!next) continue;
    const existing = String(current[field] || '').trim();
    const original = String(originals[field] || '').trim();
    const replaceable = !existing || (original && existing === original) || STALE_AI_IDENTITY_PATTERN.test(existing);
    if (!replaceable) continue;
    identitySpec[field] = next;
    aiOriginals[field] = next;
    replacedFields.push(field);
  }
  return { identitySpec, aiOriginals, replacedFields };
}

function rejectedSellingPointRules(value, language) {
  const rejected = listEntries(value)
    .filter((item) => !isConciseSellingPoint(item, language))
    .filter((item) => CONSTRAINT_PATTERN.test(item));
  const mustKeep = rejected.filter((item) => !NEGATIVE_CONSTRAINT_PATTERN.test(item));
  const mustAvoid = rejected.filter((item) => NEGATIVE_CONSTRAINT_PATTERN.test(item));
  return {
    ...(mustKeep.length ? { mustKeep: mustKeep.join('\n').slice(0, 1600) } : {}),
    ...(mustAvoid.length ? { mustAvoid: mustAvoid.join('\n').slice(0, 1600) } : {})
  };
}

function mergeRuleText(base, extra) {
  return [...new Set([base, extra].map((item) => cleanText(item, 1600)).filter(Boolean))].join('\n').slice(0, 1600);
}

export function normalizeEcommerceAiBrief(value, { language = 'zh' } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const sellingPoints = normalizeAiSellingPoints(value.sellingPoints, language);
  const identitySpec = normalizeAiIdentitySpec(value.identitySpec || value.compositionRules);
  const routedRules = rejectedSellingPointRules(value.sellingPoints, language);
  const brief = {
    coreUser: cleanText(value.coreUser || value.targetAudience, 1000),
    coreScenario: cleanText(value.coreScenario, 1000),
    sellingPoints,
    identitySpec: {
      ...identitySpec,
      ...(routedRules.mustKeep ? { mustKeep: mergeRuleText(identitySpec.mustKeep, routedRules.mustKeep) } : {}),
      ...(routedRules.mustAvoid ? { mustAvoid: mergeRuleText(identitySpec.mustAvoid, routedRules.mustAvoid) } : {})
    }
  };
  if (BRIEF_INSTRUCTION_PATTERN.test(brief.coreUser) || BRIEF_INSTRUCTION_PATTERN.test(brief.coreScenario)) return null;
  return brief.coreUser && brief.coreScenario && brief.sellingPoints ? brief : null;
}

export function buildFallbackEcommerceBrief({ language = 'zh', industryName, productName, brandName }) {
  if (language === 'zh') {
    return {
      coreUser: `关注${industryName}产品外观、使用体验和信息透明度的潜在消费者。`,
      coreScenario: '适用于日常使用、内容种草、礼赠选择及电商购买决策等场景。',
      sellingPoints: ['清晰识别', '真实质感', '便捷使用', '场景适配'].join('\n'),
      identitySpec: {
        structure: `拍摄前核验${productName}的真实外形、比例、可动部件和调节方式；所有画面必须与商品素材一致。`,
        colorsMaterials: '颜色、材质和表面处理以商品母版为准；未核验的信息不得写入画面。',
        brandMarks: brandName
          ? `仅使用用户提供并已获授权的${brandName}品牌标识，保持位置、比例和字形一致。`
          : '不要自行添加品牌、Logo、商标或包装文字。',
        packaging: '包装结构、标签、封口、颜色和原有文字位置以真实包装图为准；未提供时不得虚构。',
        includedItems: '仅展示素材中明确存在的配件及数量；未确认时不得添加赠品或额外部件。',
        mustKeep: '保持商品外形、比例、颜色、关键结构、调节部件和配件数量一致。',
        mustAvoid: '不得宣称未经核验的材质、承重、尺寸、兼容性、功效或认证；避免添加不存在的结构、文字和配件。'
      }
    };
  }
  return {
    coreUser: `Potential ${industryName} customers who value clear product information and practical use.`,
    coreScenario: 'Everyday use, product discovery, gifting, and online purchase decisions.',
    sellingPoints: ['Clear product identity', 'Authentic visual detail', 'Practical everyday use', 'Relevant use contexts'].join('\n'),
    identitySpec: {
      structure: `Verify the real shape, proportions, moving parts, and adjustment structure of ${productName} before creating visuals.`,
      colorsMaterials: 'Use the product master as the source of truth for color, material, and surface finish.',
      brandMarks: brandName
        ? `Use only the supplied authorized ${brandName} marks and preserve their placement and proportions.`
        : 'Do not add a brand, logo, trademark, or packaging copy.',
      packaging: 'Match real packaging structure, labels, seals, colors, and existing copy; do not invent missing packaging.',
      includedItems: 'Show only verified included items and quantities; do not add gifts or accessories.',
      mustKeep: 'Preserve product shape, scale, color, key structures, moving parts, and included-item count.',
      mustAvoid: 'Do not claim unverified materials, load limits, dimensions, compatibility, efficacy, or certifications.'
    }
  };
}
