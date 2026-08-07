import { getEcommerceIndustry, getEcommerceVisualStyle } from '../../shared/ecommerce-catalog.js';

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

export function buildEcommerceSlotPrompt({ project, platform, slot, assets, revisionRequest = '' }) {
  const sellingPoints = (project.sellingPoints || []).map((item) => `- ${item}`).join('\n') || '- 未填写；不得自行编造';
  const assetGuide = (assets || []).map((asset, index) => {
    const master = asset.id === project.masterAssetId ? '，这是唯一权威商品母版' : '';
    const purpose = asset.purpose ? `；指定用途：${ASSET_PURPOSES[asset.purpose] || asset.purpose}` : '';
    return `- 输入图片 ${index + 1}：${ASSET_ROLES[asset.assetType] || '项目素材'}${master}${purpose}`;
  }).join('\n');
  const slotRule = SLOT_RULES[`${platform.id}:${slot.id}`] || slot.purposeZh;
  const industry = getEcommerceIndustry(project.industryId);
  const visualStyle = getEcommerceVisualStyle(project.visualStyleId);
  const identitySpec = project.identitySpec || {};
  const identityLines = [
    ['结构与比例', identitySpec.structure],
    ['颜色与材质', identitySpec.colorsMaterials],
    ['品牌与标识', identitySpec.brandMarks],
    ['包装', identitySpec.packaging],
    ['配件与包含物', identitySpec.includedItems],
    ['必须保留', identitySpec.mustKeep],
    ['必须避免', identitySpec.mustAvoid]
  ].filter(([, value]) => String(value || '').trim()).map(([label, value]) => `- ${label}：${value}`).join('\n');
  const revisionSection = String(revisionRequest || '').trim()
    ? `\n本次修改要求\n- 在保持商品身份锁定不变的前提下，只执行以下调整：${String(revisionRequest).trim()}\n`
    : '';

  return `请基于输入图片制作一张可交付的电商商品图片。

平台与用途
- 平台：${platform.nameZh}
- 图片槽位：${slot.nameZh}
- 画面比例：${slot.aspectRatio}
- 推荐尺寸：${slot.recommendedSize}
- 槽位要求：${slotRule}

输入图片角色
${assetGuide}

商品事实
- 商品名称：${project.productName}
- 品牌或系列：${project.brandName || '无；不要自行添加品牌'}
- 商品种类：${industry.nameZh}
- 品类视觉重点：${industry.visualFocusZh}
- 目标用户与场景：${project.targetAudience || '未填写；使用通用且可信的商品场景'}
- 规格与包装清单：${project.specifications || '未填写；不得自行增加规格或配件'}
- 核心卖点：
${sellingPoints}
- 禁止出现或避免表达：${project.prohibitedContent || '无额外说明'}
- 视觉方向：${visualStyle.nameZh}。${visualStyle.promptZh}

商品身份锁定规范
${identityLines || '- 未单独填写；严格以商品母版、商品事实和包装素材为准'}
${revisionSection}

必须遵守
1. 输入图片中的商品母版是唯一结构依据。保持商品外形、比例、颜色、包装、Logo位置、开口、按钮、接口、把手、配件和数量一致。
2. 不得把视觉参考图中的品牌、Logo、包装、人物身份或受版权保护的独特设计复制到本商品。
3. 不得虚构功效、认证、奖项、销量、价格、折扣、赠品、参数或包装包含物。
4. 除商品原包装已有文字外，不要把新的标题、卖点、价格、按钮、标签或水印直接画进图片；为后续可编辑文字图层保留干净安全区。
5. 不要生成随机乱码、伪Logo、错误商标、额外手指、畸变结构、漂浮部件或不合理反射。
6. 只输出一张完整成品图，不输出解释、拼写说明或界面截图。`;
}
