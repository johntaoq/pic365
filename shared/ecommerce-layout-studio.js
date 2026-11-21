import { NEW_LAYOUTS_20261108, NEW_LAYOUT_GUIDES_20261108 } from './ecommerce-layout-additions-20261108.js';

export const MAX_LAYOUT_IMAGES = 10;
export const MAX_LAYOUT_PRODUCT_IMAGES = 3;

export function layoutRequiresTemplateReference(layoutId) {
  // Requests without a known layout ID retain the old product + template contract.
  return !LAYOUT_TEMPLATES.some((layout) => layout.id === layoutId);
}

export function layoutReferenceCount(productCount, layoutId = '') {
  if (!Number.isInteger(productCount) || productCount < 1 || productCount > MAX_LAYOUT_PRODUCT_IMAGES) {
    throw new Error('INVALID_PRODUCT_REFERENCE_COUNT');
  }
  return productCount + Number(layoutRequiresTemplateReference(layoutId));
}

export const SELLING_LAYOUT_GROUPS = Object.freeze([
  { id: 'all', label: '全部', labelEn: 'All' },
  { id: 'focus', label: '主体 / 特写', labelEn: 'Subject / close-up' },
  { id: 'split', label: '分区 / 边栏', labelEn: 'Split / sidebar' },
  { id: 'cards', label: '信息 / 图标', labelEn: 'Cards / icons' },
  { id: 'collage', label: '拼贴 / 场景', labelEn: 'Collage / scene' }
]);

export const LAYOUT_IMAGE_TYPES = Object.freeze([
  { id: 'selling', label: '卖点图', labelEn: 'Benefit images' },
  { id: 'scene', label: '场景图', labelEn: 'Lifestyle images' },
  { id: 'detail', label: '细节图', labelEn: 'Detail images' }
]);

