const STYLE_SAFETY_SUFFIX = [
  'Apply this only as a visual treatment.',
  'Do not override the user request or the identity, structure, proportions, colors, text, logos, packaging, or other verified details in reference images.',
  'Do not invent unsupported product features, claims, labels, or brand marks.'
].join(' ');

export const IMAGE_STYLE_CATEGORIES = Object.freeze([
  { id: 'recommended', label: { zh: '推荐', en: 'Recommended' } },
  { id: 'photography', label: { zh: '真实摄影', en: 'Photography' } },
  { id: 'product', label: { zh: '商品广告', en: 'Product ads' } },
  { id: 'festival', label: { zh: '节日庆典', en: 'Festivals' } },
  { id: 'portrait', label: { zh: '人物写真', en: 'Portraits' } },
  { id: 'illustration', label: { zh: '插画绘画', en: 'Illustration & painting' } },
  { id: 'anime', label: { zh: '动漫角色', en: 'Anime & characters' } },
  { id: 'three-d', label: { zh: '3D 材质', en: '3D & material' } },
  { id: 'materials', label: { zh: '材质实验', en: 'Material lab' } },
  { id: 'playful', label: { zh: '趣味创意', en: 'Playful ideas' } },
  { id: 'poster', label: { zh: '海报设计', en: 'Poster design' } },
  { id: 'oriental', label: { zh: '中国风', en: 'Chinese styles' } }
]);

