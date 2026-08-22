export const ECOMMERCE_PLATFORMS = [
  {
    id: 'taobao-tmall',
    nameEn: 'Taobao / Tmall',
    nameZh: '淘宝 / 天猫',
    descriptionEn: 'Marketplace-ready product images and modular detail-page sections.',
    descriptionZh: '适合货架主图、卖点图、SKU 图和模块化详情页。',
    slots: [
      slot('main-square', 'Square main image', '商品首图', '1:1', '1024x1024', true, 'Make the product instantly recognizable in a marketplace feed.', '在货架流中快速看清商品主体。'),
      slot('main-portrait', 'Portrait main image', '3:4 商品首图', '3:4', '1200x1600', true, 'Adapt the same product identity to a mobile portrait placement.', '保持商品一致性的移动端竖版主图。'),
      slot('white-background', 'White-background product', '白底商品图', '1:1', '1024x1024', true, 'Show the complete product clearly with clean edges.', '完整、清晰地呈现商品和轮廓。'),
      slot('key-benefit', 'Key benefit image', '核心卖点图', '1:1', '1024x1024', true, 'Communicate one primary purchase reason.', '一张图只传达一个核心购买理由。'),
      slot('detail-material', 'Material or ingredient detail', '材质 / 成分 / 细节图', '1:1', '1024x1024', false, 'Explain material, texture, ingredients, or construction.', '说明材质、质地、成分或工艺。'),
      slot('usage-scene', 'Usage scene', '使用场景图', '3:4', '1200x1600', false, 'Place the product in a believable target-customer scenario.', '将商品放入可信的目标用户场景。'),
      slot('spec-bundle', 'Specification or bundle', '规格 / 套装图', '1:1', '1024x1024', false, 'Clarify quantities, included items, sizes, or bundles.', '清晰说明数量、包含物、尺寸或组合。'),
      slot('sku-variant', 'SKU variant image', 'SKU 颜色 / 款式图', '1:1', '1024x1024', false, 'Keep framing consistent across color and style variants.', '让颜色和款式变体保持统一构图。'),
      slot('campaign', 'Campaign atmosphere', '活动氛围图', '1:1', '1024x1024', false, 'Reserve safe areas for editable campaign copy and price.', '为可编辑活动文案和价格预留安全区。'),
      slot('detail-page', 'Detail-page modules', '详情页模块', '3:4', '1200x1600', false, 'Build a sequence covering pain point, benefit, detail, parameter, scene, and trust.', '形成痛点、卖点、细节、参数、场景与信任信息的详情页序列。')
    ]
  },
  {
    id: 'douyin',
    nameEn: 'Douyin E-commerce',
    nameZh: '抖音电商',
    descriptionEn: 'Mobile-first product visuals designed for fast recognition and short-video conversion.',
    descriptionZh: '强调移动端快速识别、三秒卖点和短视频承接。',
    slots: [
      slot('cover-square', 'Square product cover', '1:1 商品封面', '1:1', '1024x1024', true, 'Identify the product immediately in the feed.', '在推荐流中立即识别商品。'),
      slot('material-portrait', 'Portrait product material', '3:4 商品素材图', '3:4', '1200x1600', true, 'Provide a mobile portrait visual with a clear subject.', '提供主体清晰的移动端竖版素材。'),
      slot('three-second-benefit', 'Three-second benefit', '三秒卖点视觉', '3:4', '1200x1600', true, 'Communicate one benefit before the viewer scrolls away.', '在用户划走前表达一个核心利益点。'),
      slot('person-scene', 'Person or usage scene', '真人 / 使用场景图', '3:4', '1200x1600', false, 'Demonstrate fit, scale, or use in a credible scene.', '在可信场景中展示上身、比例或使用方式。'),
      slot('detail-closeup', 'Detail close-up', '细节特写', '1:1', '1024x1024', false, 'Show texture, craftsmanship, controls, or key components.', '展示质感、工艺、操作部件或关键结构。'),
      slot('comparison', 'Comparison or effect', '对比 / 效果图', '3:4', '1200x1600', false, 'Explain a verifiable difference without misleading claims.', '用可验证信息说明差异，避免误导性表达。'),
      slot('promotion-label', 'Promotion label version', '活动打标版本', '1:1', '1024x1024', false, 'Reserve editable layers for price, benefit, and campaign labels.', '为价格、利益点和活动标签保留可编辑图层。'),
      slot('video-cover', 'Short-video cover', '短视频封面', '9:16', '1080x1920', true, 'Create a strong opening frame for a product video.', '形成可承接商品短视频的强开场画面。'),
      slot('video-storyboard', 'Six-shot storyboard', '6 镜头脚本', '9:16', '1080x1920', false, 'Outline hook, product, benefit, evidence, usage, and call to action.', '规划钩子、商品、卖点、证据、使用与行动引导。')
    ]
  },
  {
    id: 'amazon',
    nameEn: 'Amazon',
    nameZh: 'Amazon',
    descriptionEn: 'Compliance-first listings with clear product evidence, scale, and variants.',
    descriptionZh: '优先满足合规白底、产品证据、尺寸和变体展示。',
    slots: [
      slot('compliant-main', 'Compliant main image', '合规白底主图', '1:1', '1024x1024', true, 'Show only the product clearly on a clean white background.', '在干净白底上完整清晰展示商品。'),
      slot('multi-angle', 'Front, back, and side views', '正面 / 背面 / 侧面图', '1:1', '1024x1024', true, 'Help customers understand the complete physical form.', '帮助用户理解商品完整物理形态。'),
      slot('feature', 'Core feature image', '核心功能图', '1:1', '1024x1024', true, 'Explain one concrete feature with visual evidence.', '用视觉证据解释一个具体功能。'),
      slot('dimensions', 'Dimensions and scale', '尺寸和比例图', '1:1', '1024x1024', true, 'Communicate dimensions and real-world scale accurately.', '准确说明尺寸和真实比例。'),
      slot('lifestyle', 'Lifestyle image', '使用场景图', '1:1', '1024x1024', false, 'Show the product in a realistic use context.', '展示商品在真实生活中的使用情境。'),
      slot('material-detail', 'Material and detail', '材质和细节图', '1:1', '1024x1024', false, 'Provide close evidence of material and construction quality.', '近距离呈现材质和结构品质。'),
      slot('package-contents', 'Package contents', '包装清单图', '1:1', '1024x1024', false, 'Make every included item and quantity unambiguous.', '明确展示全部包含物和数量。'),
      slot('variant', 'Color or size variant', '颜色 / 规格变体图', '1:1', '1024x1024', false, 'Keep the product geometry and framing consistent across variants.', '让不同颜色和规格保持几何与构图一致。'),
      slot('video-cover', 'Listing video cover', '视频封面', '16:9', '1920x1080', false, 'Provide a clear cover for a product demonstration video.', '提供清晰的商品演示视频封面。')
    ]
  },
  {
    id: 'shopify',
    nameEn: 'Shopify',
    nameZh: 'Shopify',
    descriptionEn: 'Brand-led storefront media covering product, collection, social, and storytelling.',
    descriptionZh: '覆盖品牌首页、商品页、集合页、社交传播和内容叙事。',
    slots: [
      slot('product-hero', 'Product-page hero', '商品页 Hero', '4:3', '1600x1200', true, 'Lead with a distinctive brand and product composition.', '用明确品牌气质和商品构图建立第一印象。'),
      slot('collection-card', 'Collection thumbnail', '集合页缩略图', '1:1', '1024x1024', true, 'Remain legible at small storefront-card sizes.', '在较小的集合卡片尺寸下仍清晰可读。'),
      slot('gallery-angle', 'Gallery angle', '产品画廊多角度图', '1:1', '1024x1024', true, 'Build a coherent product gallery with consistent lighting.', '用一致光线形成连贯的多角度商品图库。'),
      slot('lifestyle', 'Lifestyle story', '生活方式图', '4:3', '1600x1200', true, 'Connect the product to an aspirational but believable customer life.', '把商品连接到向往且可信的用户生活。'),
      slot('material-detail', 'Material detail', '材质细节图', '1:1', '1024x1024', false, 'Show texture, finish, and craftsmanship.', '展示纹理、表面处理和工艺。'),
      slot('how-to', 'How-to sequence', '使用步骤图', '3:4', '1200x1600', false, 'Explain setup or use in a simple visual sequence.', '用简单视觉序列说明安装或使用。'),
      slot('bundle-cross-sell', 'Bundle or cross-sell', '组合装 / 交叉销售图', '4:3', '1600x1200', false, 'Show compatible products and bundle value clearly.', '清楚展示兼容商品和组合价值。'),
      slot('variant', 'Color and SKU variants', '颜色与 SKU 变体图', '1:1', '1024x1024', false, 'Keep every variant visually comparable.', '让所有变体可以直接进行视觉比较。'),
      slot('social-share', 'Social share image', '社交分享图', '1:1', '1024x1024', false, 'Create a branded image suitable for social sharing.', '形成适合社交分享的品牌化图片。'),
      slot('video-cover', 'Video cover', '视频封面', '16:9', '1920x1080', false, 'Introduce a product story or demonstration video.', '承接商品故事或演示视频。'),
      slot('model-brief', '3D model brief', '3D 模型制作说明', 'Document', '1024x1024', false, 'Define views, materials, dimensions, and interaction requirements for 3D production.', '定义3D制作所需视角、材质、尺寸和交互要求。')
    ]
  }
];