// Gallery artwork is preview-only. Every current layout is described in text;
// product identity always comes from the user's photos.
export const LAYOUT_TEMPLATES = Object.freeze([
  {
    id: 'single-frame', reference: 1, type: 'selling', group: 'focus',
    name: '银白启程', nameEn: 'Silver departure', promptName: '中心商品摄影主视觉',
    description: '整幅主视觉，上下呼应的标题与短句。',
    direction: '满版写实商业摄影，完整商品保持主图原有姿态居中，约占画面60%至65%，上下留文字安全区。背后是深墨绿色、带细致墙线的实体墙面；下方是浅灰白石质地面，有清晰墙地交界和真实接触阴影。左侧斜向暖窗光在墙面投下轻微叶影，商品表面只呈现符合原材质的自然高光。顶部用浅暖色大字排简短主标题，底部在浅色地面用深色小字排一行短句；不增添无关文案。画面无边框、卡片、拼贴或多商品；布景颜色不改变商品本色，商品不适合直立时沿原图姿态陈列。'
  },
  {
    id: 'bottom-band', reference: 2, type: 'selling', group: 'split',
    name: '旅居光影', nameEn: 'Suite light', promptName: '暖光三栏卖点图',
    description: '实景主画面，底部三段细节信息。',
    direction: '上部约78%为满幅写实商品摄影，完整商品保留主图原有视角、姿态和颜色，放在画面右侧且不被裁切；左上方预留两行主标题。背景采用暖灰石质墙面、少量深胡桃木色竖向陈列面和浅石地面，左侧斜射的午后窗光形成自然明暗与接触阴影；这是布景质感而非商品材质或旅行场景要求。底部约22%为整幅浅暖色横向信息带，以两条细竖线等分为三栏；每栏一个简洁深棕线性小图标和一条卖点短标签，文案来自已提供或安全补写的三条卖点。图标只表达对应文案，不虚构部件、性能或认证。画面边缘完整，无卡片套卡片、拼贴小商品或示例文字；输出比例改变时保持上图下带与左右文字安全区的层级。'
  },
  {
    id: 'full-bleed-detail', reference: 3, type: 'detail', group: 'focus',
    name: '箱面微观', nameEn: 'Shell study', promptName: '真实商品细节微距图',
    description: '满幅材质特写，细线标注真实结构。',
    direction: '制作单幅写实商品微距图，而非完整商品主图：只从前面的真实商品照片裁取一处清晰可见的表面与边缘细节，等比例放大并斜向穿过画面上方约75%，保留原图中各部位的相对位置、真实纹理、颜色、结构和已有商标，不重画新视角；柔和侧光形成符合原材质的细腻高光，背景为干净的浅灰白。上半部只能画0至2条极细深灰引线，第三条绝对不要出现；引线从空白处准确指向原图确实可见且不同的部位，短标签须与线端所指部位一致，否则整条引线及标签省略。若看不清第二处细节就少用引线，不虚构铆钉、接缝、按钮、材质、内部或背面。下方约25%保留浅色完整文字区，左对齐深棕色粗体主标题及其下一行较小的深灰短句；不新增未提供的文案、品牌或图案。根据输出比例保住细节与标题，不把整张版式拉伸。'
  },
  {
    id: 'detail-window', reference: 4, type: 'selling', group: 'focus',
    name: '光影放大窗', nameEn: 'Detail in the light', promptName: '暖窗商品与单圆细节窗',
    description: '完整商品配一枚圆形细节放大窗。',
    direction: '一张无外框的暖色实景商品摄影：浅米墙、低矮木质陈列面与一处柔和绿色室内点缀，左上窗光投下自然叶影和接触阴影。原图姿态的完整商品置于中间偏下，占主要画幅，不被背景家具遮挡；左上约40%留两行深绿色大标题，其下细横线和一行短卖点。右上独立放一枚约画面宽度四分之一的白边圆形放大窗，只裁切第1张图确实可见的一处细节，圆窗不得变成第二个商品、其他角度或不同材质。圆窗、文字和商品互不重叠；不因商品不是立式陈列品而强行竖放。'
  },
  {
    id: 'stacked-split', reference: 5, type: 'selling', group: 'split',
    name: '山景三联', nameEn: 'Scenic feature trio', promptName: '上部实景下部三联细节',
    description: '上部场景主视觉，下部三格真实细节。',
    direction: '明确上图下三格：上方约65%是一张明亮自然光实景摄影，远景可有山水与天空的冷暖层次，但场景必须适合真实商品用途；左上用两行深橄榄绿粗体标题，右半部完整展示第1张的商品视角与原有颜色，保留接触阴影。下方约35%横向并排三张等宽细节照片，细白缝分隔，每张只裁切原图中不同的可见部位；每格最底部是一条深墨绿色窄色带，白色短标签各一条，对应真实细节或已给卖点。若不足三处可见细节，重复同一商品的真实局部或留白，绝不补画未拍到的结构。'
  },
  {
    id: 'side-labels', reference: 6, type: 'selling', group: 'split',
    name: '城市轻旅', nameEn: 'Urban departure', promptName: '左三标签右主商品实景',
    description: '动感实景与侧栏三条图标标签。',
    direction: '满幅清爽城市建筑光影实拍，背景为薄荷绿、浅灰和自然树影，不规定商品必须在车站或旅行。右侧约55%放原图视角完整商品，左上约40%排两行炭黑大标题，标题下方一条细绿色弧线。左侧中下部纵向堆三张等宽、间距一致的浅白半透明小标签，每张左端深绿色圆形线性图标，右端用原图可见局部的小照片和一条对应卖点短文；标签不能覆盖右侧主商品。图标只象征实际文案，不暗示图中没有的部件或功能。'
  },
  {
    id: 'triple-float', reference: 7, type: 'selling', group: 'cards',
    name: '三处细看', nameEn: 'Three detail studies', promptName: '冰蓝主商品与三圆特写',
    description: '主商品与右侧三枚放大镜式特写。',
    direction: '画面上沿留约15%蓝色粗体主标题；其下是冰蓝、浅灰的自然摄影背景与低矮冷灰石质台面，景深轻柔。左侧约55%摆放原图视角完整商品，大小居首；右侧从上到下严格排列三枚等径白边圆形放大窗，每枚只呈现主图实拍可见的不同局部，圆窗右侧各一条深灰短标签。细芥黄色水平引线从主商品实际部位连到对应圆窗，不能指错位置；真实细节不够就省略不能证实的圆窗与引线。环境冷色不许把商品改为冰蓝色，三枚圆窗不是三个新商品。'
  },
  {
    id: 'benefit-cards', reference: 8, type: 'selling', group: 'cards',
    name: '石光陈列', nameEn: 'Stone and silver', promptName: '石面商品与顶端三标签',
    description: '自然光陈列，顶部三枚轻量信息标签。',
    direction: '满幅浅灰实体墙、粗细可见的浅色石质地面与少量植物叶影，左侧斜向自然阳光照亮场景。顶部约12%一行均匀排三枚轻量白色圆角胶囊标签，每枚只有一个深色细线图标与一条真实卖点；中部约60%展示原图姿态的完整商品，真实落地接触阴影和纹理清晰，白色/银灰仅是环境色，不能改变商品本色。下方靠中间排一行大号深绿色商品标题，可用一条较小且不重复的已给卖点作短句；留足边距，无参数或证书徽章。'
  },
  {
    id: 'mosaic-grid', reference: 9, type: 'selling', group: 'collage',
    name: '旅途四格', nameEn: 'Four travel frames', promptName: '四宫格中央圆形标题',
    description: '使用场景、完整商品与局部四格叙事。',
    direction: '将画面用两条细白缝等分为四个实拍方格，整体象牙白和冷灰色调：左上是商品在适合其用途的真实场景中的较小完整视角；右上是原图可见表面的一处局部特写；左下是另一处已拍到的可见边缘或配件特写；右下是原图视角的完整商品陈列。中心交点覆盖一个直径约画面四分之一的白色圆形标题章，只写商品名称且不能遮挡关键结构。每格下边角最多一枚白色小短标签，合计不超过三条不重复的已给卖点，无法核实的格子不写。四格是同一件商品，不生成额外型号、背面或不存在的部件。'
  },
  {
    id: 'arch-cards', reference: 10, type: 'scene', group: 'collage',
    name: '三扇旅窗', nameEn: 'Three travel windows', promptName: '上部主场景下部三拱窗',
    description: '上部主场景，下部三扇拱形实景窗。',
    direction: '上方约55%为一张暖白建筑室内或合适使用场景的真实摄影，原图姿态的完整商品放右侧，左上大号深灰标题及其下一行最多一条已给短卖点，窗光和投影真实。下方约45%在浅暖白底上并排三扇等宽、上圆下直的拱形照片窗，边框纤细；每窗展示同一件商品、同一真实视角在适合其用途的三种环境中，窗下各一条短标签，文字来自互不重复的已给卖点。下方环境只根据真实商品用途选择，不强行套用特定行业的场景；仅更换商品外的环境，不衍生新造型。'
  },
  {
    id: 'rule-divisions', reference: 11, type: 'detail', group: 'split',
    name: '三列工艺志', nameEn: 'Three-column study', promptName: '浅紫三列商品细节对照',
    description: '三列等宽陈列，全貌与两处真实细节。',
    direction: '整页极浅紫白摄影背景，上方约20%横跨画幅排一行深紫大标题；下方以两条极细竖线分成左中右三列等宽照片区。左列完整商品保持第1张视角、颜色与比例，置于浅紫平面；中列等比放大第1张可见的第一处边缘或表面；右列放大另一处确实可见且不同的细节，不能用虚构背面填满。每列底部留一枚浅紫圆角短标签，可用商品名称或与细节匹配的已给卖点；各列照片与标签不互相跨界，不把场景紫色染到商品。'
  },
  {
    id: 'floating-feature', reference: 12, type: 'selling', group: 'cards',
    name: '旅居信息卡', nameEn: 'Travel information card', promptName: '左主商品右三行信息卡',
    description: '大幅柔光商品，角落一张紧凑信息卡。',
    direction: '暖米色室内实拍与轻微树影形成背景，左侧约60%摆放原图视角的完整大商品，地面自然接触影，周围少量灰白与苔绿色低调家具。右上先排一行深炭色中等标题；其下右侧约28%固定一张紧凑的白色矩形信息卡，卡内严格纵向三行，以细浅灰分割线分隔：每行左边是同一商品原图中可见的方形细节小照，右边是对应的一条已给卖点短标签；不在卡内套小卡或发明新部件。信息卡不压住商品轮廓；没有可靠数字时绝不写参数。'
  },
  {
    id: 'detail-ribbons', reference: 13, type: 'detail', group: 'split',
    name: '横向工艺条', nameEn: 'Horizontal detail stories', promptName: '三条左右交错细节横幅',
    description: '三条横向特写，图文交错排布。',
    direction: '浅暖白纸面和斜向日光，顶部约20%居中排深墨绿大标题，其下细小副行仅在有不重复的已给文案时出现。下方从上至下三条等高、近乎通栏的柔和圆角横幅，留细白间隔：第一条左半幅是原图可见细节大特写，右半幅是短卖点；第二条左半幅是短卖点，右半幅是另一处实拍细节；第三条重新左图右文。每条色块为淡暖白，局部细线、极少菱形点缀和真实高光；三条均来自同一商品的可见局部，不重复虚构不同部件，也不套用其他商品名称。'
  },
  {
    id: 'uneven-triptych', reference: 14, type: 'scene', group: 'collage',
    name: '公路旅行志', nameEn: 'Road trip editorial', promptName: '不等幅四区实景编辑页',
    description: '不等幅三宫格穿插实景、商品与特写。',
    direction: '版面由窄白间隔分为左右两列的不等幅四区：左上约半宽、约三分之一高为亮金黄色实体标题块，炭黑大标题加一条已给短卖点；左下为较大的真实使用场景照片，出现同一商品且用途合理；右上为更高的完整商品单独近景照，沿用第1张视角和完整轮廓；右下为一条较矮的原图可见局部摄影特写。光线明快、照片边界干净，黄橙只用作平面块和环境夕光，不把商品染黄；不加入无关道具、人物或不存在的商品使用方式。'
  },
  {
    id: 'orbit-icons', reference: 15, type: 'selling', group: 'cards',
    name: '环绕细节签', nameEn: 'Surrounding detail labels', promptName: '中央商品四周圆形细节签',
    description: '中央主商品，四周轻量图标与短标签。',
    direction: '暖白拱形墙面、浅石地和极淡紫色自然光构成安静的实体摄影场景；顶部约20%居中两行深灰标题与一根极细横线。下方中央约50%宽完整陈列第1张视角商品；四周两左两右、上下成对地分布四枚小圆形摄影放大窗，每枚只裁切商品照片已出现的表面、边缘或配件，圆窗下用一行短标签。最多使用三条互不重复的已给卖点，第四枚可以只显示真实细节不写字；标签与局部吻合，圆窗绝不碰商品、标题或画面外边。花叶可轻微点缀边缘，不改变商品颜色。'
  },
  {
    id: 'tone-mosaic', reference: 16, type: 'detail', group: 'collage',
    name: '银色观察册', nameEn: 'Silver observation', promptName: '错落三幅商品观察册',
    description: '三幅错落陈列，底部真实细节圆窗。',
    direction: '暖白自然光纸面，上方约20%居中一行深灰主标题，副行仅用未在其他区域重复的已给卖点。中部三张无边摄影照片错落排布：左侧较窄的完整商品全貌，中间更宽的原图可见表面近照，右侧较窄的另一处实际可见配件或边缘特写，三张在同一水平基线上结束，薄白缝分隔。底部浅石色横带中并排三个白边圆形局部放大窗，窗下各一条不重复短标签；圆窗只能在已有照片中裁切真实局部，可以与上方摄影区域对应，不能编造三种新结构。银白只用于版面氛围，不要求商品银色。'
  },
  {
    id: 'icon-rails', reference: 17, type: 'selling', group: 'cards',
    name: '旅行侧记', nameEn: 'Travel side notes', promptName: '陶土底带三场景商品图',
    description: '侧边图标、主商品与底部三幅场景照。',
    direction: '画面上约76%为暖白墙面与斜向窗光的写实商业摄影：第1张完整商品视角在右侧约55%，左上两行炭黑大标题，其下一行极短的已给卖点；左侧中部纵排两个陶土橙色圆形线性图标，每枚下方仅一条短标签，象征确实提供的卖点，不能暗示图中不存在的部件或用途。下方约24%横贯整页为纯陶土橙色信息带，左侧留一条清楚的白色短句，右侧横向并排三张等宽小场景实拍照；三张只更换适合真实商品用途的环境，复用同一件商品已拍到的外观。文字安全区与主商品、小照分开。'
  },
  {
    id: 'scene-ribbon', reference: 18, type: 'scene', group: 'split',
    name: '海岸留白', nameEn: 'Coastal sidebar', promptName: '左窄文案栏右明亮商品照',
    description: '左侧窄文字栏，右侧明亮实景。',
    direction: '左右不等宽满幅拼接，左侧约30%为通高暖白实体窄栏，不放商品；栏上部用墨绿大标题自然分行，字不能超出窄栏，中部留一条细短横线，横线下方依次排最多两条已给卖点短句并留足行距。右侧约70%为明亮自然光实景摄影，天空浅蓝、浅石地和建筑光影可带一点海岸通透感，但背景必须符合真实商品用途；第1张视角的完整商品放在右侧主体区，边缘、配件不被左栏裁切。标题、安全区与商品严格分开，不能替换商品主体。'
  },
  {
    id: 'editorial-blocks', reference: 19, type: 'selling', group: 'collage',
    name: '色块编辑页', nameEn: 'Color-block editorial', promptName: '左紫色细节栏右商品编辑页',
    description: '大商品、彩色边栏与细节小图层叠。',
    direction: '浅暖白摄影底图叠少量淡薰衣草紫和珊瑚橙纸面几何色块，色块不触碰真实商品；左上约40%两行深紫大标题，左侧中下为一条约四分之一宽的浅紫竖向编辑栏。栏内从上到下三张真实细节小照，每张下面贴一条短卖点标签，以细珊瑚橙小竖线强调；右侧约60%放大而完整的第1张商品视角，真实落地光影，商品是第一视觉。三张小照仅为同一商品可见部位的放大裁切，不画新配件；色纸不代表新商品颜色或材质。'
  },
  {
    id: 'quad-cards', reference: 20, type: 'selling', group: 'cards',
    name: '三窗细节档案', nameEn: 'Three detail windows', promptName: '顶端三细节窗下方主商品',
    description: '上部三张细节卡，下部完整商品。',
    direction: '暖灰实体墙和浅石地面的安静棚拍，左上斜向窗光投下真实阴影。顶部约14%居中排深炭色粗体商品标题；标题下方约28%横向严格排三组等宽细节：每组先一枚深灰圆形线性小图标及一条短卖点标签，其下是白边微圆角矩形摄影窗口，放大展示原图确实可见的同一商品局部。下半部约52%居中展示完整的第1张商品视角与原色，轮廓和配件完整；三窗与主商品之间留空气感，不能用不存在的部件替代实际细节。'
  },
  ...NEW_LAYOUTS_20261108
].map((layout) => Object.freeze({
  ...layout,
  artwork: `${String(layout.reference).padStart(2, '0')}-${layout.id}.webp`
})));

