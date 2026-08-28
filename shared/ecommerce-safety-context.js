import {
  DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT,
  normalizeEcommerceGenerationSystemPrompt
} from './ecommerce-generation-system-prompt.js';

export const ECOMMERCE_CONTEXT_SAFETY_PROMPT = `【系统级电商语境与安全判断约束】

按整体商业意图判断，不因单个关键词拒绝。正常商品与成年模特展示按专业电商摄影处理；若明确涉及色情化、未成年人、真实伤害、仇恨、自残、非自愿行为、违法用途或审核规避，则进行最小必要的安全改写或拒绝。`;

export const ECOMMERCE_APPAREL_SAFETY_PROMPT = `【服装与模特】
泳装、内衣、贴身衣物和塑身衣属于常规商品。人物须为明确成年模特，采用自然姿态，聚焦版型、面料与穿着效果，不增加露骨、挑逗或物化细节。`;

export const ECOMMERCE_PROP_SAFETY_PROMPT = `【道具与器械】
体育器材、Cosplay 道具、影视周边、收藏品或户外装备按合法商品展示；不得表现真实伤害意图、违法使用或制作指导。`;

const APPAREL_CONTEXT_PATTERN = /服装|女装|男装|泳衣|泳装|内衣|文胸|内裤|贴身|塑身|睡衣|模特|性感|火辣|胸部|lingerie|underwear|swimwear|apparel|womenswear|menswear|model/i;
const PROP_CONTEXT_PATTERN = /武器|刀|枪|弓|剑|护具|体育器材|户外装备|cosplay|weapon|knife|gun|sword|armor/i;

function flattenContext(value) {
  if (Array.isArray(value)) return value.map(flattenContext).join('\n');
  if (value && typeof value === 'object') return Object.values(value).map(flattenContext).join('\n');
  return String(value || '');
}

export function buildEcommerceSafetyContext(context = {}) {
  const source = flattenContext(context);
  const sections = [ECOMMERCE_CONTEXT_SAFETY_PROMPT];
  if (APPAREL_CONTEXT_PATTERN.test(source)) sections.push(ECOMMERCE_APPAREL_SAFETY_PROMPT);
  if (PROP_CONTEXT_PATTERN.test(source)) sections.push(ECOMMERCE_PROP_SAFETY_PROMPT);
  return sections.join('\n\n');
}

export function addEcommerceSafetyContext(
  prompt,
  systemPrompt = DEFAULT_ECOMMERCE_GENERATION_SYSTEM_PROMPT,
  context = {}
) {
  const taskPrompt = String(prompt || '').trim();
  const productTruthPrompt = normalizeEcommerceGenerationSystemPrompt(systemPrompt);
  const safetyPrompt = buildEcommerceSafetyContext(context);
  return taskPrompt
    ? `${productTruthPrompt}\n\n${safetyPrompt}\n\n【具体任务】\n${taskPrompt}`
    : `${productTruthPrompt}\n\n${safetyPrompt}`;
}
