import { getEcommerceIndustry, getEcommerceSubcategory, getEcommerceVisualStyle } from '../../shared/ecommerce-catalog.js';
import {
  ECOMMERCE_ANGLE_SLOT_IDS as ANGLE_SLOTS,
  ECOMMERCE_DETAIL_SLOT_IDS as DETAIL_SLOTS,
  ECOMMERCE_PACKAGING_SLOT_IDS as PACKAGING_SLOTS,
  ECOMMERCE_VARIANT_SLOT_IDS as VARIANT_SLOTS,
  selectEcommerceAssetsForSlot
} from '../../shared/ecommerce-reference-selection.js';
import { addEcommerceSafetyContext } from '../../shared/ecommerce-safety-context.js';

export { selectEcommerceAssetsForSlot };

const SLOT_RULES = {
  'taobao-tmall:main-square': '方形货架首图。商品主体清晰、构图直接、缩略图尺寸下仍可快速识别；保留少量干净留白。',
  'taobao-tmall:main-portrait': '3:4移动端竖版首图。主体完整，不裁切关键结构，视觉重心适合手机浏览。',
  'taobao-tmall:white-background': '纯净浅色或白色背景，完整呈现商品，不增加无关道具、人物或装饰。',
  'taobao-tmall:key-benefit': '围绕一个核心卖点建立视觉证据，通过场景、材质或结构体现，不把营销文字直接画进图片。',
  'taobao-tmall:detail-material': '使用可信的近景或微距构图，突出材质、成分、质地或工艺，同时保持商品身份可识别。',
  'taobao-tmall:usage-scene': '把商品置于目标用户真实会使用的场景，避免夸张、虚假或与受众无关的环境。',
  'taobao-tmall:spec-bundle': '清楚陈列包装包含物、数量或规格；不得增减配件，不生成错误数量。',
  'taobao-tmall:sku-variant': '保持商品结构、镜头、光线和比例统一，只呈现项目资料中存在的颜色或款式。',
  'taobao-tmall:campaign': '建立适度活动氛围，但保留明确、干净的文字安全区，不直接生成价格或折扣文字。',
  'taobao-tmall:detail-page': '制作一个可作为详情页模块的竖版画面，围绕一个卖点组织主视觉、细节和干净信息区。',
  'douyin:cover-square': '方形商品封面。首屏快速识别商品，主体突出，避免复杂边框、水印和低质拼贴。',
  'douyin:material-portrait': '3:4移动端商品素材。主体占据主要视觉面积，适合推荐流和商品卡展示。',
  'douyin:three-second-benefit': '用户三秒内能理解一个购买理由；用动作、使用结果或细节证据表达，不嵌入营销文字。',
  'douyin:person-scene': '使用自然人物或真实使用场景表现上身、比例或操作方式，人物不能遮挡关键商品结构。',
  'douyin:detail-closeup': '突出面料、五金、接口、按键、纹理或工艺等关键细节，保持真实材质。',
  'douyin:comparison': '只表达项目资料可支持的可验证差异，不制作虚假前后对比、医疗效果或夸大结果。',
  'douyin:promotion-label': '为价格、利益点和活动标签预留清晰图层区域，但不要把文字直接生成进底图。',
  'douyin:video-cover': '9:16短视频封面构图，第一眼看到商品与核心使用情境，上下保留平台界面安全区。',
  'douyin:video-storyboard': '生成视觉分镜板底图，依次体现开场钩子、商品、卖点证据、使用、细节和行动引导，不生成小字。',
  'amazon:compliant-main': 'Amazon合规主图风格：纯白背景，只有实际销售商品，完整清晰，占画面约85%，不出现文字、Logo贴纸、边框、道具或未包含配件。',
  'amazon:multi-angle': '用一致光线和比例展示商品正面、背面或侧面；保持几何结构准确，不增加或删除部件。',
  'amazon:feature': '围绕一个可验证功能建立清晰视觉证据，不嵌入未经证实的宣传文字。',
  'amazon:dimensions': '为后续尺寸标注制作正交、易测量的清晰商品底图，比例真实，四周留出标注空间，不直接生成数字。',
  'amazon:lifestyle': '展示真实使用场景和正确比例，人物、环境与目标用户一致，商品仍是视觉重点。',
  'amazon:material-detail': '近距离展示材质、表面处理、接缝或关键结构，避免虚假材质和过度磨皮。',
  'amazon:package-contents': '整齐展示包装内实际包含的所有物品，数量严格准确，不增加赠品或装饰性配件。',
  'amazon:variant': '保持镜头、商品几何和光线一致，仅按项目资料呈现合法颜色或规格变体。',
  'amazon:video-cover': '制作横版商品演示视频封面底图，商品与使用动作清晰，保留标题安全区但不生成文字。',
  'shopify:product-hero': '品牌独立站Hero构图，商品辨识度高，具有明确视觉气质，并为网页标题与按钮保留安全区。',
  'shopify:collection-card': '方形集合页缩略图，小尺寸下仍能识别商品系列和主要差异。',
  'shopify:gallery-angle': '商品画廊角度图，统一背景、镜头和光线，准确呈现不同角度。',
  'shopify:lifestyle': '具有品牌感的生活方式场景，可信、自然，让商品融入目标客户生活但仍保持突出。',
  'shopify:material-detail': '以高级但真实的近景展示纹理、材质、表面处理和工艺。',
  'shopify:how-to': '为使用步骤制作清晰底图或连续动作画面，步骤逻辑明确，不生成难以编辑的小字。',
  'shopify:bundle-cross-sell': '清楚展示兼容商品或组合装，数量和产品关系准确，不虚构未提供的配件。',
  'shopify:variant': '统一构图展示颜色或SKU变体，使用户可以直接比较。',
  'shopify:social-share': '适合社交分享的品牌化方图，主体醒目、构图有记忆点，并预留简短文案安全区。',
  'shopify:video-cover': '横版品牌视频封面底图，商品故事或演示动作明确，不直接生成标题文字。',
  'shopify:model-brief': '生成多视角产品参考板底图，结构、材质和比例清楚，便于后续3D建模，不生成尺寸小字。'
};