const zone = (kind, x, y, w, h) => ({ kind, x, y, w, h });
export const LAYOUT_GUIDE_REGIONS = Object.freeze({
  'single-frame': [zone('title', .12, .05, .76, .12), zone('product', .2, .19, .6, .65), zone('band', .16, .89, .68, .06)],
  'bottom-band': [zone('scene', 0, 0, 1, .78), zone('title', .06, .04, .75, .1), zone('product', .3, .17, .5, .57), zone('band', 0, .78, 1, .22)],
  'full-bleed-detail': [zone('detail', 0, 0, 1, 1), zone('title', .1, .77, .8, .17)],
  'detail-window': [zone('scene', 0, 0, 1, 1), zone('title', .06, .05, .42, .24), zone('product', .25, .27, .49, .68), zone('detail', .69, .06, .25, .25)],
  'stacked-split': [zone('scene', 0, 0, 1, .62), zone('title', .05, .06, .42, .15), zone('product', .51, .05, .43, .53), zone('detail', .02, .64, .31, .3), zone('detail', .345, .64, .31, .3), zone('detail', .67, .64, .31, .3)],
  'side-labels': [zone('scene', 0, 0, 1, 1), zone('title', .05, .05, .37, .2), zone('product', .42, .16, .53, .77), zone('card', .05, .35, .31, .12), zone('card', .05, .52, .31, .12), zone('card', .05, .69, .31, .12)],
  'triple-float': [zone('title', .05, .05, .85, .12), zone('product', .05, .22, .51, .71), zone('detail', .63, .21, .27, .21), zone('detail', .63, .46, .27, .21), zone('detail', .63, .71, .27, .21)],
  'benefit-cards': [zone('scene', 0, 0, 1, 1), zone('card', .05, .05, .28, .12), zone('card', .36, .05, .28, .12), zone('card', .67, .05, .28, .12), zone('product', .24, .23, .52, .56), zone('title', .12, .83, .76, .12)],
  'mosaic-grid': [zone('scene', .02, .02, .47, .47), zone('detail', .51, .02, .47, .47), zone('detail', .02, .51, .47, .47), zone('product', .51, .51, .47, .47)],
  'arch-cards': [zone('scene', 0, 0, 1, .54), zone('title', .05, .04, .5, .15), zone('product', .56, .08, .35, .42), zone('scene', .04, .58, .28, .33), zone('scene', .36, .58, .28, .33), zone('scene', .68, .58, .28, .33)],
  'rule-divisions': [zone('title', .1, .05, .8, .14), zone('product', .04, .25, .28, .62), zone('detail', .36, .25, .28, .62), zone('detail', .68, .25, .28, .62)],
  'floating-feature': [zone('scene', 0, 0, 1, 1), zone('product', .12, .13, .63, .8), zone('title', .66, .04, .3, .12), zone('card', .68, .19, .27, .27)],
  'detail-ribbons': [zone('title', .05, .03, .85, .12), zone('detail', .04, .19, .62, .23), zone('card', .7, .19, .26, .23), zone('card', .04, .45, .26, .23), zone('detail', .34, .45, .62, .23), zone('detail', .04, .71, .62, .23), zone('card', .7, .71, .26, .23)],
  'uneven-triptych': [zone('title', .04, .04, .51, .27), zone('scene', .02, .34, .54, .64), zone('product', .59, .02, .39, .58), zone('detail', .59, .63, .39, .35)],
  'orbit-icons': [zone('title', .09, .03, .82, .16), zone('product', .26, .27, .48, .65), zone('card', .04, .27, .18, .15), zone('card', .78, .27, .18, .15), zone('card', .04, .54, .18, .15), zone('card', .78, .54, .18, .15)],
  'tone-mosaic': [zone('title', .1, .04, .8, .13), zone('product', .03, .26, .3, .52), zone('detail', .36, .2, .29, .58), zone('detail', .69, .27, .28, .51), zone('card', .09, .84, .19, .1), zone('card', .4, .84, .19, .1), zone('card', .71, .84, .19, .1)],
  'icon-rails': [zone('title', .04, .04, .42, .2), zone('product', .43, .15, .53, .57), zone('card', .04, .32, .28, .12), zone('card', .04, .5, .28, .12), zone('band', 0, .76, 1, .24), zone('scene', .34, .79, .19, .15), zone('scene', .56, .79, .19, .15), zone('scene', .78, .79, .19, .15)],
  'scene-ribbon': [zone('band', .02, .02, .27, .96), zone('title', .05, .13, .21, .33), zone('scene', .31, .02, .67, .96), zone('product', .4, .16, .5, .75)],
  'editorial-blocks': [zone('scene', 0, 0, 1, 1), zone('title', .05, .04, .44, .18), zone('band', .04, .27, .31, .64), zone('detail', .07, .3, .22, .16), zone('detail', .07, .5, .22, .16), zone('detail', .07, .7, .22, .16), zone('product', .4, .15, .54, .78)],
  'quad-cards': [zone('title', .1, .03, .8, .13), zone('detail', .06, .21, .27, .26), zone('detail', .365, .21, .27, .26), zone('detail', .67, .21, .27, .26), zone('product', .3, .51, .4, .45)],
  ...NEW_LAYOUT_GUIDES_20261108
});

