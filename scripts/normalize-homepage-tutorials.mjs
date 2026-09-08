import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(process.cwd(), 'content/homepage-tutorials');

const configs = {
  '02-bracelet-douyin-campaign': {
    tips: [
      '母版必须完整显示整圈珠子，不能用被遮挡的佩戴图作为唯一依据。',
      '逐张核对珠子数量、综合色彩、排列和串线，不要只看氛围是否漂亮。',
      '佩戴场景要检查手腕尺寸、接触位置和手部结构。',
      '商品名称不能被扩写成未经证实的功效、认证或疗效承诺。'
    ]
  },
  '03-one-product-five-campaigns': {
    status: 'review',
    durationMinutes: 3,
    problem: '同一件商品需要测试多种广告方向，但逐条重复上传和等待既慢，也不方便团队并排比较。',
    audience: ['广告设计师', '品牌运营', '社交媒体团队', '电商视觉团队'],
    entry: { page: '灵感生图', mode: '批量生图', label: '进入 Pic365 开始创作', href: '/#create', instruction: '进入灵感生图后选择批量生图，上传一张商品图并添加多条提示词。' },
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以查看教程和准备素材；保存或提交任务时按页面提示登录。',
      unavailable: '功能暂时不可用时保留图片和提示词，稍后重试，不要重复提交相同任务。'
    },
    prompt: '保持图中黑色金属手机支架的圆形底座、旋转关节、倾斜支撑板、三条竖向开孔、两个承托钩和整体比例完全一致。制作极简浅灰棚拍广告图，柔和阴影，主体居中，背景干净，不增加文字、Logo、手机或配件。',
    tips: ['每条提示词都重复商品结构约束。', '五个方向只改变背景、光线、场景和广告气质。', '结果并排比较后再选择一个方向继续精修。', '发现商品结构漂移时只重做对应任务。']
  },
  '04-batch-product-unification': {
    title: '四张商品照片，一次统一风格',
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '批量改图需要登录；未登录时可以先准备图片、顺序和统一提示词。',
      unavailable: '批量任务暂时不可用时保留素材与提示词，稍后重试，不要重复提交。'
    }
  },
  '05-toy-precision-retouch': {
    status: 'review',
    durationMinutes: 3,
    problem: '照片整体已经可用，却被飞虫、杂物或局部瑕疵影响，不值得重新拍摄，也不希望整张图片重新生成。',
    audience: ['商品摄影', '二手电商', '内容设计师', '商品录入团队'],
    entry: { page: '灵感生图', mode: '单图创作', label: '进入 Pic365 开始创作', href: '/#create', instruction: '上传母版后打开标记区域工具，只涂抹需要删除的位置。' },
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以查看教程；保存或提交局部精修任务时按页面提示登录。',
      unavailable: '功能暂时不可用时保留原图、标记和提示词，稍后重试。'
    },
    prompt: '仅删除图1涂抹区域内的蜻蜓及其运动轨迹，用周围墙面与窗帘的真实颜色、纹理和光线自然补全。除涂抹区域外，玩偶、机器人、球拍、底座、桌面、背景、构图、色彩、光线和所有细节保持不变。不要新增文字、物体或改变任何角色造型。',
    tips: ['涂抹范围只覆盖目标和必要边缘。', '生成前保持与原图相同的画幅比例。', '放大检查主体边缘、纹理、文字和背景。', '生成式编辑不能承诺未涂抹区域像素级不变。']
  },
  '06-model-accessory-swap': {
    durationMinutes: 5,
    subtitle: '同一母版分别换包、手表、鞋子和发型；当前包含三个采用结果和一个换鞋风险示例。',
    problem: '不同商品都重新拍摄同一位模特成本高、速度慢，需要保持人物、姿势和场景，只替换指定商品或发型。',
    audience: ['服饰电商', '箱包商家', '鞋类商家', '手表与造型团队'],
    entry: { page: '灵感生图', mode: '单图创作', label: '进入 Pic365 开始创作', href: '/#create', instruction: '上传人物母版，每次只添加一张对应商品参考图，并建立独立生成分支。' },
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以准备人物和商品图片；保存或提交任务时按页面提示登录。',
      unavailable: '当前模型不支持所需参考图时，保留素材并改用支持该能力的模型。'
    },
    inputs: [
      { label: '成年模特母版', file: 'source/model.webp', purpose: '锁定人物身份、姿势、服装、背景和镜头' },
      { label: '包商品参考', file: 'source/bag.webp', purpose: '只控制包体、背带和金属件' },
      { label: '手表参考', file: 'source/watch.webp', purpose: '只控制表盘、表带和佩戴关系' },
      { label: '鞋商品参考', file: 'source/shoes.webp', purpose: '只控制鞋型、配色和材质' },
      { label: '发型参考', file: 'source/hair.webp', purpose: '只控制头发轮廓和发丝走向' }
    ],
    steps: [
      { number: 1, title: '上传模特作为母版', body: '人物母版决定身份、服装、背景和镜头。', image: 'source/model.webp' },
      { number: 2, title: '只添加当前分支参考', body: '换包、换表、换鞋和换发型分别只添加对应参考图。', image: 'source/bag.webp' },
      { number: 3, title: '写清修改项与锁定项', body: '先说明只修改什么，再锁定人物、服装、姿势、背景和其他配件。', image: 'source/watch.webp' },
      { number: 4, title: '分别生成独立版本', body: '每个分支都从同一原始人物母版开始。', image: 'results/bag.webp' },
      { number: 5, title: '检查指定和意外变化', body: '确认商品正确后，再检查脸、姿势、服装、背景和镜头。', image: 'results/watch.webp' },
      { number: 6, title: '保留合格结果与风险案例', body: '换鞋因母版没有完整双脚，应更换全身母版重做。', image: 'results/shoes.webp' }
    ],
    prompt: '只替换图1模特当前携带的包为图2商品包。严格保持同一位成年模特的脸、发型、表情、姿势、服装、身体比例、背景、镜头和光线不变；包体结构、纹理、前袋、拉链、背带和金属件以图2为准，佩戴关系自然真实。不要改变鞋、手腕或其他内容。',
    results: [
      { label: '换包', file: 'results/bag.webp', usage: '独立换包分支' },
      { label: '换手表', file: 'results/watch.webp', usage: '独立换表分支' },
      { label: '换鞋风险示例', file: 'results/shoes.webp', usage: '说明母版必须完整显示双脚' },
      { label: '换发型', file: 'results/hair.webp', usage: '独立换发型分支' }
    ],
    tips: ['每个分支都从原始母版开始。', '参考图只提供指定商品或发型。', '换鞋必须完整显示双脚和地面接触关系。', '同时检查人物身份、姿势、镜头和未修改区域。'],
    assets: { cover: 'cover.webp', compare: 'compare/before-after.webp' }
  },
  '07-multi-reference-creative-ad': {
    status: 'review',
    durationMinutes: 4,
    problem: '复杂广告需要组合人物、商品、配件、伙伴和场景，但如果不明确每张参考图的职责，内容容易混淆或遗漏。',
    audience: ['创意广告团队', '活动海报设计师', '品牌运营', '概念设计团队'],
    entry: { page: '灵感生图', mode: '单图创作', label: '进入 Pic365 开始创作', href: '/#create', instruction: '先上传人物母版，再按图2至图5依次添加商品、配件、伙伴和场景。' },
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以准备五张参考图和编号提示词；提交任务时按页面提示登录。',
      unavailable: '当前模型不支持所需参考图数量时，减少参考图或选择支持多参考图的模型。'
    },
    inputs: [
      { label: '图1 人物母版', file: 'source/source-01-person.webp', purpose: '控制人物身份与面部特征' },
      { label: '图2 商品包', file: 'source/source-02-bag.webp', purpose: '控制包体结构' },
      { label: '图3 银色耳机', file: 'source/source-03-earbuds.webp', purpose: '控制双耳配件' },
      { label: '图4 红色狐狸', file: 'source/source-04-fox.webp', purpose: '控制伙伴角色' },
      { label: '图5 幻想场景', file: 'source/source-05-scene.webp', purpose: '控制背景氛围' }
    ],
    steps: [
      { number: 1, title: '进入单图创作', body: '先确认当前模型支持五张参考图。', image: 'screens/01-single-entry.png' },
      { number: 2, title: '按顺序上传五张图', body: '缩略图编号就是提示词中使用的图号。', image: 'screens/02-five-references.png' },
      { number: 3, title: '逐图写清职责', body: '按图1人物至图5场景逐项说明。', image: 'screens/03-numbered-prompt.png' },
      { number: 4, title: '提交一次完整合成', body: '五张参考图共同控制一张完整广告。', image: 'screens/04-generating.png' },
      { number: 5, title: '检查职责是否齐全', body: '确认人物、包、耳机、狐狸和场景都存在。', image: 'screens/05-result-complete.png' },
      { number: 6, title: '打开大图逐项复核', body: '放大检查耳机、包体、人物身份和品牌标识。', image: 'screens/06-result-preview.png' }
    ],
    prompt: '以图1的人物为唯一人物母版；图2只控制斜肩包；图3只控制双耳银色耳机；图4只控制红色狐狸伙伴；图5只控制仙侠云海、石桥和远山场景。保持各参考职责互不混淆，生成一张完整的东方幻想创意广告。',
    results: [
      { label: '参考图职责示意', file: 'compare/reference-map.webp', usage: '说明图1至图5分工' },
      { label: '采用版本', file: 'results/result-01.webp', usage: '五项参考职责均可辨认' },
      { label: '淘汰版本', file: 'results/rejected-01-earbuds-missing.webp', usage: '说明耳机职责缺失时需要重做' }
    ],
    tips: ['参考图按稳定顺序上传并记录编号。', '提示词逐项说明每张图片只控制什么。', '结果中逐个核对五项职责。', '涉及人物肖像和品牌标识时必须完成授权检查。'],
    assets: { cover: 'cover.webp', compare: 'compare/reference-map.webp' }
  },
  '08-canvas-video-storyboard': {
    status: 'review',
    durationMinutes: 5,
    problem: '角色、场景、道具和镜头版本分散时，很难看清引用关系，也不方便把选定画面继续生成视频。',
    audience: ['短剧编导', '分镜师', '短视频创作者', '视觉策划团队'],
    entry: { page: '无限画布', mode: '画布项目', label: '进入 Pic365 开始创作', href: '/#canvas', instruction: '把角色、场景和镜头素材加入画布，锁定关键实体后再建立生成分支。' },
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以查看教程；保存画布项目或生成视频时按页面提示登录。',
      unavailable: '视频能力暂时不可用时先保存静态分镜和引用关系，稍后再生成动态结果。'
    },
    inputs: [{ label: '真实画布镜头源图', file: 'source/source-01.webp', purpose: '展示角色、场景和镜头分支的起点' }],
    prompt: '保持画布中已锁定角色的身份、服装和道具一致，围绕当前选中镜头描述一个主要动作、镜头运动和氛围变化，再将确认后的静态画面生成短视频。',
    results: [
      { label: '开篇镜头', file: 'results/01-opening.webp', usage: '故事开场' },
      { label: '角色镜头', file: 'results/02-character.webp', usage: '角色建立' },
      { label: '骑乘镜头', file: 'results/03-riding.webp', usage: '动作推进' },
      { label: '战斗镜头', file: 'results/04-battle.webp', usage: '冲突镜头' },
      { label: '短视频预览', file: 'results/storyboard-preview.mp4', usage: '图生视频结果' }
    ],
    tips: ['先明确角色、场景和道具职责。', '锁定已经确认的关键实体。', '每个镜头只表达一个主要动作。', '先验收静态图，再投入视频生成。'],
    assets: { cover: 'cover.webp', compare: 'compare/storyboard-overview.webp', video: 'results/storyboard-preview.mp4' }
  },
  '09-poem-teaching-illustration': {
    status: 'review',
    durationMinutes: 4,
    problem: '同一首古诗需要横版课件、竖版封面和人物知识卡，重复制作耗时，也容易让画面与诗意脱节。',
    audience: ['语文教师', '出版编辑', '知识内容创作者', '教育机构'],
    entry: { page: '灵感生图', mode: '单图创作', label: '进入 Pic365 开始创作', href: '/#create', instruction: '输入诗文和画面重点，再按课件、封面或知识卡用途选择尺寸。' },
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以准备诗文和提示词；保存或提交任务时按页面提示登录。',
      unavailable: '功能暂时不可用时保存诗文、尺寸和提示词，稍后重试。'
    },
    inputs: [{ label: '古诗与教学重点', file: 'source/poem-source.webp', purpose: '提供诗文、景物、情绪和课堂用途' }],
    prompt: '《登鹳雀楼》课堂插画：盛唐边塞山水，黄河奔流进入远方，夕阳依山而落，鹳雀楼高耸，登楼远眺的诗人背影。中国传统青绿山水与淡彩工笔结合，留出课件标题安全区，无任何文字、印章、水印或现代元素。',
    tips: ['把诗句中的景物与动作逐项变成可见画面。', '古诗正文、作者和朝代应人工校对并后期排版。', '横版课件和竖版封面分别生成。', '保存到教学素材分类前再次核对用途和尺寸。'],
    assets: { cover: 'cover.webp', compare: 'compare/teaching-set.webp' }
  },
  '10-story-to-picture-book': {
    availability: {
      pricing: '提交前以 Pic365 当时页面显示的规则为准，教程不展示固定价格。',
      signedOut: '未登录时可以准备故事梗概和角色设定；保存或提交任务时按页面提示登录。',
      unavailable: '批量任务暂时不可用时保留角色卡和分镜提示词，逐镜头稍后重试。'
    },
    prompt: '以图1中的原创小红熊猫“栗栗”为唯一角色母版，严格保持红棕色毛发、奶白脸颊、环纹尾巴、黄色连帽雨衣、青绿色小背包、蓝色雨靴和绿色叶片别针一致。每条提示词只描述一个故事时刻，并保持统一儿童绘本画风。'
  }
};