export const ECOMMERCE_INDUSTRIES = [
  industry(
    'apparel',
    'Apparel and intimates',
    '服装与内衣',
    'Women, men, intimates, loungewear',
    '女装、男装、内衣、家居服',
    ['fashion-lookbook', 'premium-editorial', 'fashion-motion', 'youthful-social'],
    'Prioritize silhouette, fit, fabric drape, layering, and natural human posture. Keep garment construction and color accurate.',
    '重点表现版型、上身比例、面料垂坠、层次和自然姿态，服装结构与颜色必须准确。'
  ),
  industry(
    'footwear-bags',
    'Footwear and bags',
    '鞋履与箱包',
    'Women shoes, men shoes, handbags, luggage',
    '女鞋、男鞋、箱包、旅行箱',
    ['footwear-sculpture', 'premium-editorial', 'warm-lifestyle', 'bold-conversion'],
    'Emphasize profile, sole or hardware structure, leather and textile texture, capacity, carrying scale, and stable geometry.',
    '重点表现鞋型轮廓、鞋底或五金结构、皮革与织物质感、容量和携带比例，几何形态必须稳定。'
  ),
  industry(
    'accessories-jewelry',
    'Accessories and jewelry',
    '配饰与珠宝',
    'Fashion accessories, watches, jewelry',
    '时尚配饰、腕表、珠宝',
    ['jewelry-luxury', 'accessory-macro', 'premium-editorial', 'clean-commercial'],
    'Control reflections precisely and reveal scale, setting, polish, gemstone or metal texture without changing the design.',
    '精确控制反射与高光，清楚表现尺度、镶嵌、抛光和宝石或金属质地，不改变原始设计。'
  ),
  industry(
    'beauty',
    'Beauty and personal care',
    '美妆个护',
    'Skincare, cosmetics, personal care',
    '护肤、彩妆、洗护、个护',
    ['beauty-luminous', 'beauty-lab', 'premium-editorial', 'youthful-social'],
    'Make packaging, liquid or cream texture, finish, cleanliness, and ingredient atmosphere feel refined while avoiding unsupported efficacy.',
    '突出包装、液体或膏体质地、妆效、洁净感与成分氛围，避免表现未经证实的功效。'
  ),
  industry(
    'health',
    'Health and care devices',
    '健康与护理器械',
    'Wellness, care products, personal-care devices',
    '健康用品、护理产品、个护仪器',
    ['clinical-care', 'technical-proof', 'clean-commercial', 'warm-lifestyle'],
    'Communicate safe use, ergonomic contact, controls, hygiene, and credible evidence without medical or therapeutic exaggeration.',
    '表现安全使用、人体工学接触、操作部件、卫生感与可信证据，不夸大医疗或治疗效果。'
  ),
  industry(
    'computer-office',
    'Computers and office',
    '电脑与办公',
    'Computers, accessories, stationery, office, electronic supplies',
    '电脑、配件、文具、办公、电子耗材',
    ['tech-precision', 'office-order', 'clean-commercial', 'technical-proof'],
    'Show ports, interfaces, keyboard or component layout, workspace scale, organization, and precise industrial geometry.',
    '清楚表现接口、键位或部件布局、办公尺度、收纳秩序与精密工业结构。'
  ),
  industry(
    'consumer-electronics',
    'Mobile and digital',
    '手机与数码',
    'Phones, communications, digital, entertainment',
    '手机、通信、数码、影音娱乐',
    ['tech-future', 'tech-precision', 'youthful-social', 'bold-conversion'],
    'Preserve screen, lens, port, button, speaker, material, and thickness details; use controlled luminous accents and modern depth.',
    '保持屏幕、镜头、接口、按键、扬声器、材质和厚度准确，以克制光效建立现代科技层次。'
  ),
  industry(
    'home',
    'Furniture and home interiors',
    '家具家居家装',
    'Furniture, home goods, interiors, renovation',
    '家具、家居、家装、软装',
    ['interior-editorial', 'home-cozy', 'clean-commercial', 'premium-editorial'],
    'Respect room scale, material finish, joinery, textile softness, circulation, and believable daylight or ambient lighting.',
    '尊重空间比例、材质表面、连接结构、织物柔软度与动线，以可信自然光或环境光呈现。'
  ),
  industry(
    'appliances-kitchen',
    'Appliances and kitchenware',
    '家电与厨具',
    'Home appliances, kitchenware, small appliances',
    '家电、厨具、生活电器',
    ['appliance-demo', 'clean-commercial', 'warm-lifestyle', 'technical-proof'],
    'Make operation, capacity, controls, openings, heat or water context, countertop scale, and cleaning logic easy to understand.',
    '让操作方式、容量、控制区、开合结构、热水场景、台面比例和清洁逻辑一眼可懂。'
  ),
  industry(
    'food',
    'Food and fresh produce',
    '食品与生鲜',
    'Packaged food, fresh produce, ingredients',
    '包装食品、生鲜、农产品、食材',
    ['food-appetite', 'fresh-origin', 'clean-commercial', 'warm-lifestyle'],
    'Prioritize truthful color, moisture, texture, portion, freshness, packaging accuracy, and appetizing but believable light.',
    '优先表现真实色泽、水润度、纹理、分量、新鲜感和包装准确性，光线诱人但必须可信。'
  ),
  industry(
    'beverage-alcohol',
    'Beverages and alcohol',
    '饮料与酒水',
    'Tea, coffee, soft drinks, spirits and wine',
    '茶饮、咖啡、饮料、酒水',
    ['beverage-premium', 'premium-editorial', 'bold-conversion', 'warm-lifestyle'],
    'Control glass, condensation, liquid translucency, label integrity, serving ritual, and premium highlights without misleading claims.',
    '控制玻璃、冷凝水、液体通透、标签完整、饮用仪式和高级高光，不制造误导性宣传。'
  ),
  industry(
    'sports-outdoor',
    'Sports and outdoor',
    '运动与户外',
    'Fitness, outdoor equipment, performance gear',
    '运动、健身、户外装备',
    ['sport-energy', 'outdoor-adventure', 'bold-conversion', 'technical-proof'],
    'Use credible motion, terrain, weather, grip, load, protection, and body mechanics while keeping the product unobstructed.',
    '用可信动势、地形、天气、抓握、承重、防护和人体动作表现性能，同时保证商品无遮挡。'
  ),
  industry(
    'tools-commercial',
    'Commercial equipment and tools',
    '商业设备与五金工具',
    'Commercial, hardware, tools, professional supplies',
    '商业设备、五金工具、专业耗材',
    ['industrial-rugged', 'technical-proof', 'clean-commercial', 'bold-conversion'],
    'Reveal mechanism, materials, force direction, operating clearance, durability cues, and professional work context accurately.',
    '准确表现机械结构、材料、受力方向、操作空间、耐用感和专业工作场景。'
  ),
  industry(
    'automotive',
    'Automotive products',
    '汽车与车品',
    'Vehicles, accessories, detailing and maintenance',
    '汽车、车载用品、美容养护',
    ['auto-dynamic', 'technical-proof', 'premium-editorial', 'bold-conversion'],
    'Preserve body or component geometry, fitment, surface reflections, installation position, road context, and safety realism.',
    '保持车身或部件几何、适配关系、漆面反射、安装位置、道路环境和安全逻辑真实。'
  ),
  industry(
    'toys-collectibles',
    'Toys and collectibles',
    '文玩与潮玩',
    'Toys, designer figures, collectibles, cultural objects',
    '玩具、潮玩、文玩、收藏品',
    ['collectible-display', 'playful-pop', 'youthful-social', 'premium-editorial'],
    'Protect character or object identity, proportions, paint details, material, rarity cues, display scale, and playful storytelling.',
    '保持角色或器物身份、比例、涂装、材质和收藏感，以陈列尺度与趣味叙事强化记忆点。'
  ),
  industry(
    'baby-pet',
    'Baby and pet',
    '母婴与宠物',
    'Baby products, pet supplies',
    '母婴用品、宠物用品',
    ['baby-soft', 'warm-lifestyle', 'clean-commercial', 'youthful-social'],
    'Use gentle light, safe interaction, hygiene, softness, scale, and natural family or pet behavior without unsafe staging.',
    '使用柔和光线，表现安全互动、卫生、柔软度、尺寸和自然家庭或宠物行为，避免危险摆拍。'
  ),
  industry(
    'general',
    'Other products',
    '其他',
    'Products not covered above',
    '以上未覆盖的商品',
    ['clean-commercial', 'premium-editorial', 'warm-lifestyle', 'bold-conversion', 'technical-proof', 'youthful-social'],
    'Choose the clearest visual language for the product, prioritizing accurate structure, material, scale, and real use.',
    '根据商品本身选择最清晰的视觉语言，优先保证结构、材质、尺度和真实用途准确。'
  )
];