export function createDefaultLayoutSelections() {
  return [];
}

export function buildLayoutReferenceInputs(productReferences, templateDataUrl, templateClientId, layoutId = '') {
  const products = Array.isArray(productReferences) ? productReferences : [productReferences];
  layoutReferenceCount(products.length, layoutId);
  if (products.some((item) => !item?.assetId && !item?.imageDataUrl)) throw new Error('PRODUCT_REFERENCE_REQUIRED');
  const references = products.map((item) => ({ ...item, annotations: item.annotations || [] }));
  if (!layoutRequiresTemplateReference(layoutId)) return references;
  if (!templateDataUrl?.startsWith('data:image/jpeg;base64,')) throw new Error('LAYOUT_REFERENCE_REQUIRED');
  return [
    ...references,
    { clientId: templateClientId, imageDataUrl: templateDataUrl, annotations: [] }
  ];
}

export function validateEcommerceLayoutReferences(request = {}) {
  const expected = request.layoutProductReferenceCount;
  if (expected === undefined && !String(request.batchId || '').startsWith('layout-')) return;
  const references = request.references;
  const layout = LAYOUT_TEMPLATES.find((item) => item.id === request.layoutId);
  // Tasks queued before the switch may still carry their original sample.
  const legacySample = layout?.reference > 3 && request.layoutReferenceMode === undefined
    && Number.isInteger(expected) && Array.isArray(references)
    && references.length === expected + 1;
  const templateCount = Number(layoutRequiresTemplateReference(request.layoutId) || legacySample);
  const productCount = expected === undefined ? (references?.length || 0) - templateCount : expected;
  if ((request.layoutReferenceMode !== undefined && request.layoutReferenceMode !== 'prompt-only')
    || (request.layoutReferenceMode === 'prompt-only' && !layout)
    || !Number.isInteger(productCount) || productCount < 1 || productCount > MAX_LAYOUT_PRODUCT_IMAGES
    || !Array.isArray(references) || references.length !== productCount + templateCount
    || references.some((reference) => !['assetId', 'generationId', 'imageDataUrl']
      .some((key) => typeof reference?.[key] === 'string' && reference[key].trim()))) {
    throw Object.assign(new Error('LAYOUT_REFERENCES_INCOMPLETE'), { code: 'LAYOUT_REFERENCES_INCOMPLETE' });
  }
  return productCount;
}