const ASSET_ROLES = {
  product: '真实商品图，用于锁定商品结构、颜色、材质和配件数量',
  packaging: '真实包装图，用于锁定包装结构、标签布局和包装颜色',
  logo: '已授权Logo素材，只用于保持品牌标识准确',
  reference: '视觉参考图，只参考构图、光线或氛围，绝不能复制其中品牌或商品'
};

const ASSET_PURPOSES = {
  identity: '商品身份与结构参照',
  angle: '角度与几何参照',
  packaging: '包装结构与文字参照',
  brand: '品牌标识参照',
  material: '材质与表面处理参照',
  detail: '局部细节参照',
  composition: '仅用于构图参照',
  lighting: '仅用于光线参照',
  scene: '仅用于场景氛围参照'
};

const REFINEMENT_ROLES = {
  detail: '局部内容素材；只提取用户在修改要求中明确指出的对象、纹理或细节，不得替换商品身份',
  composition: '仅参考构图与画面布局，不复制商品、品牌、文字或独特设计',
  lighting: '仅参考光线方向、软硬、色温与明暗关系',
  scene: '仅参考场景类型、空间关系与氛围，不复制品牌或主体商品'
};

const REFINEMENT_AREAS = {
  auto: '根据用户修改要求定位最小必要区域',
  subject: '商品主体范围',
  background: '背景范围，商品主体保持不变',
  'top-left': '画面左上区域',
  'top-right': '画面右上区域',
  'bottom-left': '画面左下区域',
  'bottom-right': '画面右下区域'
};

function formatInputNumbers(numbers) {
  const sorted = [...numbers].sort((left, right) => left - right);
  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];
  for (const number of sorted.slice(1)) {
    if (number === end + 1) {
      end = number;
      continue;
    }
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
    start = number;
    end = number;
  }
  if (start != null) ranges.push(start === end ? `${start}` : `${start}–${end}`);
  return ranges.join('、');
}