function subcategory(id, nameEn, nameZh, keywords = []) {
  return { id, nameEn, nameZh, keywords };
}

export const ECOMMERCE_SUBCATEGORIES = {
  apparel: [
    subcategory('womenswear', 'Womenswear', '女装', ['女装', '连衣裙', '半身裙', 'women', 'dress', 'skirt']),
    subcategory('menswear', 'Menswear', '男装', ['男装', '衬衫', '西装', 'men', 'shirt', 'suit']),
    subcategory('underwear', 'Underwear', '内衣', ['内衣', '文胸', '内裤', 'underwear', 'lingerie']),
    subcategory('loungewear', 'Loungewear', '家居服', ['家居服', '睡衣', 'loungewear', 'pajama']),
    subcategory('apparel-other', 'Other apparel', '其他服装')
  ],
  'footwear-bags': [
    subcategory('footwear', 'Footwear', '鞋履', ['鞋', '靴', 'sneaker', 'shoe', 'boot']),
    subcategory('handbags', 'Handbags', '手提包', ['手提包', '女包', 'handbag', 'purse']),
    subcategory('backpacks', 'Backpacks', '背包', ['背包', '双肩包', 'backpack']),
    subcategory('luggage', 'Luggage', '旅行箱', ['行李箱', '旅行箱', 'luggage', 'suitcase']),
    subcategory('footwear-bags-other', 'Other footwear and bags', '其他鞋包')
  ],
  'accessories-jewelry': [
    subcategory('fashion-accessories', 'Fashion accessories', '时尚配饰', ['配饰', '帽', '围巾', 'accessory']),
    subcategory('watches', 'Watches', '腕表', ['手表', '腕表', 'watch']),
    subcategory('jewelry', 'Jewelry', '珠宝首饰', ['珠宝', '首饰', '项链', '戒指', '耳环', 'jewelry', 'necklace', 'ring']),
    subcategory('eyewear', 'Eyewear', '眼镜', ['眼镜', '墨镜', 'eyewear', 'glasses']),
    subcategory('accessories-other', 'Other accessories', '其他配饰')
  ],
  beauty: [
    subcategory('skincare', 'Skincare', '护肤', ['护肤', '面霜', '精华', '面膜', 'skincare', 'serum', 'cream']),
    subcategory('makeup', 'Makeup', '彩妆', ['彩妆', '口红', '粉底', '眼影', 'makeup', 'lipstick']),
    subcategory('hair-body-care', 'Hair and body care', '洗护个护', ['洗发', '护发', '沐浴', '个护', 'shampoo', 'body care']),
    subcategory('fragrance', 'Fragrance', '香水香氛', ['香水', '香氛', 'perfume', 'fragrance']),
    subcategory('beauty-other', 'Other beauty', '其他美妆个护')
  ],
  health: [
    subcategory('wellness-products', 'Wellness products', '健康用品', ['健康', '保健', 'wellness']),
    subcategory('care-products', 'Care products', '护理产品', ['护理', '护具', 'care product']),
    subcategory('care-devices', 'Care devices', '个护仪器', ['护理仪', '按摩仪', '理疗', 'device', 'massager']),
    subcategory('monitoring-devices', 'Monitoring devices', '健康监测', ['血压', '血糖', '监测', 'monitor']),
    subcategory('health-other', 'Other health products', '其他健康用品')
  ],
  'computer-office': [
    subcategory('computers', 'Computers', '电脑整机', ['电脑', '笔记本', '台式机', 'laptop', 'computer']),
    subcategory('computer-accessories', 'Computer accessories', '电脑配件', ['键盘', '鼠标', '显示器', '配件', 'keyboard', 'mouse', 'monitor']),
    subcategory('office-supplies', 'Office supplies', '文具耗材', ['文具', '纸', '墨盒', '耗材', 'stationery']),
    subcategory('office-equipment', 'Office equipment', '办公设备', ['打印机', '扫描仪', '办公设备', 'printer']),
    subcategory('computer-office-other', 'Other computer and office', '其他电脑办公')
  ],
  'consumer-electronics': [
    subcategory('phones-tablets', 'Phones and tablets', '手机平板', ['手机', '平板', 'phone', 'tablet']),
    subcategory('audio', 'Audio', '影音耳机', ['耳机', '音箱', '麦克风', 'earbuds', 'speaker', 'audio']),
    subcategory('cameras', 'Cameras', '摄影摄像', ['相机', '镜头', '摄影', 'camera', 'lens']),
    subcategory('charging-accessories', 'Charging accessories', '充电配件', ['充电', '数据线', '移动电源', 'charger', 'cable']),
    subcategory('electronics-other', 'Other electronics', '其他数码')
  ],
  home: [
    subcategory('furniture', 'Furniture', '家具', ['家具', '沙发', '床', '桌', '椅', 'furniture', 'sofa']),
    subcategory('home-goods', 'Home goods', '家居用品', ['家居', '收纳', '置物', 'home goods', 'storage']),
    subcategory('decor-textiles', 'Decor and textiles', '软装家纺', ['窗帘', '地毯', '抱枕', '家纺', 'decor', 'textile']),
    subcategory('lighting-renovation', 'Lighting and renovation', '灯具家装', ['灯具', '家装', '装修', 'lighting', 'renovation']),
    subcategory('home-other', 'Other home products', '其他家居')
  ],
  'appliances-kitchen': [
    subcategory('home-appliances', 'Home appliances', '家用电器', ['冰箱', '洗衣机', '空调', '家电', 'appliance']),
    subcategory('small-appliances', 'Small appliances', '生活小家电', ['咖啡机', '榨汁机', '空气炸锅', '小家电']),
    subcategory('kitchenware', 'Kitchenware', '厨具餐具', ['锅', '餐具', '厨具', 'cookware']),
    subcategory('drinkware', 'Drinkware', '杯壶水具', ['保温杯', '水杯', '杯', '水壶', 'tumbler', 'bottle']),
    subcategory('appliances-kitchen-other', 'Other appliances and kitchenware', '其他家电厨具')
  ],
  food: [
    subcategory('packaged-food', 'Packaged food', '包装食品', ['包装食品', '方便食品', '罐头', 'packaged food']),
    subcategory('snacks', 'Snacks', '休闲零食', ['零食', '坚果', '糖果', 'snack']),
    subcategory('fresh-produce', 'Fresh produce', '生鲜农产品', ['水果', '蔬菜', '肉', '海鲜', '生鲜', 'fresh']),
    subcategory('ingredients', 'Ingredients', '粮油调味', ['粮油', '调味', '食材', 'ingredient', 'seasoning']),
    subcategory('food-other', 'Other food', '其他食品')
  ],
  'beverage-alcohol': [
    subcategory('water-soft-drinks', 'Water and soft drinks', '饮用水与软饮', ['矿泉水', '饮用水', '纯净水', '汽水', '饮料', 'water', 'soda']),
    subcategory('tea-coffee', 'Tea and coffee', '茶与咖啡', ['茶', '咖啡', 'tea', 'coffee']),
    subcategory('juice-dairy', 'Juice and dairy drinks', '果汁与乳饮', ['果汁', '乳饮', '奶', 'juice', 'dairy']),
    subcategory('beer-wine-spirits', 'Beer, wine and spirits', '啤酒葡萄酒与烈酒', ['啤酒', '葡萄酒', '白酒', '烈酒', 'beer', 'wine', 'spirit']),
    subcategory('beverage-other', 'Other beverages', '其他饮品')
  ],
  'sports-outdoor': [
    subcategory('fitness', 'Fitness', '健身训练', ['健身', '瑜伽', '训练', 'fitness', 'yoga']),
    subcategory('camping-hiking', 'Camping and hiking', '露营登山', ['露营', '登山', '帐篷', 'camping', 'hiking']),
    subcategory('cycling', 'Cycling', '骑行装备', ['骑行', '自行车', 'cycling', 'bike']),
    subcategory('sports-gear', 'Sports gear', '运动装备', ['运动', '球拍', '护具', 'sports gear']),
    subcategory('sports-other', 'Other sports and outdoor', '其他运动户外')
  ],
  'tools-commercial': [
    subcategory('hand-tools', 'Hand tools', '手动工具', ['扳手', '螺丝刀', '钳', 'hand tool']),
    subcategory('power-tools', 'Power tools', '电动工具', ['钻机', '电钻', '切割机', 'power tool']),
    subcategory('commercial-equipment', 'Commercial equipment', '商业设备', ['商业设备', '机器', 'equipment']),
    subcategory('industrial-consumables', 'Industrial consumables', '工业耗材', ['耗材', '配件', 'consumable']),
    subcategory('tools-other', 'Other tools', '其他工具设备')
  ],
  automotive: [
    subcategory('vehicle-parts', 'Vehicle parts', '汽车零部件', ['汽车配件', '轮胎', '车灯', 'part', 'tire']),
    subcategory('car-accessories', 'Car accessories', '车载用品', ['车载', '坐垫', '支架', 'car accessory']),
    subcategory('detailing-maintenance', 'Detailing and maintenance', '美容养护', ['机油', '洗车', '养护', 'detailing', 'maintenance']),
    subcategory('car-electronics', 'Car electronics', '汽车电子', ['行车记录仪', '导航', '汽车电子', 'dash cam']),
    subcategory('automotive-other', 'Other automotive', '其他汽车用品')
  ],
  'toys-collectibles': [
    subcategory('toys', 'Toys', '玩具', ['玩具', 'toy']),
    subcategory('designer-toys', 'Designer toys', '潮玩手办', ['潮玩', '手办', '盲盒', 'designer toy', 'figure']),
    subcategory('models-blocks', 'Models and blocks', '模型积木', ['模型', '积木', 'model', 'blocks']),
    subcategory('collectibles', 'Collectibles', '文玩收藏', ['文玩', '收藏', 'collectible']),
    subcategory('toys-other', 'Other toys and collectibles', '其他玩具收藏')
  ],
  'baby-pet': [
    subcategory('baby-care', 'Baby care', '母婴护理', ['母婴', '婴儿', '纸尿裤', 'baby care', 'diaper']),
    subcategory('feeding', 'Feeding', '喂养用品', ['奶瓶', '辅食', '喂养', 'feeding']),
    subcategory('pet-food', 'Pet food', '宠物食品', ['猫粮', '狗粮', '宠物食品', 'pet food']),
    subcategory('pet-supplies', 'Pet supplies', '宠物用品', ['猫砂', '宠物用品', '牵引绳', 'pet supplies']),
    subcategory('baby-pet-other', 'Other baby and pet', '其他母婴宠物')
  ],
  general: [
    subcategory('daily-goods', 'Daily goods', '日用百货', ['日用', '百货', 'daily goods']),
    subcategory('gifts', 'Gifts and customization', '礼品定制', ['礼品', '定制', 'gift']),
    subcategory('general-other', 'Other products', '其他商品')
  ]
};