export const IMAGE_STYLE_PRESETS = Object.freeze([
  {
    id: 'natural-photo', category: 'photography', featured: true, previewCaseId: 518, previewAsset: '/images/style-presets/github/portrait-photography.webp',
    label: { zh: '自然摄影', en: 'Natural photo' }, aliases: ['真实摄影'],
    description: { zh: '自然光，真实耐看', en: 'Natural light and lifelike detail' },
    prompt: 'Natural editorial photography, realistic materials and skin, soft daylight, balanced exposure, subtle depth of field, restrained color grading.'
  },
  {
    id: 'cinematic-photo', category: 'photography', featured: false, previewCaseId: 501,
    label: { zh: '电影质感', en: 'Cinematic' },
    description: { zh: '叙事光影，氛围浓郁', en: 'Narrative light and atmosphere' },
    prompt: 'Cinematic photography with motivated lighting, layered depth, expressive composition, controlled contrast, subtle filmic color grading, and believable detail.'
  },
  {
    id: 'vintage-film', category: 'photography', featured: false, previewCaseId: 434,
    label: { zh: '复古胶片', en: 'Vintage film' },
    description: { zh: '颗粒与怀旧色彩', en: 'Film grain and nostalgic color' },
    prompt: 'Vintage analog film photography, gentle grain, soft highlight roll-off, slightly muted nostalgic colors, natural imperfections, and authentic camera character.'
  },
  {
    id: 'surreal-photo', category: 'photography', featured: false, previewCaseId: 482, previewAsset: '/images/style-presets/github/surrealism.webp',
    label: { zh: '超现实摄影', en: 'Surreal photo' },
    description: { zh: '真实质感，奇想构图', en: 'Photoreal texture with imaginative staging' },
    prompt: 'Surreal yet photorealistic photography, physically believable light and materials, an imaginative visual concept, elegant spatial relationships, and premium finish.'
  },
  {
    id: 'ccd-snapshot', category: 'photography', featured: true, previewCaseId: 436,
    label: { zh: 'CCD 随拍', en: 'CCD snapshot' },
    description: { zh: '直闪颗粒，轻松生活感', en: 'Direct flash, grain, and casual energy' },
    prompt: 'Casual CCD snapshot photography, direct compact-camera flash, authentic grain, slightly imperfect framing, lively everyday atmosphere, and believable detail.'
  },
  {
    id: 'teal-orange-cinema', category: 'photography', featured: false, previewCaseId: 488,
    label: { zh: '青橙电影', en: 'Teal-orange cinema' }, aliases: ['青橙色调'],
    description: { zh: '电影分色，立体光影', en: 'Cinematic color separation and depth' },
    prompt: 'Cinematic teal-and-orange photography, dimensional motivated lighting, controlled contrast, natural skin and material rendering, polished film color separation.'
  },
  {
    id: 'dreamcore-photo', category: 'photography', featured: false, previewCaseId: 500,
    label: { zh: '梦核摄影', en: 'Dreamcore photo' }, aliases: ['梦核'],
    description: { zh: '熟悉又梦幻，轻微失真', en: 'Familiar, dreamy, and subtly uncanny' },
    prompt: 'Dreamcore photography with familiar spaces rendered slightly uncanny, hazy glow, nostalgic color, soft focus transitions, quiet surreal atmosphere, coherent realistic detail.'
  },
  {
    id: 'wasteland-sci-fi', category: 'photography', featured: false, previewCaseId: 191, previewAsset: '/images/style-presets/github/digital-glitch-art.webp',
    label: { zh: '废土科幻', en: 'Wasteland sci-fi' }, aliases: ['废土科幻风'],
    description: { zh: '荒凉巨制，未来叙事', en: 'Epic desolation and future storytelling' },
    prompt: 'Cinematic wasteland science-fiction photography, monumental weathered environments, believable industrial detail, atmospheric dust, dramatic scale, restrained post-apocalyptic palette.'
  },
  {
    id: 'macaron-photo', category: 'photography', featured: false, previewCaseId: 298,
    label: { zh: '马卡龙色系', en: 'Macaron palette' },
    description: { zh: '柔和糖果色，清爽透亮', en: 'Soft candy color and airy light' },
    prompt: 'Bright photoreal scene in a refined macaron pastel palette, airy diffused light, clean tonal separation, soft but accurate materials, cheerful premium finish.'
  },
  {
    id: 'ricoh-street-color', category: 'photography', featured: false, previewCaseId: 436,
    label: { zh: '理光直出', en: 'Ricoh street color' }, aliases: ['理光'],
    description: { zh: '街头随拍，清透高对比', en: 'Crisp street snapshots with compact-camera color' },
    prompt: 'Compact-camera street photography with crisp micro-contrast, restrained highlight roll-off, natural urban color, quick candid framing, subtle grain, and authentic everyday detail.'
  },
  {
    id: 'clean-product', category: 'product', featured: true, previewCaseId: 519,
    label: { zh: '干净商品图', en: 'Clean product' },
    description: { zh: '主体清楚，背景克制', en: 'Clear subject and restrained background' },
    prompt: 'Clean commercial product photography, clear subject hierarchy, controlled softbox lighting, accurate materials, uncluttered background, crisp edges, premium catalog finish.'
  },
  {
    id: 'luxury-product', category: 'product', featured: false, previewCaseId: 449,
    label: { zh: '高端商业', en: 'Luxury commercial' },
    description: { zh: '精致布光，高级材质', en: 'Refined light and premium material' },
    prompt: 'Luxury commercial product campaign, sculpted studio lighting, refined reflections, rich material detail, elegant negative space, sophisticated restrained palette.'
  },
  {
    id: 'fresh-food-ad', category: 'product', featured: false, previewCaseId: 517, previewAsset: '/images/style-presets/github/food-photography.webp',
    label: { zh: '清爽食品广告', en: 'Fresh food ad' },
    description: { zh: '明亮新鲜，有食欲', en: 'Bright, fresh, and appetizing' },
    prompt: 'Fresh food and beverage advertising, bright appetizing color, crisp condensation and ingredient detail, clean directional light, energetic but organized composition.'
  },
  {
    id: 'tech-commercial', category: 'product', featured: false, previewCaseId: 516,
    label: { zh: '科技产品', en: 'Tech product' },
    description: { zh: '精准结构，现代光感', en: 'Precise structure and modern light' },
    prompt: 'Modern technology product visualization, precise geometry, cool controlled lighting, clean gradients, subtle technical atmosphere, and highly legible functional details.'
  },
  {
    id: 'miniature-product', category: 'product', featured: true, previewCaseId: 438,
    label: { zh: '微缩商品', en: 'Miniature product' },
    description: { zh: '微缩场景，有趣卖点', en: 'Miniature scenes with playful selling points' },
    prompt: 'Creative miniature product advertising, tiny believable characters and props interacting with the product, clear product dominance, precise scale storytelling, premium commercial finish.'
  },
  {
    id: 'packaging-display', category: 'product', featured: false, previewCaseId: 475,
    label: { zh: '包装展示', en: 'Packaging display' },
    description: { zh: '包装结构清楚，品牌完整', en: 'Clear packaging structure and brand presentation' },
    prompt: 'Professional packaging presentation, accurate box and label structure, clean three-quarter view, controlled studio light, readable hierarchy, refined retail-ready finish.'
  },
  {
    id: 'studio-portrait', category: 'portrait', featured: true, previewCaseId: 499, previewAsset: '/images/style-presets/github/portrait-photography.webp',
    label: { zh: '影棚写真', en: 'Studio portrait' },
    description: { zh: '清晰人物，专业布光', en: 'Clear subject and professional lighting' },
    prompt: 'Professional studio portrait photography, flattering controlled key light, clean separation, realistic skin texture, confident pose, and polished editorial finish.'
  },
  {
    id: 'lifestyle-portrait', category: 'portrait', featured: false, previewCaseId: 509,
    label: { zh: '生活方式', en: 'Lifestyle portrait' },
    description: { zh: '自然互动，轻松真实', en: 'Relaxed and authentic interaction' },
    prompt: 'Natural lifestyle portrait, candid believable gesture, soft available light, lived-in environment, warm human feeling, and restrained commercial polish.'
  },
  {
    id: 'fashion-editorial', category: 'portrait', featured: false, previewCaseId: 490, previewAsset: '/images/style-presets/github/fashion-photography.webp',
    label: { zh: '时尚大片', en: 'Fashion editorial' },
    description: { zh: '强构图，杂志氛围', en: 'Bold composition and magazine mood' },
    prompt: 'High-fashion editorial photography, confident styling, deliberate pose, graphic composition, refined lighting, premium magazine color treatment.'
  },
  {
    id: 'soft-glow-portrait', category: 'portrait', featured: false, previewCaseId: 500,
    label: { zh: '柔光氛围', en: 'Soft glow' },
    description: { zh: '柔和通透，梦幻自然', en: 'Soft, luminous, and dreamy' },
    prompt: 'Luminous soft-focus portrait, diffused natural light, delicate highlights, airy color palette, gentle depth, and realistic facial detail.'
  },
  {
    id: 'flash-portrait', category: 'portrait', featured: false, previewCaseId: 466,
    label: { zh: '闪光灯写真', en: 'Flash portrait' },
    description: { zh: '直闪醒目，时尚有力', en: 'Bold direct flash and fashion energy' },
    prompt: 'Bold direct-flash fashion portrait, crisp subject separation, confident pose, punchy but accurate color, editorial spontaneity, realistic texture.'
  },
  {
    id: 'street-fashion', category: 'portrait', featured: true, previewCaseId: 483, previewAsset: '/images/style-presets/github/street-photography.webp',
    label: { zh: '街头时尚', en: 'Street fashion' },
    description: { zh: '城市纪实，杂志穿搭', en: 'Urban documentary fashion' },
    prompt: 'Urban street-fashion editorial, spontaneous movement, environmental depth, confident styling, natural city light, polished magazine realism.'
  },
  {
    id: 'storybook', category: 'illustration', featured: true, previewCaseId: 495,
    label: { zh: '故事书插画', en: 'Storybook' },
    description: { zh: '温暖叙事，手绘细节', en: 'Warm narrative and hand-drawn detail' },
    prompt: 'Warm storybook illustration, expressive hand-drawn detail, clear narrative staging, inviting color harmony, tactile paper-like finish.'
  },
  {
    id: 'watercolor', category: 'illustration', featured: false, previewCaseId: 497, previewAsset: '/images/style-presets/github/watercolor.webp',
    label: { zh: '水彩插画', en: 'Watercolor' },
    description: { zh: '通透晕染，轻盈纸感', en: 'Transparent washes and paper texture' },
    prompt: 'Elegant watercolor illustration, translucent washes, natural pigment blooms, visible paper texture, soft edges, and balanced white space.'
  },
  {
    id: 'flat-illustration', category: 'illustration', featured: false, previewCaseId: 513, previewAsset: '/images/style-presets/github/pop-art.webp',
    label: { zh: '扁平插画', en: 'Flat illustration' }, aliases: ['超扁平风'],
    description: { zh: '形状简洁，配色鲜明', en: 'Simple shapes and clear colors' },
    prompt: 'Contemporary flat illustration, simplified geometric shapes, clear silhouettes, confident color blocks, minimal shading, and clean visual hierarchy.'
  },
  {
    id: 'anime', category: 'anime', featured: false, previewCaseId: 471, previewAsset: '/images/style-presets/github/anime.webp',
    label: { zh: '动漫氛围', en: 'Anime mood' }, aliases: ['二次元'],
    description: { zh: '细腻线条，动画光影', en: 'Refined linework and animated light' },
    prompt: 'Refined animation-inspired illustration, clean expressive linework, polished cel shading, cinematic color and light, coherent character anatomy, detailed background.'
  },
  {
    id: 'colored-pencil', category: 'illustration', featured: false, previewCaseId: 430, previewAsset: '/images/style-presets/github/color-pencil.webp',
    label: { zh: '彩铅手绘', en: 'Colored pencil' }, aliases: ['彩铅插画'],
    description: { zh: '细腻笔触，温柔纸感', en: 'Fine pencil texture and warm paper' },
    prompt: 'Detailed colored-pencil illustration, visible layered strokes, warm textured paper, gentle color blending, precise edges, handcrafted charm.'
  },
  {
    id: 'comic-storyboard', category: 'anime', featured: false, previewCaseId: 24, previewAsset: '/images/style-presets/github/manga.webp',
    label: { zh: '漫画分镜', en: 'Comic storyboard' },
    description: { zh: '分格叙事，动作清楚', en: 'Panel storytelling and clear action' },
    prompt: 'Professional comic storyboard, clear panel-to-panel continuity, expressive framing, readable action, consistent characters, controlled linework and cinematic pacing.'
  },
  {
    id: 'oil-impasto', category: 'illustration', featured: false, previewCaseId: 233, previewAsset: '/images/style-presets/github/oil-painting.webp',
    label: { zh: '油画厚涂', en: 'Oil impasto' },
    description: { zh: '厚重颜料，立体笔触', en: 'Rich pigment and dimensional brushwork' },
    prompt: 'Expressive oil impasto painting, thick dimensional brushstrokes, rich pigment mixing, confident light and shadow, tactile canvas surface, cohesive painterly composition.'
  },
  {
    id: 'single-line-art', category: 'illustration', featured: false, previewCaseId: 299,
    label: { zh: '单线绘图', en: 'Single-line art' },
    description: { zh: '一笔造型，极简留白', en: 'Continuous line and minimal space' },
    prompt: 'Elegant continuous single-line illustration, confident economical contour, intentional negative space, balanced composition, clean editorial finish.'
  },
  {
    id: 'pencil-sketch', category: 'illustration', featured: false, previewCaseId: 430, previewAsset: '/images/style-presets/github/charcoal-drawing.webp',
    label: { zh: '铅笔素描', en: 'Pencil sketch' }, aliases: ['素描'],
    description: { zh: '线条细腻，明暗练习', en: 'Fine graphite line and tonal study' },
    prompt: 'Professional graphite pencil sketch, precise construction lines, nuanced cross-hatching, realistic tonal values, textured paper, confident observational drawing.'
  },
  {
    id: 'graffiti-art', category: 'illustration', featured: false, previewCaseId: 504, previewAsset: '/images/style-presets/github/graffiti.webp',
    label: { zh: '涂鸦艺术', en: 'Graffiti art' }, aliases: ['涂鸦'],
    description: { zh: '手写线条，街头能量', en: 'Hand-drawn marks and street energy' },
    prompt: 'Layered graffiti-inspired illustration, expressive marker and spray-paint gestures, bold graphic rhythm, controlled color accents, intentional raw texture.'
  },
  {
    id: 'childlike-illustration', category: 'illustration', featured: false, previewCaseId: 452,
    label: { zh: '童真插画', en: 'Childlike illustration' },
    description: { zh: '稚拙可爱，温暖故事感', en: 'Naive charm and warm storytelling' },
    prompt: 'Warm childlike illustration, charming simplified forms, playful hand-drawn imperfections, friendly color harmony, clear storytelling, polished picture-book finish.'
  },
  {
    id: 'design-sketch', category: 'illustration', featured: false, previewCaseId: 473, previewAsset: '/images/style-presets/github/penand-ink.webp',
    label: { zh: '设计草稿', en: 'Design sketch' },
    description: { zh: '概念推演，标注与细节', en: 'Concept exploration with annotations' },
    prompt: 'Professional concept-design sketch sheet, multiple clear explorations, construction lines, material notes, proportion callouts, disciplined presentation layout.'
  },
  {
    id: 'retro-comic', category: 'anime', featured: true, previewCaseId: 118, previewAsset: '/images/style-presets/github/manga.webp',
    label: { zh: '复古旧漫', en: 'Retro comic' },
    description: { zh: '旧印刷纹理，经典分格', en: 'Vintage print texture and classic panels' },
    prompt: 'Retro comic-book illustration, confident ink outlines, limited vintage print palette, subtle halftone texture, dynamic panel composition, consistent character design.'
  },
  {
    id: 'chibi-anime', category: 'anime', featured: false, previewCaseId: 410,
    label: { zh: 'Q版二次元', en: 'Chibi anime' },
    description: { zh: '头身比可爱，表情生动', en: 'Cute proportions and expressive faces' },
    prompt: 'Polished chibi anime illustration, appealing compact proportions, expressive facial design, clean linework, bright controlled cel shading, coherent costume details.'
  },
  {
    id: 'realistic-anime', category: 'anime', featured: false, previewCaseId: 285, previewAsset: '/images/style-presets/github/anime.webp',
    label: { zh: '实感动漫', en: 'Realistic anime' },
    description: { zh: '动画造型，真实镜头感', en: 'Anime design with cinematic realism' },
    prompt: 'Realistic anime cinematic frame, refined character design, believable environment and lighting, polished cel-rendered surfaces, coherent anatomy, film-like composition.'
  },
  {
    id: 'xianxia-fantasy', category: 'anime', featured: false, previewCaseId: 207,
    label: { zh: '仙侠幻境', en: 'Xianxia fantasy' }, aliases: ['仙侠'],
    description: { zh: '仙气云海，东方冒险', en: 'Immortal realms and eastern adventure' },
    prompt: 'Cinematic xianxia fantasy, elegant Chinese-inspired costume and architecture, vast cloud-filled landscapes, luminous spiritual atmosphere, coherent character action, premium detail.'
  },
  {
    id: 'game-cg', category: 'anime', featured: false, previewCaseId: 473,
    label: { zh: '游戏CG', en: 'Game CG' },
    description: { zh: '高精建模，史诗角色', en: 'High-detail modeling and epic characters' },
    prompt: 'Premium game cinematic CG, high-detail character and environment modeling, dramatic production lighting, strong silhouette, rich materials, coherent action staging.'
  },
  {
    id: 'warm-handdrawn-animation', category: 'anime', featured: true, previewCaseId: 495,
    label: { zh: '吉卜力氛围', en: 'Warm hand-drawn animation' }, aliases: ['吉卜力'],
    description: { zh: '柔和手绘，自然童话氛围', en: 'Soft hand-drawn fantasy and natural warmth' },
    prompt: 'Warm hand-drawn animated-film aesthetic, expressive organic linework, softly painted natural environments, gentle sunlight, whimsical everyday wonder, cohesive original character design.'
  },
  {
    id: 'live-action-illustration', category: 'anime', featured: false, previewCaseId: 366,
    label: { zh: '实景插画', en: 'Live-action illustration' },
    description: { zh: '真实场景融合手绘角色', en: 'Hand-drawn subjects integrated into real scenes' },
    prompt: 'Seamless live-action and illustration blend, hand-drawn characters naturally integrated into a photoreal environment, consistent perspective, shadows, scale, and cinematic color.'
  },
  {
    id: 'japanese-anime', category: 'anime', featured: false, previewCaseId: 471,
    label: { zh: '日漫', en: 'Japanese anime' },
    description: { zh: '精致线稿，清爽赛璐光影', en: 'Refined linework and clean cel lighting' },
    prompt: 'Polished Japanese animation aesthetic, refined expressive linework, clean cel shading, cinematic background painting, coherent anatomy, vivid but controlled color.'
  },
  {
    id: 'healing-anime', category: 'anime', featured: false, previewCaseId: 452,
    label: { zh: '治愈日漫', en: 'Healing anime' },
    description: { zh: '舒缓日常，温柔明亮', en: 'Gentle everyday moments and comforting light' },
    prompt: 'Comforting slice-of-life anime scene, gentle everyday interaction, warm natural light, soft harmonious colors, calm pacing, clean expressive character design.'
  },
  {
    id: 'retro-american-comic', category: 'anime', featured: false, previewCaseId: 379,
    label: { zh: '复古美漫', en: 'Retro American comic' },
    description: { zh: '粗线网点，黄金年代印刷感', en: 'Bold inks and golden-age halftones' },
    prompt: 'Retro American comic-book aesthetic, bold black ink contours, dramatic foreshortening, vintage halftone dots, limited print palette, energetic panel composition.'
  },
  {
    id: 'spoof-american-comic', category: 'anime', featured: false, previewCaseId: 410,
    label: { zh: '恶搞美漫', en: 'Spoof comic' },
    description: { zh: '夸张表情，幽默分格', en: 'Exaggerated expressions and comic parody' },
    prompt: 'Playful American comic parody, exaggerated facial expressions and poses, bold ink outlines, punchy halftone color, humorous visual timing, coherent original characters.'
  },
  {
    id: 'classic-chinese-animation', category: 'anime', featured: false, previewCaseId: 213,
    label: { zh: '国产经典动画', en: 'Classic Chinese animation' }, aliases: ['国产经典'],
    description: { zh: '民族美术，怀旧动画质感', en: 'Chinese folk-art language with nostalgic animation texture' },
    prompt: 'Classic Chinese animation aesthetic, original character design informed by folk art, expressive brushwork, restrained traditional palette, handcrafted cel texture, poetic staging.'
  },
  {
    id: 'american-animation', category: 'anime', featured: false, previewCaseId: 410,
    label: { zh: '美式动画', en: 'American animation' },
    description: { zh: '夸张动作，鲜明轮廓', en: 'Expressive motion and bold silhouettes' },
    prompt: 'Energetic American animation aesthetic, expressive squash-and-stretch poses, bold readable silhouettes, clean graphic color, lively facial acting, original character design.'
  },
  {
    id: 'detective-anime', category: 'anime', featured: false, previewCaseId: 471,
    label: { zh: '日漫侦探', en: 'Anime detective' },
    description: { zh: '推理氛围，戏剧性镜头', en: 'Mystery mood and dramatic framing' },
    prompt: 'Japanese detective-anime scene, intelligent mystery atmosphere, dramatic evidence-focused framing, crisp cel shading, suspenseful urban lighting, coherent original characters.'
  },
  {
    id: 'rainbow-pony-animation', category: 'anime', featured: false, previewCaseId: 452,
    label: { zh: '彩虹萌马动画', en: 'Rainbow pony animation' }, aliases: ['彩虹小马'],
    description: { zh: '鲜艳童话，可爱马系角色', en: 'Colorful fairy-tale pony characters' },
    prompt: 'Colorful children\'s pony animation, cute original pony characters, bright rainbow palette, clean rounded shapes, friendly expressive faces, magical storybook environment.'
  },
  {
    id: 'superhero-girl-animation', category: 'anime', featured: false, previewCaseId: 410,
    label: { zh: '超级女孩动画', en: 'Superhero girl animation' }, aliases: ['小女警'],
    description: { zh: '强轮廓造型，轻快英雄感', en: 'Bold graphic heroes and playful action' },
    prompt: 'Bold graphic superhero-girl animation, original simplified characters, strong silhouettes, bright flat color, energetic action poses, playful city-saving adventure.'
  },
  {
    id: 'soft-c4d', category: 'three-d', featured: true, previewCaseId: 476, previewAsset: '/images/style-presets/github/3-dmodeling.webp',
    label: { zh: '软萌 3D', en: 'Soft 3D' }, aliases: ['Q版3D'],
    description: { zh: '圆润造型，柔和材质', en: 'Rounded forms and soft materials' },
    prompt: 'Friendly stylized 3D render, rounded forms, soft tactile materials, gentle studio lighting, clean shadows, playful but professional composition.'
  },
  {
    id: 'collectible-figure', category: 'three-d', featured: false, previewCaseId: 507,
    label: { zh: '潮玩手办', en: 'Collectible figure' }, aliases: ['手办'],
    description: { zh: '玩具质感，精致陈列', en: 'Toy-like material and refined display' },
    prompt: 'Premium collectible figure presentation, detailed sculpted form, realistic toy materials, clean display staging, controlled product lighting, high-end finish.'
  },
  {
    id: 'miniature-world', category: 'three-d', featured: true, previewCaseId: 489,
    label: { zh: '微缩世界', en: 'Miniature world' }, aliases: ['微缩景观'],
    description: { zh: '小场景，大故事', en: 'Small scene with rich storytelling' },
    prompt: 'Intricate miniature diorama, tilt-shift visual language, tiny believable details, layered storytelling, tactile materials, and carefully controlled depth of field.'
  },
  {
    id: 'glass-material', category: 'materials', featured: false, previewCaseId: 496, previewAsset: '/images/style-presets/github/glass-art.webp',
    label: { zh: '玻璃材质', en: 'Glass material' }, aliases: ['玻璃'],
    description: { zh: '通透折射，晶莹高级', en: 'Transparent refraction and clarity' },
    prompt: 'Premium translucent glass material study, physically believable refraction and caustics, crisp highlights, elegant color separation, clean studio environment.'
  },
  {
    id: 'paper-sculpture', category: 'materials', featured: true, previewCaseId: 461, previewAsset: '/images/style-presets/github/paper-art.webp',
    label: { zh: '纸雕立体', en: 'Paper sculpture' }, aliases: ['纸雕'],
    description: { zh: '分层剪纸，立体光影', en: 'Layered paper craft and dimensional light' },
    prompt: 'Layered paper-sculpture artwork, precisely cut paper edges, tactile fibers, dimensional shadows, elegant handcrafted construction, clean studio presentation.'
  },
  {
    id: 'metallic-material', category: 'materials', featured: false, previewCaseId: 444, previewAsset: '/images/style-presets/github/metalwork.webp',
    label: { zh: '金属质感', en: 'Metallic material' }, aliases: ['液态金属质感'],
    description: { zh: '高级金属，精准反射', en: 'Premium metal and precise reflections' },
    prompt: 'High-end metallic 3D material study, physically accurate reflections, fine brushed or polished surface detail, controlled highlights, dramatic clean studio lighting.'
  },
  {
    id: 'cartoon-c4d', category: 'three-d', featured: false, previewCaseId: 476,
    label: { zh: '卡通C4D', en: 'Cartoon C4D' }, aliases: ['3D卡通'],
    description: { zh: '糖果色建模，可爱精致', en: 'Candy-color modeling with polished charm' },
    prompt: 'Polished cartoon C4D render, rounded expressive geometry, clean candy-color materials, soft global illumination, precise playful composition, professional finish.'
  },
  {
    id: 'cg-render', category: 'three-d', featured: false, previewCaseId: 503, previewAsset: '/images/style-presets/github/cgi.webp',
    label: { zh: 'CG渲染', en: 'CG render' },
    description: { zh: '影视级建模，精致光影', en: 'Cinematic modeling and refined light' },
    prompt: 'High-end cinematic CG render, detailed geometry and materials, physically coherent lighting, atmospheric depth, premium production design, crisp final image.'
  },
  {
    id: 'polaroid-3d', category: 'three-d', featured: false, previewCaseId: 498,
    label: { zh: '3D拍立得', en: '3D Polaroid' },
    description: { zh: '跳出相纸，空间错觉', en: 'Objects emerging from an instant photo' },
    prompt: 'Creative 3D Polaroid composition, subject breaking naturally beyond the instant-photo frame, convincing spatial overlap, clean shadows, playful dimensional illusion.'
  },
  {
    id: 'isometric-3d', category: 'three-d', featured: false, previewCaseId: 489, previewAsset: '/images/style-presets/github/low-poly.webp',
    label: { zh: '等距3D', en: 'Isometric 3D' },
    description: { zh: '俯视结构，信息清楚', en: 'Structured isometric perspective' },
    prompt: 'Clean isometric 3D scene, consistent orthographic perspective, readable spatial hierarchy, refined materials, soft controlled lighting, precise miniature detail.'
  },
  {
    id: 'chinese-3d-animation', category: 'three-d', featured: false, previewCaseId: 503,
    label: { zh: '国产3D', en: 'Chinese 3D animation' },
    description: { zh: '东方叙事，电影级三维角色', en: 'Cinematic 3D characters with eastern storytelling' },
    prompt: 'Premium Chinese 3D animated-film aesthetic, original character design, cinematic eastern fantasy production design, detailed materials, expressive faces, dramatic volumetric lighting.'
  },
  {
    id: 'wool-felt', category: 'materials', featured: false, previewCaseId: 390,
    label: { zh: '羊毛毡', en: 'Wool felt' },
    description: { zh: '纤维温暖，手工微缩', en: 'Warm fibers and handcrafted miniatures' },
    prompt: 'Handcrafted wool-felt aesthetic, visible soft fibers, rounded stitched construction, warm miniature staging, gentle light, tactile believable detail.'
  },
  {
    id: 'plush-material', category: 'materials', featured: false, previewCaseId: 507,
    label: { zh: '毛绒材质', en: 'Plush material' },
    description: { zh: '短绒触感，柔软治愈', en: 'Soft pile texture and comforting form' },
    prompt: 'Soft plush-material transformation, dense fine fibers, rounded padded form, subtle seams, warm tactile light, clean recognizable silhouette.'
  },
  {
    id: 'knitted-material', category: 'materials', featured: false, previewCaseId: 507,
    label: { zh: '针织材质', en: 'Knitted material' },
    description: { zh: '线圈细节，温暖手作', en: 'Visible stitches and handmade warmth' },
    prompt: 'Detailed knitted-material aesthetic, clearly visible yarn loops and stitches, soft dimensional construction, warm handcrafted character, realistic textile shading.'
  },
  {
    id: 'ice-cream-material', category: 'materials', featured: false, previewCaseId: 291,
    label: { zh: '冰淇淋材质', en: 'Ice-cream material' },
    description: { zh: '奶油质感，甜品造型', en: 'Creamy texture and dessert-like form' },
    prompt: 'Whimsical ice-cream material treatment, creamy sculpted surfaces, appetizing pastel color, gentle melting detail, clean highlights, playful but polished rendering.'
  },
  {
    id: 'iridescent-pvc', category: 'materials', featured: false, previewCaseId: 496,
    label: { zh: '虹彩PVC', en: 'Iridescent PVC' },
    description: { zh: '半透明渐变，未来光泽', en: 'Translucent rainbow sheen' },
    prompt: 'Iridescent translucent PVC material, physically believable rainbow interference, soft refraction, crisp edge highlights, futuristic premium studio presentation.'
  },
  {
    id: 'cotton-doll', category: 'materials', featured: false, previewCaseId: 507,
    label: { zh: '棉花娃娃', en: 'Cotton doll' },
    description: { zh: '布艺缝制，圆润可爱', en: 'Soft sewn fabric and rounded charm' },
    prompt: 'Cute handmade cotton-doll aesthetic, soft sewn fabric body, subtle embroidery and seams, rounded proportions, clean recognizable clothing, warm product lighting.'
  },
  {
    id: 'plaster-sculpture', category: 'materials', featured: false, previewCaseId: 514,
    label: { zh: '石膏雕塑', en: 'Plaster sculpture' }, aliases: ['石膏'],
    description: { zh: '哑光白色，雕塑细节清晰', en: 'Matte white sculptural detail' },
    prompt: 'Classical plaster-sculpture material, matte chalky white surface, crisp carved planes, subtle pores and imperfections, directional museum light, restrained monochrome presentation.'
  },
  {
    id: 'editorial-poster', category: 'poster', featured: true, previewCaseId: 515, previewAsset: '/images/style-presets/github/constructivism.webp',
    label: { zh: '编辑海报', en: 'Editorial poster' },
    description: { zh: '版式鲜明，视觉聚焦', en: 'Strong layout and focal hierarchy' },
    prompt: 'Contemporary editorial poster design, strong focal hierarchy, disciplined grid, expressive image treatment, deliberate negative space, publication-quality finish.'
  },
  {
    id: 'retro-poster', category: 'poster', featured: false, previewCaseId: 464,
    label: { zh: '复古海报', en: 'Retro poster' },
    description: { zh: '怀旧配色，印刷肌理', en: 'Nostalgic palette and print texture' },
    prompt: 'Retro printed poster aesthetic, period-inspired color palette, subtle halftone and paper texture, bold composition, carefully aged finish.'
  },
  {
    id: 'brand-key-visual', category: 'poster', featured: false, previewCaseId: 459,
    label: { zh: '品牌主视觉', en: 'Brand key visual' },
    description: { zh: '品牌聚焦，传播有力', en: 'Brand-focused and campaign-ready' },
    prompt: 'Campaign-ready brand key visual, one memorable central idea, clear product or subject focus, distinctive color system, premium advertising composition.'
  },
  {
    id: 'infographic', category: 'poster', featured: false, previewCaseId: 494,
    label: { zh: '信息图', en: 'Infographic' },
    description: { zh: '结构清楚，信息易读', en: 'Structured and easy to scan' },
    prompt: 'Clear modern infographic design, structured information hierarchy, accurate visual grouping, clean icons and diagrams, restrained palette, excellent readability.'
  },
  {
    id: 'scrapbook-poster', category: 'poster', featured: false, previewCaseId: 481, previewAsset: '/images/style-presets/github/collage.webp',
    label: { zh: '拼贴海报', en: 'Scrapbook poster' },
    description: { zh: '纸片拼贴，青年杂志感', en: 'Layered paper collage and youth editorial mood' },
    prompt: 'Contemporary scrapbook poster, layered paper cutouts, tape and printed textures, playful editorial rhythm, intentional typography zones, cohesive visual hierarchy.'
  },
  {
    id: 'typography-poster', category: 'poster', featured: true, previewCaseId: 511, previewAsset: '/images/style-presets/github/bauhaus.webp',
    label: { zh: '字体排版', en: 'Typography poster' },
    description: { zh: '大字构成，平面张力', en: 'Bold type and graphic tension' },
    prompt: 'Typography-led poster design, bold scale contrast, disciplined grid, clear reading order, expressive but legible type composition, professional print finish.'
  },
  {
    id: 'logo-design', category: 'poster', featured: false, previewCaseId: 496,
    label: { zh: 'LOGO设计', en: 'Logo design' },
    description: { zh: '符号简洁，品牌识别强', en: 'Simple symbol and clear brand recognition' },
    prompt: 'Professional logo concept presentation, simple memorable symbol, strong silhouette, disciplined geometry, scalable form, clean brand-system mockup without invented brand text.'
  },
  {
    id: 'red-envelope-cover', category: 'poster', featured: false, previewCaseId: 464,
    label: { zh: '红包封面', en: 'Red-envelope cover' },
    description: { zh: '节日竖版，吉祥醒目', en: 'Festive vertical cover with auspicious impact' },
    prompt: 'Elegant festive red-envelope cover design, strong vertical composition, auspicious decorative rhythm, refined red and gold palette, clear focal illustration, premium digital finish.'
  },
  {
    id: 'ink-wash', category: 'oriental', featured: true, previewCaseId: 445, previewAsset: '/images/style-presets/github/ink-wash.webp',
    label: { zh: '水墨意境', en: 'Ink wash' }, aliases: ['水墨画'],
    description: { zh: '留白含蓄，墨色流动', en: 'Expressive ink and calm negative space' },
    prompt: 'Contemporary Chinese ink-wash aesthetic, expressive ink diffusion, elegant negative space, restrained mineral color accents, poetic atmospheric depth.'
  },
  {
    id: 'meticulous-painting', category: 'oriental', featured: false, previewCaseId: 242,
    label: { zh: '工笔画', en: 'Meticulous painting' },
    description: { zh: '线描精细，设色雅致', en: 'Precise lines and elegant color' },
    prompt: 'Chinese meticulous painting aesthetic, precise fine-line drawing, elegant layered colors, refined decorative detail, balanced classical composition.'
  },
  {
    id: 'dunhuang', category: 'oriental', featured: false, previewCaseId: 276,
    label: { zh: '敦煌壁画', en: 'Dunhuang mural' },
    description: { zh: '矿物色彩，古朴壁画感', en: 'Mineral colors and aged mural texture' },
    prompt: 'Dunhuang mural-inspired visual language, mineral pigments, weathered wall texture, elegant flowing lines, warm historical palette, balanced ornamental rhythm.'
  },
  {
    id: 'neo-chinese', category: 'oriental', featured: false, previewCaseId: 304,
    label: { zh: '新中式', en: 'Neo-Chinese' },
    description: { zh: '东方元素，现代构成', en: 'Eastern motifs with modern composition' },
    prompt: 'Modern Chinese visual design, restrained oriental motifs, contemporary spatial composition, refined materials, sophisticated light, elegant cultural atmosphere.'
  },
  {
    id: 'guochao-poster', category: 'oriental', featured: false, previewCaseId: 276,
    label: { zh: '国潮海报', en: 'Guochao poster' },
    description: { zh: '传统符号，现代潮流排版', en: 'Traditional symbols with modern graphic energy' },
    prompt: 'Contemporary guochao poster, recognizable Chinese cultural motifs, bold modern graphic composition, rich but controlled color, premium campaign finish.'
  },
  {
    id: 'oriental-fantasy', category: 'oriental', featured: false, previewCaseId: 304,
    label: { zh: '东方幻想', en: 'Oriental fantasy' },
    description: { zh: '东方美学，梦幻叙事', en: 'Eastern aesthetics and dreamlike storytelling' },
    prompt: 'Elegant oriental fantasy, poetic atmospheric depth, refined Chinese-inspired motifs, cinematic mist and light, sophisticated color harmony, coherent narrative detail.'
  },
  {
    id: 'modern-ink-color', category: 'oriental', featured: false, previewCaseId: 279,
    label: { zh: '吴冠中彩墨', en: 'Modern ink and color' }, aliases: ['吴冠中'],
    description: { zh: '东方线条，抽象彩点与留白', en: 'Eastern line, abstract color accents, and negative space' },
    prompt: 'Modern Chinese ink-and-color painting, rhythmic black linework, abstract architectural forms, lively restrained color accents, generous negative space, elegant contemporary composition.'
  },
  {
    id: 'impressionist-garden', category: 'illustration', featured: false, previewCaseId: 298,
    label: { zh: '莫奈印象', en: 'Monet impressionism' }, aliases: ['莫奈'],
    description: { zh: '光色颤动，印象派笔触', en: 'Shimmering light and impressionist brushwork' },
    prompt: 'French impressionist painting with luminous broken-color brushwork, atmospheric outdoor light, soft reflected color, garden-like visual rhythm, textured canvas surface.'
  },
  {
    id: 'pocket-box', category: 'playful', featured: false, previewCaseId: 476,
    label: { zh: '口袋盒子', en: 'Pocket box' },
    description: { zh: '小盒子里的完整世界', en: 'A complete world inside a tiny box' },
    prompt: 'Charming pocket-box diorama, a complete miniature scene contained within a compact open box, precise tiny props, layered depth, warm storytelling light.'
  },
  {
    id: 'city-capsule', category: 'playful', featured: false, previewCaseId: 489,
    label: { zh: '城市胶囊', en: 'City capsule' },
    description: { zh: '城市装入透明容器', en: 'A city enclosed in a transparent capsule' },
    prompt: 'Imaginative city capsule, recognizable miniature urban landmarks enclosed inside a transparent capsule, convincing glass, clean product-like staging, rich tiny detail.'
  },
  {
    id: 'voxel-world', category: 'playful', featured: false, previewCaseId: 215, previewAsset: '/images/style-presets/github/voxel-art.webp',
    label: { zh: '方块世界', en: 'Voxel world' },
    description: { zh: '方块建模，游戏场景感', en: 'Block modeling and game-like worlds' },
    prompt: 'Detailed voxel-art world, coherent cubic geometry, readable block-built characters and environments, lively lighting, playful game-scene composition.'
  },
  {
    id: 'pixel-art', category: 'playful', featured: false, previewCaseId: 215, previewAsset: '/images/style-presets/github/16-bit-pixel-art.webp',
    label: { zh: '像素艺术', en: 'Pixel art' }, aliases: ['像素'],
    description: { zh: '复古像素，清晰轮廓', en: 'Retro pixels and clear silhouettes' },
    prompt: 'High-quality pixel art, deliberate limited-resolution shapes, crisp silhouettes, controlled palette, readable lighting clusters, polished retro-game composition.'
  },
  {
    id: 'building-blocks', category: 'playful', featured: false, previewCaseId: 390,
    label: { zh: '积木世界', en: 'Building blocks' }, aliases: ['积木'],
    description: { zh: '玩具积木，模块化造型', en: 'Toy blocks and modular construction' },
    prompt: 'Playful building-block aesthetic, modular toy construction, clearly interlocking pieces, bright controlled colors, clean tabletop lighting, recognizable subject form.'
  },
  {
    id: 'sticker-pack', category: 'playful', featured: false, previewCaseId: 506,
    label: { zh: '贴纸套装', en: 'Sticker pack' }, aliases: ['贴纸'],
    description: { zh: '多表情展示，轮廓清楚', en: 'Multiple expressions with clean outlines' },
    prompt: 'Cohesive sticker-pack sheet, multiple expressive variations of the same subject, bold clean outlines, consistent color system, even spacing, production-ready cut borders.'
  },
  {
    id: 'colorful-fantasy', category: 'playful', featured: false, previewCaseId: 500, previewAsset: '/images/style-presets/github/pastel.webp',
    label: { zh: '多彩梦幻', en: 'Colorful fantasy' },
    description: { zh: '虹彩光影，童话氛围', en: 'Rainbow light and fairy-tale atmosphere' },
    prompt: 'Colorful fantasy scene, luminous rainbow accents, dreamy layered atmosphere, playful storybook forms, balanced saturation, polished magical detail.'
  },
  {
    id: 'steampunk', category: 'playful', featured: false, previewCaseId: 179,
    label: { zh: '蒸汽朋克', en: 'Steampunk' },
    description: { zh: '黄铜齿轮，复古机械', en: 'Brass gears and retro machinery' },
    prompt: 'Detailed steampunk design, coherent brass and copper machinery, functional gears and pipes, Victorian-inspired craftsmanship, warm dramatic light, believable mechanical construction.'
  },
  {
    id: 'pastel-doll-fashion', category: 'playful', featured: false, previewCaseId: 500,
    label: { zh: '芭比风', en: 'Pastel doll fashion' },
    description: { zh: '鲜亮粉彩，精致玩偶美学', en: 'Bright pastel fashion and polished doll aesthetics' },
    prompt: 'Glossy pastel doll-fashion aesthetic, confident glamorous styling, bright pink-forward palette, polished studio set, playful luxury accessories, original character identity.'
  },
  {
    id: 'healing-plush-doll', category: 'playful', featured: false, previewCaseId: 507,
    label: { zh: 'Jellycat风格', en: 'Healing plush doll' },
    description: { zh: '软糯拟人，温暖陪伴感', en: 'Soft anthropomorphic plush companions' },
    prompt: 'Charming original anthropomorphic plush-toy aesthetic, soft tactile fibers, simple friendly face, rounded huggable proportions, cozy warm staging, premium product detail.'
  },
  {
    id: 'future-sci-fi', category: 'playful', featured: false, previewCaseId: 172,
    label: { zh: '未来科幻', en: 'Future sci-fi' },
    description: { zh: '未来建筑，清洁科技感', en: 'Future architecture and clean technology' },
    prompt: 'Optimistic future science-fiction design, advanced but coherent technology, clean architectural forms, luminous interfaces, cinematic depth, refined high-tech materials.'
  },
  {
    id: 'festival-spring-new-year', category: 'festival', featured: true, previewCaseId: 464,
    label: { zh: '春节喜庆', en: 'Lunar New Year' }, aliases: ['春节', '除夕', '新年'],
    description: { zh: '中国红、灯笼、金色年味', en: 'Red, lanterns, and golden celebration' },
    prompt: 'Festive Lunar New Year atmosphere with refined Chinese red and warm gold, elegant lanterns, paper-cut inspired details, subtle fireworks, joyful reunion energy, premium uncluttered composition.'
  },
  {
    id: 'festival-lantern', category: 'festival', featured: false, previewCaseId: 327,
    label: { zh: '元宵灯会', en: 'Lantern Festival' }, aliases: ['元宵节'],
    description: { zh: '花灯夜色，温暖团圆', en: 'Glowing lanterns and warm reunion' },
    prompt: 'Elegant Lantern Festival night atmosphere, glowing handcrafted lanterns, warm reflections, subtle traditional cloud motifs, joyful gathering mood, cinematic depth, polished festive color.'
  },
  {
    id: 'festival-qingming', category: 'festival', featured: false, previewCaseId: 445,
    label: { zh: '清明春日', en: 'Qingming Spring' }, aliases: ['清明节'],
    description: { zh: '青绿烟雨，克制留白', en: 'Misty green spring and quiet space' },
    prompt: 'Quiet Qingming spring atmosphere with misty green hills, fine rain, fresh willow branches, pale natural light, restrained Chinese poetic composition, reflective and peaceful rather than somber.'
  },
  {
    id: 'festival-dragon-boat', category: 'festival', featured: false, previewCaseId: 276,
    label: { zh: '端午龙舟', en: 'Dragon Boat Festival' }, aliases: ['端午节'],
    description: { zh: '龙舟、水纹、粽叶青绿', en: 'Dragon boats, water, and bamboo green' },
    prompt: 'Energetic Dragon Boat Festival atmosphere with rhythmic racing boats, dynamic water splashes, bamboo-leaf green and vermilion accents, handcrafted festive details, bold readable action.'
  },
  {
    id: 'festival-520', category: 'festival', featured: false, previewCaseId: 519,
    label: { zh: '520告白季', en: '520 Love Day' }, aliases: ['520'],
    description: { zh: '爱心礼盒，轻甜浪漫', en: 'Hearts, gifts, and modern romance' },
    prompt: 'Modern romantic 520 campaign atmosphere with elegant heart forms, refined gift styling, rose and blush gradients, soft luminous highlights, youthful premium mood, clean commercial composition.'
  },
  {
    id: 'festival-qixi', category: 'festival', featured: false, previewCaseId: 304,
    label: { zh: '七夕浪漫', en: 'Qixi Festival' }, aliases: ['七夕'],
    description: { zh: '星河鹊桥，东方浪漫', en: 'Starlight bridge and Eastern romance' },
    prompt: 'Poetic Qixi Festival atmosphere with a luminous star river, graceful bridge silhouette, deep indigo and rose-gold palette, subtle oriental cloud motifs, refined romantic night lighting.'
  },
  {
    id: 'festival-mid-autumn', category: 'festival', featured: true, previewCaseId: 304,
    label: { zh: '中秋团圆', en: 'Mid-Autumn Festival' }, aliases: ['中秋节'],
    description: { zh: '明月、桂花、温暖团圆', en: 'Moonlight, osmanthus, and reunion' },
    prompt: 'Elegant Mid-Autumn Festival atmosphere with a luminous full moon, delicate osmanthus branches, soft cloud layers, warm family reunion mood, refined blue and gold night palette.'
  },
  {
    id: 'festival-national-day', category: 'festival', featured: false, previewCaseId: 459,
    label: { zh: '国庆庆典', en: 'National Day Celebration' }, aliases: ['国庆节'],
    description: { zh: '红金盛典，城市荣光', en: 'Red-gold celebration and city light' },
    prompt: 'Grand National Day celebration atmosphere with flowing red and gold ribbons, confident civic skyline, bright ceremonial lighting, energetic but orderly composition, no political portraits or added text.'
  },
  {
    id: 'festival-new-year', category: 'festival', featured: false, previewCaseId: 488,
    label: { zh: '元旦跨年', en: 'New Year Countdown' }, aliases: ['元旦', '跨年'],
    description: { zh: '烟花、亮片、跨年派对', en: 'Fireworks, confetti, and countdown energy' },
    prompt: 'Stylish New Year countdown atmosphere with layered fireworks, metallic confetti, luminous midnight blue and champagne gold, celebratory energy, premium event photography finish, no readable numerals.'
  },
  {
    id: 'festival-childrens-day', category: 'festival', featured: false, previewCaseId: 452,
    label: { zh: '六一童趣', en: "Children's Day" }, aliases: ['儿童节', '六一'],
    description: { zh: '气球积木，明快童真', en: 'Balloons, blocks, and playful color' },
    prompt: 'Cheerful Children’s Day atmosphere with colorful balloons, friendly building blocks, paper shapes, bright daylight, safe playful energy, clean child-friendly illustration and no brand characters.'
  },
  {
    id: 'festival-valentine', category: 'festival', featured: false, previewCaseId: 519,
    label: { zh: '情人节', en: "Valentine's Day" },
    description: { zh: '玫瑰爱心，精致浪漫', en: 'Roses, hearts, and refined romance' },
    prompt: 'Refined Valentine’s Day atmosphere with sculptural heart forms, fresh roses, warm candlelike highlights, deep red and blush palette, elegant intimate mood, polished commercial styling.'
  },
  {
    id: 'festival-mothers-day', category: 'festival', featured: false, previewCaseId: 298,
    label: { zh: '母亲节', en: "Mother's Day" },
    description: { zh: '花束柔光，温暖感谢', en: 'Flowers, soft light, and gratitude' },
    prompt: 'Warm Mother’s Day atmosphere with graceful carnation-inspired flowers, soft morning light, cream and blush palette, gentle gratitude and family warmth, elegant uncluttered presentation.'
  },
  {
    id: 'festival-fathers-day', category: 'festival', featured: false, previewCaseId: 449,
    label: { zh: '父亲节', en: "Father's Day" },
    description: { zh: '沉稳礼赠，温暖陪伴', en: 'Confident gifting and warm companionship' },
    prompt: 'Refined Father’s Day gifting atmosphere with deep navy, warm leather-brown accents, precise tailored details, calm directional light, dependable and warm family mood, premium restrained composition.'
  },
  {
    id: 'festival-easter', category: 'festival', featured: false, previewCaseId: 298,
    label: { zh: '复活节', en: 'Easter' },
    description: { zh: '彩蛋、春草、柔和粉彩', en: 'Decorated eggs and spring pastels' },
    prompt: 'Bright Easter spring atmosphere with artistically decorated eggs, fresh grass, delicate flowers, soft pastel colors, gentle morning light, joyful clean composition, original motifs only.'
  },
  {
    id: 'festival-halloween', category: 'festival', featured: false, previewCaseId: 500,
    label: { zh: '万圣节', en: 'Halloween' },
    description: { zh: '南瓜幽灵，趣味暗夜', en: 'Pumpkins and playful spooky night' },
    prompt: 'Playful Halloween atmosphere with carved pumpkins, friendly ghost shapes, moonlit violet and orange palette, theatrical mist, whimsical spooky energy, visually rich but suitable for general audiences.'
  },
  {
    id: 'festival-thanksgiving', category: 'festival', featured: false, previewCaseId: 517,
    label: { zh: '感恩节', en: 'Thanksgiving' },
    description: { zh: '秋叶丰收，温暖餐桌', en: 'Autumn harvest and a warm table' },
    prompt: 'Warm Thanksgiving harvest atmosphere with amber autumn leaves, pumpkins, wheat, natural table textures, golden late-afternoon light, generous gathering mood, refined rustic composition.'
  },
  {
    id: 'festival-christmas', category: 'festival', featured: true, previewCaseId: 507,
    label: { zh: '圣诞节', en: 'Christmas' },
    description: { zh: '松枝雪景，红绿金礼物', en: 'Evergreen, snow, and festive gifts' },
    prompt: 'Premium Christmas atmosphere with evergreen branches, warm string lights, soft snow, elegant red green and gold gift styling, cozy cinematic glow, uncluttered seasonal composition.'
  },
  {
    id: 'festival-black-friday', category: 'festival', featured: false, previewCaseId: 511,
    label: { zh: '黑五促销', en: 'Black Friday' }, aliases: ['黑色星期五'],
    description: { zh: '黑红撞色，强促销节奏', en: 'Black-red contrast and sale energy' },
    prompt: 'High-impact Black Friday retail atmosphere with sharp black and electric red contrast, dynamic spotlight beams, layered shopping-tag geometry, urgent premium campaign energy, no added pricing or readable text.'
  },
  {
    id: 'festival-wedding', category: 'festival', featured: true, previewCaseId: 499,
    label: { zh: '婚礼庆典', en: 'Wedding Celebration' }, aliases: ['结婚', '婚礼'],
    description: { zh: '花艺戒指，洁净典礼感', en: 'Florals, rings, and elegant ceremony' },
    prompt: 'Elegant wedding celebration atmosphere with refined floral arrangements, intertwined rings, ivory fabric, champagne highlights, soft ceremonial light, timeless romantic composition, no names or added text.'
  },
  {
    id: 'festival-birthday', category: 'festival', featured: false, previewCaseId: 41,
    label: { zh: '生日派对', en: 'Birthday Party' }, aliases: ['生日'],
    description: { zh: '蛋糕气球，明快派对感', en: 'Cake, balloons, and bright party energy' },
    prompt: 'Joyful birthday celebration atmosphere with a beautiful cake, glowing candles, balloons and ribbons, lively balanced color, polished party lighting, festive composition with no names or age numerals.'
  }
].map((preset) => Object.freeze({
  ...preset,
  previewAsset: `/images/style-presets/generated/${preset.id}.webp`
})));

const PRESET_BY_ID = new Map(IMAGE_STYLE_PRESETS.map((preset) => [preset.id, preset]));

export function normalizeImageStylePresetId(value) {
  const id = String(value || '').trim().toLowerCase();
  return PRESET_BY_ID.has(id) ? id : '';
}

export function getImageStylePreset(value) {
  return PRESET_BY_ID.get(normalizeImageStylePresetId(value)) || null;
}

export function localizeImageStyleValue(value, language = 'zh') {
  if (!value || typeof value !== 'object') return '';
  return String(value[language] || value.zh || value.en || '');
}

export function buildStyledImagePrompt(prompt, stylePresetId) {
  const userPrompt = String(prompt || '').trim();
  const preset = getImageStylePreset(stylePresetId);
  if (!preset) return userPrompt;
  return [
    userPrompt,
    '',
    'System-selected visual style:',
    preset.prompt,
    STYLE_SAFETY_SUFFIX
  ].join('\n');
}
