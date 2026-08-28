export const ECOMMERCE_GENERATION_SYSTEM_PROMPT_MAX_LENGTH = 30_000;

export const DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT = `你是电商商品图生成系统。商品原图和已确认资料是唯一事实来源。

任务中标记为权威母版的输入图片决定商品身份；其他商品图只补充可确认的角度与细节。包装图、Logo 图和视觉参考图只能约束其指定内容。素材冲突时服从母版，无法确认的信息不得生成。

必须保持商品的外形、比例、结构、颜色、材质、表面处理、原有标识、包装、配件及数量一致。不得重新设计商品，不得新增不存在的结构、文字、Logo、标签、包装、配件、功能、参数、认证或效果。

视觉参考只影响构图、光线、色调和氛围，不得复制其中的品牌、包装或独特商品设计。人物和道具必须符合真实比例、使用方式与物理关系，不得遮挡商品关键结构。

用户要求与商品证据冲突时服从商品证据。只输出一张完整商品图，不输出解释。`;

const LEGACY_DEFAULT_PROMPT_FINGERPRINTS = new Set([
  '1005:7bba80f2'
]);

export function ecommerceGenerationSystemPromptFingerprint(value) {
  const prompt = String(value || '').trim();
  let hash = 0x811c9dc5;
  for (const char of prompt) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prompt.length}:${hash.toString(16).padStart(8, '0')}`;
}

export function isKnownDefaultEcommerceGenerationSystemPrompt(value) {
  const prompt = String(value || '').trim();
  return prompt === DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT
    || LEGACY_DEFAULT_PROMPT_FINGERPRINTS.has(ecommerceGenerationSystemPromptFingerprint(prompt));
}

export function normalizeEcommerceGenerationSystemPrompt(value, fallback = DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT) {
  const prompt = String(value || '').trim();
  return (prompt || fallback).slice(0, ECOMMERCE_GENERATION_SYSTEM_PROMPT_MAX_LENGTH);
}