export const ECOMMERCE_VISUAL_STYLES = [
  visualStyle('clean-commercial', 'Clean commercial', '简洁商业', 'Crisp subject, controlled light, quiet background.', '主体清晰、光线克制、背景干净。', '使用精确棚拍光线、清楚轮廓和克制背景，突出商品本身，避免无关装饰。', ['#dff8f0', '#95cfe0', '#253650']),
  visualStyle('premium-editorial', 'Premium editorial', '高端杂志', 'Refined lighting, material depth, restrained luxury.', '精致布光、材质层次、克制高级感。', '采用高端杂志式构图与精致方向性布光，强调材质层次、留白和高级但真实的色彩。', ['#f2dcc3', '#9b7d91', '#26263a']),
  visualStyle('warm-lifestyle', 'Warm lifestyle', '温暖生活方式', 'Natural light, believable use, human warmth.', '自然光、可信使用场景、亲和温度。', '使用自然光和可信生活场景，动作轻松真实，让商品融入生活但仍保持视觉主角。', ['#f4d7a0', '#b88762', '#3b4b47']),
  visualStyle('bold-conversion', 'Bold conversion', '强转化视觉', 'Strong hierarchy, contrast, instant recognition.', '层级强、对比明确、快速识别。', '建立强视觉中心、明确色彩对比和简洁信息安全区，在缩略图中快速识别且不显廉价拥挤。', ['#ffd44d', '#ff6f61', '#26324f']),
  visualStyle('technical-proof', 'Technical proof', '技术证据型', 'Accurate structure, rational light, functional evidence.', '结构准确、理性布光、功能证据。', '使用理性布光、正交或结构化构图，清楚展示部件、接口、尺度和可验证功能证据。', ['#d8eef5', '#5a8ca8', '#182a3c']),
  visualStyle('youthful-social', 'Youthful social', '年轻社交感', 'Fresh color, playful composition, mobile energy.', '新鲜配色、趣味构图、移动端活力。', '使用新鲜但协调的配色、轻快构图和移动端节奏，形成社交传播记忆点并保持商品真实。', ['#ff9fc7', '#8e8dff', '#3ce1d0']),
  visualStyle('fashion-lookbook', 'Clean fashion lookbook', '纯净时装型录', 'Accurate fit, silhouette, fabric and repeatable framing.', '准确版型、轮廓、面料和统一构图。', '采用纯净型录背景、自然模特姿态和统一镜头高度，准确表现版型、面料垂坠和搭配层次。', ['#f4efe9', '#b9b1aa', '#31343b']),
  visualStyle('fashion-motion', 'Fashion in motion', '动态穿搭街拍', 'Natural movement, urban rhythm, editorial spontaneity.', '自然动态、城市节奏、编辑感抓拍。', '以可信行走或转身动态、城市环境和编辑感抓拍表现穿搭生命力，避免僵硬摆拍和衣物变形。', ['#f1b16c', '#557a8c', '#242b39']),
  visualStyle('footwear-sculpture', 'Sculptural footwear', '鞋履雕塑棚拍', 'Profile, sole and material shaped by graphic light.', '以图形光塑造鞋型、鞋底与材质。', '用雕塑式台面、侧逆光和清晰阴影塑造鞋型轮廓、鞋底结构、五金与皮革纹理。', ['#e7e2dc', '#8b7b73', '#22252c']),
  visualStyle('accessory-macro', 'Accessory macro', '配饰微距质感', 'Controlled reflections and tactile construction details.', '可控反射与触感工艺细节。', '使用微距和精确反射控制表现纹理、缝线、扣件、镶嵌与表面工艺，同时保留完整商品识别。', ['#f5e6cf', '#b58764', '#30313b']),
  visualStyle('jewelry-luxury', 'Luxury jewelry light', '珠宝奢华光影', 'Dark-to-luminous contrast and precise highlights.', '暗亮对比与精确高光。', '以深色渐变空间、精确轮廓光和点状高光表现金属与宝石，避免过曝、材质塑料感和设计变化。', ['#f2cf72', '#6d536f', '#111522']),
  visualStyle('beauty-luminous', 'Luminous beauty', '通透美妆光感', 'Translucent color, hydrated texture, polished packaging.', '通透色彩、水润质地、精致包装。', '使用柔亮透光、细腻水润质地和克制反射表现美妆包装与膏液，保持标签和颜色准确。', ['#ffd4e4', '#cab7ff', '#7fcbd5']),
  visualStyle('beauty-lab', 'Ingredient laboratory', '成分实验室', 'Clean glass, liquid layers and evidence-led detail.', '洁净玻璃、液体层次与成分证据。', '采用洁净实验室美学、玻璃器皿感、液体层次和微距细节，表达成分方向但不虚构功效。', ['#e6fbff', '#8acbd0', '#44617d']),
  visualStyle('clinical-care', 'Clinical care', '医护级洁净', 'Soft clinical light, hygiene, ergonomic clarity.', '柔和临床光、卫生感、人体工学清晰。', '使用高洁净低刺激配色、柔和临床光和人体工学演示，突出安全、卫生和操作清晰度。', ['#effdfb', '#9ddbd2', '#547786']),
  visualStyle('tech-future', 'Future technology', '科技未来感', 'Controlled glow, dark depth and precision materials.', '克制光效、深色空间、精密材质。', '使用深色层次、克制边缘光和精密反射塑造科技未来感，屏幕与部件结构必须保持准确。', ['#60dff5', '#6d70ff', '#11172d']),
  visualStyle('tech-precision', 'Precision engineering', '精密结构展示', 'Exploded clarity, interfaces and engineered geometry.', '清晰结构、接口与工程几何。', '以精密工程布光、结构化视角和清楚层级表现接口、组件、装配关系与工业几何。', ['#d9f1f5', '#6f9fb8', '#1d3448']),
  visualStyle('office-order', 'Organized productivity', '办公效率美学', 'Order, modular layout and calm workspace logic.', '秩序、模块布局和冷静办公逻辑。', '使用整齐模块化构图、舒适办公光线和清楚收纳关系，表达效率、专注与易用性。', ['#e4e9df', '#8fa39c', '#394752']),
  visualStyle('interior-editorial', 'Interior editorial', '空间设计杂志', 'Architectural scale, daylight and material harmony.', '建筑比例、自然光与材质和谐。', '采用室内设计杂志视角、自然光层次和克制软装，准确表现空间尺度、材质与动线。', ['#eadbc7', '#a79889', '#4b5551']),
  visualStyle('home-cozy', 'Cozy home', '治愈家居生活', 'Soft daylight, tactile comfort and lived-in calm.', '柔和日光、触感舒适与生活松弛感。', '使用柔和日光、舒适织物和有呼吸感的生活细节，营造治愈氛围但不堆砌杂物。', ['#f2d5a8', '#c29b7a', '#6f8174']),
  visualStyle('appliance-demo', 'Functional appliance scene', '家电功能场景', 'Operation, capacity and daily workflow made visible.', '让操作、容量与日常流程可视化。', '以真实台面或居家场景展示操作步骤、容量、开合和使用结果，保持结构与安全逻辑准确。', ['#e8f2ed', '#89aaa5', '#334b59']),
  visualStyle('food-appetite', 'Appetite lighting', '食欲光影', 'Fresh texture, steam, moisture and truthful color.', '新鲜纹理、热气、水润与真实色泽。', '以侧逆光、真实色泽、纹理、水润度和适度热气提升食欲感，保持分量和食材真实。', ['#ffcd75', '#d86b4b', '#5d3329']),
  visualStyle('fresh-origin', 'Fresh origin story', '新鲜原产地', 'Natural daylight, source context and honest freshness.', '自然日光、产地语境与真实新鲜感。', '使用自然日光、原产地或采收语境表现新鲜度与真实质地，不制造虚假产地或品质信息。', ['#dbeea7', '#81a863', '#455c3d']),
  visualStyle('beverage-premium', 'Premium beverage still life', '酒水高级静物', 'Glass, liquid transparency and ceremonial highlights.', '玻璃、液体通透与仪式感高光。', '用高级静物布光表现瓶身、玻璃、液体通透、冷凝水和饮用仪式，标签必须完整准确。', ['#e6c87e', '#784d54', '#172331']),
  visualStyle('sport-energy', 'Athletic energy', '运动动势', 'Dynamic diagonals, muscle logic and performance tension.', '动态斜线、人体逻辑与性能张力。', '通过动态斜线构图、可信运动姿态和清晰受力关系表现速度与力量，商品关键结构无遮挡。', ['#ffd34f', '#f05c47', '#20314a']),
  visualStyle('outdoor-adventure', 'Outdoor adventure', '户外探索', 'Terrain, weather and rugged natural scale.', '地形、天气与真实自然尺度。', '将商品置于可信山野、露营或探索环境，表现天气、地形、耐用与使用尺度，避免灾难化夸张。', ['#e4c77b', '#64836a', '#314653']),
  visualStyle('industrial-rugged', 'Industrial strength', '工业力量', 'Hard light, robust materials and mechanical confidence.', '硬朗光线、坚固材料与机械可信度。', '使用硬朗方向光、工业环境和清晰机械结构，表现耐用、受力与专业感而不虚构性能。', ['#f1b84b', '#68717a', '#242a31']),
  visualStyle('auto-dynamic', 'Automotive motion light', '汽车动态光影', 'Road energy, body reflections and engineered stance.', '道路动势、车身反射与工程姿态。', '使用道路动势、长条轮廓光和精确漆面反射表现速度与工程感，保持车型或部件几何真实。', ['#f2b749', '#47678b', '#161b26']),
  visualStyle('collectible-display', 'Collector display', '收藏级陈列', 'Museum-like focus, rarity and crafted detail.', '博物馆式聚焦、稀有感与工艺细节。', '采用收藏柜或博物馆式聚焦光线，表现材质、涂装、年代感和稀有气质，保持原物身份准确。', ['#dbbf83', '#755b62', '#20202b']),
  visualStyle('playful-pop', 'Playful pop', '潮玩趣味视觉', 'Bold shapes, candy color and character storytelling.', '大胆形状、糖果色与角色叙事。', '使用大胆几何、糖果色和轻剧情场景增强潮玩趣味，保持角色比例、涂装和商品细节准确。', ['#ff8eb6', '#7edff2', '#8c79ed']),
  visualStyle('baby-soft', 'Gentle family light', '母婴柔光', 'Soft color, safety, hygiene and tender interaction.', '柔和配色、安全卫生与温柔互动。', '使用柔和低对比光线、洁净环境和安全自然互动，表现亲和、柔软和可信照护场景。', ['#f7dcc7', '#c9dbed', '#9fcfbe'])
];