export function promoteLayoutProduct(sources, id) {
  const index = sources.findIndex((source) => source.id === id);
  return index > 0 ? [sources[index], ...sources.filter((source) => source.id !== id)] : sources;
}

export function toggleSelectedLayout(selections, layoutId) {
  const selected = Array.isArray(selections) ? selections : [];
  if (!LAYOUT_TEMPLATES.some((layout) => layout.id === layoutId)) return selected;
  if (selected.includes(layoutId)) return selected.filter((id) => id !== layoutId);
  if (selected.length >= MAX_LAYOUT_IMAGES) return selected;
  return [...selected, layoutId];
}

export function layoutSlots(selections) {
  const typeCounts = {};
  const unique = [...new Set(Array.isArray(selections) ? selections : [])];
  return unique.filter((id) => LAYOUT_TEMPLATES.some((layout) => layout.id === id))
    .slice(0, MAX_LAYOUT_IMAGES).map((layoutId) => {
      const layout = LAYOUT_TEMPLATES.find((item) => item.id === layoutId);
      const index = typeCounts[layout.type] || 0;
      typeCounts[layout.type] = index + 1;
      return { key: layoutId, type: layout.type, index, layoutId };
    });
}

export function buildEcommerceLayoutPrompt({
  slot, productName = '', sellingPoints = '', scene = '', copyLanguage = 'zh', productReferenceCount = 1
} = {}) {
  const type = LAYOUT_IMAGE_TYPES.find((item) => item.id === slot?.type);
  const layout = LAYOUT_TEMPLATES.find((item) => item.id === slot?.layoutId && item.type === slot?.type);
  if (!type || !layout) throw new Error('INVALID_LAYOUT_SLOT');
  const points = String(sellingPoints).split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 3);
  const pointIndex = (Number.isInteger(slot.index) && slot.index >= 0 ? slot.index : 0) % 3;
  const selectedPoint = points[pointIndex];
  const missingPointCount = 3 - points.length;
  const referenceCount = layoutReferenceCount(productReferenceCount, layout.id);
  const copyLanguageName = copyLanguage === 'en' ? '英语' : '简体中文';
  return [
    `请依据随请求提供的${referenceCount}张参考图，完成真实商品照片的电商排版合成，不是重新设计商品。第1张是真实商品主图，是商品身份的唯一主依据。${productReferenceCount > 1 ? `${productReferenceCount === 2 ? '第2张' : `第2至${productReferenceCount}张`}是同一商品的辅助参考图，仅补充已拍到的角度与真实细节；有冲突时以第1张主图为准，不混合不同商品。` : ''}本次只上传真实商品图，没有版式样板图；排版、光影和文字层级严格按下述文字要求完成。`,
    '最高优先级是商品保真，其次是已核实资料，最后才是版式。主视觉复用第1张商品的原有视角、透视与轮廓，只允许等比缩放和移动位置；不镜像、不拉伸、不换角度重画。严格保持结构、部件位置与数量、长宽比例、颜色、材质、表面纹理、配件及已有商标，不用同类商品替代。',
    '只根据真实商品图决定商品外观，布景和文字不能改变商品本色、表面处理或造型；不要添加图中没有的品牌或部件。不虚构尺寸、认证、参数、功能或品牌。',
    `图型：${type.label}。选定版式：${layout.promptName || layout.name}。`,
    `版式安排（服从商品保真，可调整区域比例）：${layout.direction}`,
    layout.id === 'full-bleed-detail'
      ? `本图可见文字逐项锁定：下方主标题${productName.trim() ? `只能写“${productName.trim().slice(0, 100)}”` : '留白'}；标题下的短句${points[0] ? `只能写“${points[0]}”` : '只从本次安全补写的三条卖点中选一条'}；上方最多两条引线标签${points.length > 1 ? `只能从${points.slice(1).map((point) => `“${point}”`).join('、')}中选与对应可见部位吻合的内容` : '只从剩余的安全补写卖点中选与对应可见部位吻合的内容'}。不写清单外的宣传短句、副标题或第三条标签；没有可核实对应部位时不画引线。`
      : '',
    `多图分区只能复用${productReferenceCount === 1 ? '第1张的同一商品视角或原图可见局部裁切' : `前${productReferenceCount}张中已确认属于同一商品的实拍视角或可见局部裁切`}，不得把一个视角推演成新的背面、内部、拆解${layout.allowsContextInteraction ? '。可围绕原有商品视角布置人物和真实已有部件的自然互动；不能新增配件、改变商品结构或推演未拍到的视角' : '或使用姿态'}。素材不足时减少小图、合并区域或留白，不为凑满版式格数臆造商品。场景只改变商品外的环境，与真实商品用途匹配。`,
    productName.trim() ? `产品名称：${productName.trim().slice(0, 100)}。` : '',
    points.length ? `已核实的商品卖点：${points.join('；')}。` : '',
    missingPointCount
      ? `卖点文案须补足为恰好3条：${points.length ? `保留上面用户提供的${points.length}条卖点原文，` : '用户未填写卖点，'}依据真实商品图、商品名称和用途自由拟写${missingPointCount}条简短且不重复的卖点。补写内容可以描述清晰可见的商品特征，或使用不暗示具体功效的场景、审美表达；不得从版式样板推断商品，也不得把未经核实的功能、性能、材质、参数、认证或品牌写成事实。`
      : '',
    slot.type === 'selling'
      ? selectedPoint ? `本张重点：${selectedPoint}。`
        : `本张重点：AI补写的第${pointIndex + 1}条卖点，不重复已有卖点。`
      : '',
    scene.trim() && slot.type === 'scene' ? `指定场景：${scene.trim().slice(0, 180)}。` : '',
    missingPointCount
      ? `可见文案仅使用商品名称、用户提供的卖点和本次补写的卖点，语言为${copyLanguageName}；卖点图优先呈现这3条，文字位不足时优先本张重点，不为凑数遮挡商品。其他未提供的文案留白，不输出占位字、乱码、重复文字或图库示例文案。`
      : `仅使用上面明确提供的名称与卖点作为可见文案，语言为${copyLanguageName}；未提供的文案请留白，不输出占位字、乱码、重复文字或图库示例文案。`,
    layout.copyMode === 'none'
      ? '本版式为无文字场景图：前述商品名称、卖点和补写内容仅用于理解商品，不在画面中渲染任何标题、标签、卖点、价格或占位文字。'
      : '',
    '文字安全区与商品不重叠，除明确要求特写的分区外商品轮廓完整。依据指定输出宽高重新组织空间与安全区，不拉伸、压扁或裁切整张方形版式。'
  ].filter(Boolean).join('\n');
}