function buildAssetGuide(project, assets, offset = 0, refinementInputs = []) {
  const refinementRoleById = new Map((refinementInputs || []).map((input) => [input.assetId, input.role]));
  const groups = new Map();
  (assets || []).forEach((asset, index) => {
    const inputNumber = index + 1 + offset;
    const master = asset.id === project.masterAssetId ? '；这是商品身份最高优先级的权威母版' : '';
    const purpose = asset.purpose ? `；指定用途：${ASSET_PURPOSES[asset.purpose] || asset.purpose}` : '';
    const refinementRole = refinementRoleById.get(asset.id);
    const refinement = refinementRole ? `；本次精修用途：${REFINEMENT_ROLES[refinementRole] || REFINEMENT_ROLES.detail}` : '';
    const description = `${ASSET_ROLES[asset.assetType] || '项目素材'}${master}${purpose}${refinement}`;
    if (!groups.has(description)) groups.set(description, []);
    groups.get(description).push(inputNumber);
  });
  return [...groups.entries()]
    .map(([description, inputNumbers]) => `- 输入图片 ${formatInputNumbers(inputNumbers)}：${description}`)
    .join('\n');
}

function buildSlotEvidenceRule(slot) {
  if (slot.id === 'comparison') {
    return '- 对比图必须采用严格的左右 50% 分区：左半区只呈现本商品，右半区只呈现对比对象或对比状态；主体、道具、背景元素和视觉证据不得跨越中线。两侧使用一致的机位、尺度、透视和光线条件，便于公平比较；不得拼成上下结构、自由散点布局或混合场景。\n- 只表达项目资料可验证的差异，不得虚构竞品结构、参数、效果、前后状态或夸大结论。';
  }
  if (ANGLE_SLOTS.has(slot.id)) {
    return '- 只表现输入素材能够支持的视角、表面和结构。看不到的背面、接口、内部结构或标签不得自行补全；素材不足时宁可使用单一可信视角，也不要伪造多角度细节。';
  }
  if (PACKAGING_SLOTS.has(slot.id)) {
    return '- 包装、配件和数量必须有包装图、商品图或“随附配件与数量”文字证据；缺少证据的物品不出现。';
  }
  if (VARIANT_SLOTS.has(slot.id)) {
    return '- 只呈现项目资料明确存在的颜色、规格或款式；不要根据常见 SKU 自行创造变体。';
  }
  if (DETAIL_SLOTS.has(slot.id)) {
    return '- 微距细节必须来自可见材质或结构，不得把塑料改成金属、把印刷纹理改成真实浮雕，或虚构成分与工艺。';
  }
  return '';
}