export const ECOMMERCE_P1_TEMPLATES = [
  {
    id: 'tmall-clean-launch',
    platformId: 'taobao-tmall',
    industryIds: ['beauty', 'health', 'food', 'beverage-alcohol', 'general'],
    nameEn: 'Tmall clean launch set',
    nameZh: '天猫洁净上新套图',
    descriptionEn: 'A conversion-ready launch set balancing clean product evidence, one benefit, detail and scene.',
    descriptionZh: '兼顾商品首图、单一卖点、细节与场景的上新转化套图。',
    visualStyleId: 'clean-commercial',
    selectedSlotIds: ['main-square', 'main-portrait', 'white-background', 'key-benefit', 'detail-material', 'usage-scene', 'spec-bundle']
  },
  {
    id: 'tmall-fashion-drop',
    platformId: 'taobao-tmall',
    industryIds: ['apparel', 'footwear-bags', 'accessories-jewelry'],
    nameEn: 'Tmall fashion drop',
    nameZh: '天猫时尚上新套图',
    descriptionEn: 'Consistent catalog, portrait, material and variant visuals for fashion launches.',
    descriptionZh: '面向服饰鞋包上新的统一型录、竖版、材质与款式套图。',
    visualStyleId: 'fashion-lookbook',
    selectedSlotIds: ['main-square', 'main-portrait', 'white-background', 'detail-material', 'usage-scene', 'sku-variant', 'campaign']
  },
  {
    id: 'douyin-three-second',
    platformId: 'douyin',
    industryIds: ['apparel', 'footwear-bags', 'beauty', 'sports-outdoor', 'general'],
    nameEn: 'Douyin three-second conversion',
    nameZh: '抖音三秒转化套图',
    descriptionEn: 'Mobile-first cover, benefit, person scene, detail and video assets.',
    descriptionZh: '覆盖封面、三秒卖点、真人场景、细节和短视频承接。',
    visualStyleId: 'bold-conversion',
    selectedSlotIds: ['cover-square', 'material-portrait', 'three-second-benefit', 'person-scene', 'detail-closeup', 'promotion-label', 'video-cover']
  },
  {
    id: 'douyin-lifestyle-story',
    platformId: 'douyin',
    industryIds: ['home', 'appliances-kitchen', 'food', 'beverage-alcohol', 'baby-pet', 'general'],
    nameEn: 'Douyin lifestyle story',
    nameZh: '抖音生活方式套图',
    descriptionEn: 'A warmer scene-led set with product evidence and a six-shot story.',
    descriptionZh: '以温暖使用场景串联商品证据、细节和六镜头故事。',
    visualStyleId: 'warm-lifestyle',
    selectedSlotIds: ['cover-square', 'material-portrait', 'three-second-benefit', 'person-scene', 'detail-closeup', 'video-cover', 'video-storyboard']
  },
  {
    id: 'amazon-compliance-core',
    platformId: 'amazon',
    industryIds: ['computer-office', 'consumer-electronics', 'appliances-kitchen', 'sports-outdoor', 'tools-commercial', 'automotive', 'general'],
    nameEn: 'Amazon compliance core',
    nameZh: 'Amazon 合规核心套图',
    descriptionEn: 'White background, multiple angles, feature proof, dimensions, details and package contents.',
    descriptionZh: '覆盖白底、多角度、功能证据、尺寸、细节和包装清单。',
    visualStyleId: 'technical-proof',
    selectedSlotIds: ['compliant-main', 'multi-angle', 'feature', 'dimensions', 'lifestyle', 'material-detail', 'package-contents']
  },
  {
    id: 'amazon-lifestyle-plus',
    platformId: 'amazon',
    industryIds: ['apparel', 'footwear-bags', 'beauty', 'home', 'baby-pet', 'general'],
    nameEn: 'Amazon lifestyle plus',
    nameZh: 'Amazon 场景增强套图',
    descriptionEn: 'A compliant listing set strengthened with believable lifestyle and variant visuals.',
    descriptionZh: '在合规基础上强化可信使用场景、材质和规格变体。',
    visualStyleId: 'warm-lifestyle',
    selectedSlotIds: ['compliant-main', 'multi-angle', 'feature', 'dimensions', 'lifestyle', 'material-detail', 'variant']
  },
  {
    id: 'shopify-brand-story',
    platformId: 'shopify',
    industryIds: ['beauty', 'home', 'food', 'beverage-alcohol', 'accessories-jewelry', 'general'],
    nameEn: 'Shopify brand story',
    nameZh: 'Shopify 品牌故事套图',
    descriptionEn: 'Hero, gallery, lifestyle, detail, social and video assets with one coherent brand mood.',
    descriptionZh: '以统一品牌气质覆盖 Hero、画廊、生活方式、细节、社交和视频。',
    visualStyleId: 'premium-editorial',
    selectedSlotIds: ['product-hero', 'collection-card', 'gallery-angle', 'lifestyle', 'material-detail', 'social-share', 'video-cover']
  },
  {
    id: 'shopify-product-system',
    platformId: 'shopify',
    industryIds: ['computer-office', 'consumer-electronics', 'appliances-kitchen', 'sports-outdoor', 'tools-commercial', 'general'],
    nameEn: 'Shopify product system',
    nameZh: 'Shopify 产品系统套图',
    descriptionEn: 'A structured product gallery with how-to, bundle, variants and 3D handoff references.',
    descriptionZh: '结构化覆盖商品画廊、使用步骤、组合、变体与 3D 交接参考。',
    visualStyleId: 'tech-precision',
    selectedSlotIds: ['product-hero', 'collection-card', 'gallery-angle', 'lifestyle', 'material-detail', 'how-to', 'bundle-cross-sell', 'variant', 'model-brief']
  }
];