const exactReplacements = {
  '03-one-product-five-campaigns': [
    ['五张均来自本次真实批量任务，每张使用同一个商品源图，单张实际计费 4 积分，合计 20 积分。', '五张均来自本次真实批量任务，每张使用同一个商品源图，并按同一商品约束分别执行。'],
    ['页面会实时显示数量和计费，正式提交时以当前界面为准。', '页面会实时显示任务数量和当前可用规则，正式提交时以当前界面为准。'],
    ['确认提示词数量、尺寸、质量和总积分，再一次提交。', '确认提示词数量、尺寸、质量和任务总数，再一次提交。'],
    ['页面实时显示五条任务合计 20 积分。', '页面会实时显示五条独立任务。'],
    ['五个任务全部真实成功，每项 4 积分，本次合计 20 积分。', '五个任务全部真实成功，并保留为五个独立广告方向。']
  ],
  '04-batch-product-unification': [
    ['一组商品素材，生成两种震撼场景', '四张商品照片，一次统一风格'],
    ['使用 High 质量，页面实时报价 963 积分。', '质量与可用规则以提交时页面显示为准。'],
    ['按要求使用 Low 质量，页面报价与实际扣费均为 44 积分。', '质量与可用规则以提交时页面显示为准。'],
    ['本次实际扣费：44 积分', '状态：四张任务均已完成'],
    ['页面提交报价：963 积分；教程正文不把该价格承诺为长期固定价格。', '提交时使用的质量和可用规则已记录，但教程不展示固定价格。'],
    ['户外运动批次页面报价及实际扣费：44 积分，4 张各 11 积分。', '户外运动批次的四张任务均已完成。']
  ],
  '05-toy-precision-retouch': [
    ['本次采用结果页面显示消耗 3 积分；价格以后续页面实时报价为准。', '本次采用结果来自真实任务；提交规则以后续页面实时显示为准。'],
    ['本次保持纵向尺寸，页面显示 3 积分。提交后只等待这一张局部修复任务。', '本次保持纵向尺寸，提交后只等待这一张局部修复任务。'],
    ['合格输出：768×1344，页面提交价 3 积分。', '合格输出：768×1344，提交规则以当时页面显示为准。']
  ],
  '06-model-accessory-swap': [
    ['12 积分实测', '4 个独立结果']
  ],
  '07-multi-reference-creative-ad': [
    ['第二版真实任务生成于 1024×1536，页面显示 4 积分。第一版因耳机不清晰而被淘汰。', '第二版真实任务生成于 1024×1536。第一版因耳机不清晰而被淘汰。'],
    ['页面显示本次任务4积分。提交后等待一张完整结果，不要把五张图拆成五个独立任务。', '提交后等待一张完整结果，不要把五张图拆成五个独立任务。'],
    ['输出：1024×1536，页面显示 4 积分。', '输出：1024×1536，提交规则以当时页面显示为准。']
  ],
  '09-poem-teaching-illustration': [
    ['11 积分实测', '4 张真实结果'],
    ['4 + 4 + 3', '课件、封面与知识卡'],
    ['精灵文案 0.92 积分 + 课件生图 4 积分', '课堂文案与课件主视觉分别生成'],
    ['本次真实调用', '本次真实流程']
  ]
};

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function writeJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function removeCreditFields(value) {
  if (Array.isArray(value)) return value.map(removeCreditFields);
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (/credit/i.test(key) || key === 'pricingSnapshot' || key === 'priceText' || key === 'quotedCredits') continue;
    next[key] = removeCreditFields(child);
  }
  return next;
}