export function buildEcommerceSlotPrompt({
  project,
  platform,
  slot,
  assets,
  systemPrompt,
  revisionRequest = '',
  targetArea = 'auto',
  refinementInputs = [],
  hasBaseImage = false,
  consistencyIssues = []
}) {
  const industry = getEcommerceIndustry(project.industryId);
  const subcategory = getEcommerceSubcategory(project.industryId, project.subcategoryId);
  const coreUser = (Object.prototype.hasOwnProperty.call(project, 'coreUser')
    ? project.coreUser || ''
    : project.targetAudience || '');
  const coreScenario = String(project.coreScenario || '').trim();
  const sellingPointItems = (project.sellingPoints || [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  const baseGuide = hasBaseImage
    ? '- 输入图片 1：本槽位当前待修改版本。它只负责保留已确认的构图、背景、镜头和文字安全区；商品结构若与权威母版冲突，必须按母版纠正。\n'
    : '';
  const assetGuide = `${baseGuide}${buildAssetGuide(project, assets, hasBaseImage ? 1 : 0, refinementInputs)}`.trim();
  const masterIndex = (assets || []).findIndex((asset) => asset.id === project.masterAssetId);
  const masterInputNumber = masterIndex >= 0 ? masterIndex + 1 + (hasBaseImage ? 1 : 0) : 0;
  const masterReference = masterInputNumber ? `输入图片 ${masterInputNumber} ` : '已指定的商品母版';
  const slotRule = SLOT_RULES[`${platform.id}:${slot.id}`] || slot.purposeZh;
  const visualStyle = getEcommerceVisualStyle(project.visualStyleId);
  const identitySpec = { ...(project.identitySpec || {}) };
  if (!String(project.identitySpec?.mustKeep || '').trim() && String(project.specifications || '').trim()) {
    identitySpec.mustKeep = project.specifications;
  }
  if (!String(project.identitySpec?.mustAvoid || '').trim() && String(project.prohibitedContent || '').trim()) {
    identitySpec.mustAvoid = project.prohibitedContent;
  }
  const identityLines = [
    ['结构与比例', identitySpec.structure],
    ['颜色与材质', identitySpec.colorsMaterials],
    ['品牌与标识', identitySpec.brandMarks],
    ['外包装与标签', identitySpec.packaging],
    ['随附配件与数量', identitySpec.includedItems],
    ['必须保留', identitySpec.mustKeep || project.specifications],
    ['必须避免', identitySpec.mustAvoid || project.prohibitedContent]
  ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => `- ${label}：${value}`).join('\n');
  const repairIssues = (Array.isArray(consistencyIssues) ? consistencyIssues : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  const revisionSection = String(revisionRequest || '').trim()
    ? `【本次精修】\n- 修改要求：${JSON.stringify(String(revisionRequest).trim())}\n- 修改范围：${REFINEMENT_AREAS[targetArea] || REFINEMENT_AREAS.auto}。只改变完成该要求所必需的最小区域。\n${repairIssues.length ? `- 同时修复已确认问题：\n${repairIssues.map((item) => `  - ${item}`).join('\n')}\n` : ''}- 补充素材只按标注的精修用途使用；未明确要求的内容不得加入成品。\n- 除明确修改外，锁定输入图片 1 的商品、构图、背景、镜头、光线、阴影、文字安全区和所有未指定区域；不得覆盖商品母版。`
    : '';
  const productFacts = [
    String(project.productName || '').trim() ? `- 商品名称：${String(project.productName).trim()}` : '',
    String(project.brandName || '').trim() ? `- 品牌或系列：${String(project.brandName).trim()}` : '',
    String(coreUser || '').trim() ? `- 核心用户：${String(coreUser).trim()}` : '',
    coreScenario ? `- 核心场景：${coreScenario}` : '',
    sellingPointItems.length ? `- 核心卖点：${sellingPointItems.join('；')}` : ''
  ].filter(Boolean);
  const slotEvidenceRule = buildSlotEvidenceRule(slot);
  const industryFocus = industry.id === 'general'
    ? ''
    : `- 品类拍摄重点（仅在素材可证实时采用）：${industry.visualFocusZh}`;
  const evidencePriority = masterInputNumber
    ? `- 商品身份以${masterReference}为最高优先级；其他素材只补充可确认信息，冲突时服从母版。`
    : '- 未指定商品母版；只使用可见输入素材和明确填写的项目事实，不补全未知细节。';
  const sections = [
    `【任务】\n- 平台：${platform.nameZh}\n- 项目分类（用于视觉规范）：${industry.nameZh} / ${subcategory.nameZh}\n- 图片槽位：${slot.nameZh}\n- 画面比例：${slot.aspectRatio}\n- 槽位要求：${slotRule}`,
    `【素材与证据】\n${evidencePriority}\n${assetGuide || '- 当前未提供输入图片。'}${hasBaseImage ? '\n- 当前待修改版本低于商品母版和事实素材，不得延续旧图中的错误结构。' : ''}`,
    productFacts.length ? `【已确认商品事实】\n${productFacts.join('\n')}` : '',
    `【视觉执行】\n- ${visualStyle.nameZh}：${visualStyle.promptZh}\n- 同项目图片保持商品身份、材质、色温、主光、阴影、背景色系和后期质感一致；构图可按槽位变化。${industryFocus ? `\n${industryFocus}` : ''}${slotEvidenceRule ? `\n${slotEvidenceRule}` : ''}`,
    identityLines ? `【项目专属约束】\n${identityLines}` : '',
    revisionSection,
    '【交付】\n- 除商品原包装已有文字外，不新增标题、卖点、价格、按钮、标签或水印；为后续可编辑图层保留干净安全区。'
  ].filter(Boolean);

  return addEcommerceSafetyContext(sections.join('\n\n'), systemPrompt, {
    industry: [industry.id, industry.nameZh],
    subcategory: [subcategory.id, subcategory.nameZh],
    productName: project.productName,
    brandName: project.brandName,
    coreUser,
    coreScenario,
    sellingPoints: sellingPointItems,
    slot: [slot.id, slot.nameZh, slotRule],
    revisionRequest
  });
}