function slot(id, nameEn, nameZh, aspectRatio, recommendedSize, required, purposeEn, purposeZh) {
  return { id, nameEn, nameZh, aspectRatio, recommendedSize, required, purposeEn, purposeZh };
}

function industry(id, nameEn, nameZh, examplesEn, examplesZh, visualStyleIds, visualFocusEn, visualFocusZh) {
  return { id, nameEn, nameZh, examplesEn, examplesZh, visualStyleIds, visualFocusEn, visualFocusZh };
}

function visualStyle(id, nameEn, nameZh, descriptionEn, descriptionZh, promptZh, colors) {
  return { id, nameEn, nameZh, descriptionEn, descriptionZh, promptZh, colors };
}

export function getEcommercePlatform(platformId) {
  return ECOMMERCE_PLATFORMS.find((platform) => platform.id === platformId) || ECOMMERCE_PLATFORMS[0];
}

export function getDefaultSlotIds(platformId) {
  return getEcommercePlatform(platformId).slots.map((item) => item.id);
}

export function getEcommerceIndustry(industryId) {
  return ECOMMERCE_INDUSTRIES.find((industryItem) => industryItem.id === industryId) || ECOMMERCE_INDUSTRIES[ECOMMERCE_INDUSTRIES.length - 1];
}

export function getEcommerceVisualStyle(styleId) {
  return ECOMMERCE_VISUAL_STYLES.find((styleItem) => styleItem.id === styleId) || ECOMMERCE_VISUAL_STYLES[0];
}