async function convertImage(source, target) {
  if (path.resolve(source) === path.resolve(target)) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await sharp(source).webp({ quality: 84, effort: 6 }).toFile(target);
}

async function createPoemSource(target) {
  const svg = `<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="900" fill="#f2ead9"/><circle cx="1020" cy="135" r="86" fill="#d9a45e" opacity=".75"/><path d="M0 690 C210 520 340 620 520 470 C690 330 810 520 1200 285 V900 H0Z" fill="#8aa091"/><path d="M0 760 C260 610 410 730 650 560 C820 445 1010 570 1200 430 V900 H0Z" fill="#536f64"/><text x="92" y="155" font-family="Microsoft YaHei, serif" font-size="42" fill="#36483f">课堂素材输入</text><text x="92" y="245" font-family="Microsoft YaHei, serif" font-size="72" font-weight="700" fill="#24372f">《登鹳雀楼》</text><text x="96" y="335" font-family="Microsoft YaHei, serif" font-size="34" fill="#465d52">白日依山尽，黄河入海流。</text><text x="96" y="395" font-family="Microsoft YaHei, serif" font-size="34" fill="#465d52">欲穷千里目，更上一层楼。</text><text x="96" y="500" font-family="Microsoft YaHei, serif" font-size="27" fill="#6a776f">用途：横版课件背景 · 竖版读物封面 · 人物知识卡</text><text x="96" y="550" font-family="Microsoft YaHei, serif" font-size="27" fill="#6a776f">重点：诗意对应、版式留白、文字后期人工校对</text></svg>`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(target);
}

for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^\d{2}-/.test(entry.name)) continue;
  const dir = path.join(root, entry.name);
  const tutorialFile = path.join(dir, 'tutorial.json');
  const htmlFile = path.join(dir, 'index.html');
  let tutorial = JSON.parse(await fs.readFile(tutorialFile, 'utf8'));
  tutorial = { ...tutorial, ...(configs[entry.name] || {}), status: 'review', enabled: false };
  tutorial = removeCreditFields(tutorial);

  let html = await fs.readFile(htmlFile, 'utf8');
  for (const [from, to] of exactReplacements[entry.name] || []) html = html.split(from).join(to);
  if (!html.includes('../tutorial-theme.css')) html = html.replace('</head>', '<link rel="stylesheet" href="../tutorial-theme.css"><script src="../tutorial-theme.js"></script></head>');
  if (entry.name === '08-canvas-video-storyboard' && !html.includes('.cta{padding:38px')) {
    html = html.replace('</style>', '.cta{padding:38px;border:1px solid #304760;border-radius:26px;background:linear-gradient(145deg,#102237,#111627);display:flex;align-items:center;justify-content:space-between;gap:24px}.cta h2{margin:10px 0}.cta p{margin:0;color:var(--muted);line-height:1.7}.primary{min-height:50px;padding:0 22px;border-radius:25px;display:inline-flex;align-items:center;justify-content:center;color:#07120d;background:var(--green);font-weight:850;text-decoration:none;white-space:nowrap}@media(max-width:760px){.cta{display:block;padding:28px}.cta .primary{width:100%;margin-top:16px}}</style>');
  }

  const sourceFields = tutorial.inputs || tutorial.sourceImages || [];
  for (const item of sourceFields) {
    if (!item?.file || !/\.(png|jpe?g)$/i.test(item.file)) continue;
    const oldRef = item.file;
    const newRef = oldRef.replace(/\.(png|jpe?g)$/i, '.webp');
    await convertImage(path.join(dir, oldRef), path.join(dir, newRef));
    item.file = newRef;
    html = html.split(oldRef).join(newRef);
  }

  const sourceDir = path.join(dir, 'source');
  if (await exists(sourceDir)) {
    for (const sourceName of await fs.readdir(sourceDir)) {
      if (!/\.(png|jpe?g)$/i.test(sourceName)) continue;
      const newName = sourceName.replace(/\.(png|jpe?g)$/i, '.webp');
      await convertImage(path.join(sourceDir, sourceName), path.join(sourceDir, newName));
      html = html.split(`source/${sourceName}`).join(`source/${newName}`);
    }
  }

  if (Array.isArray(tutorial.steps)) {
    await fs.mkdir(path.join(dir, 'steps'), { recursive: true });
    for (let i = 0; i < tutorial.steps.length; i += 1) {
      const step = tutorial.steps[i];
      const oldRef = step.image || step.screen;
      if (!oldRef) continue;
      const newRef = `steps/step-${String(i + 1).padStart(2, '0')}.webp`;
      if (path.resolve(path.join(dir, oldRef)) !== path.resolve(path.join(dir, newRef))) {
        await convertImage(path.join(dir, oldRef), path.join(dir, newRef));
      }
      step.number ||= i + 1;
      step.image = newRef;
      delete step.screen;
      html = html.split(oldRef).join(newRef);
    }
  }

  if (Array.isArray(tutorial.results)) {
    for (const item of tutorial.results) {
      if (!item?.file || !/\.(png|jpe?g)$/i.test(item.file)) continue;
      const oldRef = item.file;
      const newRef = oldRef.replace(/\.(png|jpe?g)$/i, '.webp');
      await convertImage(path.join(dir, oldRef), path.join(dir, newRef));
      item.file = newRef;
      html = html.split(oldRef).join(newRef);
    }
  }

  if (Array.isArray(tutorial.branches)) {
    for (const branch of tutorial.branches) {
      branch.files = await Promise.all((branch.files || []).map(async (oldRef) => {
        if (!/\.(png|jpe?g)$/i.test(oldRef)) return oldRef;
        const newRef = oldRef.replace(/\.(png|jpe?g)$/i, '.webp');
        await convertImage(path.join(dir, oldRef), path.join(dir, newRef));
        html = html.split(oldRef).join(newRef);
        return newRef;
      }));
    }
  }

  html = html.replace(/<a class="([^"]*primary[^"]*)"(?![^>]*id="tryDemo")/g, '<a class="$1" id="tryDemo"');
  await fs.writeFile(htmlFile, html, 'utf8');
  await writeJson(tutorialFile, tutorial);

  const provenanceFile = path.join(dir, 'provenance.json');
  if (await exists(provenanceFile)) {
    const provenance = removeCreditFields(JSON.parse(await fs.readFile(provenanceFile, 'utf8')));
    await writeJson(provenanceFile, provenance);
  }
  for (const summary of ['screens/capture-summary.json', 'screens/capture-summary-outdoor.json']) {
    const summaryFile = path.join(dir, summary);
    if (await exists(summaryFile)) {
      const data = removeCreditFields(JSON.parse(await fs.readFile(summaryFile, 'utf8')));
      await writeJson(summaryFile, data);
    }
  }
}