export function getVisualStylesForIndustry(industryId) {
  const industryItem = getEcommerceIndustry(industryId);
  return (industryItem.visualStyleIds || [])
    .map((styleId) => ECOMMERCE_VISUAL_STYLES.find((styleItem) => styleItem.id === styleId))
    .filter(Boolean);
}

export function getEcommerceTemplates(platformId, industryId) {
  const exact = ECOMMERCE_P1_TEMPLATES.filter((item) => (
    item.platformId === platformId && item.industryIds.includes(industryId)
  ));
  if (exact.length) return exact;
  return ECOMMERCE_P1_TEMPLATES.filter((item) => item.platformId === platformId);
}

const ECOMMERCE_INDUSTRY_KEYWORDS = [
  ['apparel', ['服装', '女装', '男装', '内衣', '泳衣', '家居服', '衬衫', '裙', '裤', '外套', 't-shirt', 'shirt', 'dress', 'jacket', 'apparel']],
  ['footwear-bags', ['鞋', '靴', '箱包', '手提包', '背包', '行李箱', 'sneaker', 'shoe', 'boot', 'bag', 'luggage']],
  ['accessories-jewelry', ['首饰', '珠宝', '项链', '戒指', '耳环', '手表', '腕表', '眼镜', '配饰', 'jewelry', 'watch', 'necklace', 'ring']],
  ['beauty', ['护肤', '彩妆', '面霜', '精华', '口红', '香水', '洗发', '沐浴', '面膜', 'beauty', 'skincare', 'cosmetic', 'perfume']],
  ['health', ['护理仪', '按摩仪', '血压', '血糖', '理疗', '护具', '健康', 'care device', 'wellness']],
  ['computer-office', ['电脑', '键盘', '鼠标', '显示器', '打印机', '办公', '文具', '笔记本', 'laptop', 'keyboard', 'mouse', 'monitor', 'office']],
  ['consumer-electronics', ['手机', '耳机', '音箱', '相机', '充电', '数据线', '平板', '数码', 'phone', 'earbuds', 'speaker', 'camera', 'charger']],
  ['home', ['家具', '沙发', '床', '桌', '椅', '灯具', '窗帘', '家居', '收纳', 'sofa', 'furniture', 'home decor']],
  ['appliances-kitchen', ['保温杯', '水杯', '锅', '餐具', '厨具', '咖啡机', '榨汁机', '空气炸锅', '电器', '家电', 'tumbler', 'cookware', 'appliance']],
  ['food', ['食品', '零食', '坚果', '水果', '蔬菜', '肉', '海鲜', '调味', 'food', 'snack', 'fresh']],
  ['beverage-alcohol', ['矿泉水', '饮用水', '纯净水', '饮料', '咖啡', '茶', '酒', '果汁', '汽水', 'mineral water', 'drinking water', 'beverage', 'coffee', 'tea', 'wine', 'beer']],
  ['sports-outdoor', ['运动', '健身', '瑜伽', '露营', '户外', '登山', '骑行', '帐篷', 'sport', 'fitness', 'outdoor', 'camping']],
  ['tools-commercial', ['工具', '五金', '钻机', '扳手', '螺丝刀', '设备', '耗材', 'tool', 'hardware', 'equipment']],
  ['automotive', ['汽车', '车载', '轮胎', '车灯', '机油', '洗车', 'automotive', 'vehicle', 'car accessory']],
  ['toys-collectibles', ['玩具', '潮玩', '手办', '模型', '积木', '收藏', 'toy', 'collectible', 'figure']],
  ['baby-pet', ['母婴', '婴儿', '儿童', '奶瓶', '纸尿裤', '宠物', '猫', '狗', 'baby', 'pet']]
];