const sixDir = path.join(root, '06-model-accessory-swap');
await fs.mkdir(path.join(sixDir, 'compare'), { recursive: true });
await fs.copyFile(path.join(sixDir, 'cover.webp'), path.join(sixDir, 'compare/before-after.webp'));

const eightDir = path.join(root, '08-canvas-video-storyboard');
await fs.mkdir(path.join(eightDir, 'source'), { recursive: true });
await convertImage(path.join(eightDir, 'results/branch-b-source.webp'), path.join(eightDir, 'source/source-01.webp'));
await fs.mkdir(path.join(eightDir, 'compare'), { recursive: true });
const storyboardInputs = ['01-opening.webp', '02-character.webp', '03-riding.webp', '04-battle.webp'];
const storyboardTiles = await Promise.all(storyboardInputs.map((name) => sharp(path.join(eightDir, 'results', name)).resize(560, 420, { fit: 'cover' }).toBuffer()));
await sharp({ create: { width: 1120, height: 840, channels: 3, background: '#08111f' } }).composite([
  { input: storyboardTiles[0], left: 0, top: 0 }, { input: storyboardTiles[1], left: 560, top: 0 },
  { input: storyboardTiles[2], left: 0, top: 420 }, { input: storyboardTiles[3], left: 560, top: 420 }
]).webp({ quality: 88 }).toFile(path.join(eightDir, 'compare/storyboard-overview.webp'));

const nineDir = path.join(root, '09-poem-teaching-illustration');
await createPoemSource(path.join(nineDir, 'source/poem-source.webp'));
await fs.mkdir(path.join(nineDir, 'compare'), { recursive: true });
await fs.copyFile(path.join(nineDir, 'results/teaching-set.webp'), path.join(nineDir, 'compare/teaching-set.webp'));

const indexFile = path.join(root, 'index.json');
const index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
const tutorials = [];
for (const entry of await fs.readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^\d{2}-/.test(entry.name)) continue;
  const tutorial = JSON.parse(await fs.readFile(path.join(root, entry.name, 'tutorial.json'), 'utf8'));
  tutorials.push({
    slug: tutorial.slug,
    enabled: false,
    featured: tutorial.featured !== false,
    order: tutorial.order,
    category: tutorial.category,
    status: 'review',
    title: tutorial.title,
    summary: tutorial.subtitle,
    durationMinutes: tutorial.durationMinutes || Number.parseInt(tutorial.duration, 10) || 4,
    cover: `${tutorial.slug}/cover.webp`,
    href: `/homepage-tutorials/${tutorial.slug}/index.html`
  });
}
index.version = 2;
index.updatedAt = '2026-09-06';
index.items = tutorials.sort((a, b) => a.order - b.order);
await writeJson(indexFile, index);

console.log(`Normalized ${tutorials.length} homepage tutorials.`);