export function inferEcommerceIndustryId(...values) {
  const text = values.flat().map((value) => String(value || '').toLowerCase()).join(' ');
  const match = ECOMMERCE_INDUSTRY_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)));
  return match?.[0] || 'general';
}

export function getEcommerceSubcategories(industryId) {
  return ECOMMERCE_SUBCATEGORIES[industryId] || ECOMMERCE_SUBCATEGORIES.general;
}

export function getEcommerceSubcategory(industryId, subcategoryId) {
  const subcategories = getEcommerceSubcategories(industryId);
  return subcategories.find((item) => item.id === subcategoryId) || subcategories[0];
}

export function inferEcommerceSubcategoryId(industryId, ...values) {
  const text = values.flat().map((value) => String(value || '').toLowerCase()).join(' ');
  const subcategories = getEcommerceSubcategories(industryId);
  const match = subcategories.find((item) => item.keywords.some((keyword) => text.includes(keyword)));
  return match?.id || subcategories[0].id;
}

export function isValidSubcategory(industryId, subcategoryId) {
  return getEcommerceSubcategories(industryId).some((item) => item.id === subcategoryId);
}

export function getDefaultEcommercePlan(platformId, industryId = 'general') {
  const platform = getEcommercePlatform(platformId);
  const resolvedIndustryId = isValidIndustry(industryId) ? industryId : 'general';
  const template = getEcommerceTemplates(platform.id, resolvedIndustryId)[0] || null;
  const validSlotIds = new Set(platform.slots.map((item) => item.id));
  const selectedSlotIds = (template?.selectedSlotIds || platform.slots.filter((item) => item.required).map((item) => item.id))
    .filter((slotId) => validSlotIds.has(slotId));
  return {
    templateId: template?.id || '',
    visualStyleId: template?.visualStyleId || getVisualStylesForIndustry(resolvedIndustryId)[0]?.id || 'clean-commercial',
    selectedSlotIds: selectedSlotIds.length ? selectedSlotIds : platform.slots.slice(0, 4).map((item) => item.id)
  };
}

export function getEcommerceTemplate(templateId) {
  return ECOMMERCE_P1_TEMPLATES.find((item) => item.id === templateId) || null;
}

export function isValidIndustry(industryId) {
  return ECOMMERCE_INDUSTRIES.some((item) => item.id === industryId);
}

export function isValidVisualStyle(styleId) {
  return ECOMMERCE_VISUAL_STYLES.some((item) => item.id === styleId);
}
