import {
  ArrowRight,
  Clapperboard,
  ImageIcon,
  Layers3,
  Megaphone,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Upload,
  Video
} from 'lucide-react';
import './homepage.css';
import batchEditImage from './assets/homepage/batch-edit.webp';
import canvasHistoryImage from './assets/homepage/canvas-history.webp';
import ecommerceDeliveryImage from './assets/homepage/ecommerce-delivery.webp';
import ecommerceGenerateImage from './assets/homepage/ecommerce-generate.webp';
import freeStudioImage from './assets/homepage/free-studio.webp';
import inspirationGalleryImage from './assets/homepage/inspiration-gallery.webp';
import taskListImage from './assets/homepage/task-list.webp';

const HOME_IMAGES = Object.freeze({
  'batch-edit.webp': batchEditImage,
  'canvas-history.webp': canvasHistoryImage,
  'ecommerce-delivery.webp': ecommerceDeliveryImage,
  'ecommerce-generate.webp': ecommerceGenerateImage,
  'free-studio.webp': freeStudioImage,
  'inspiration-gallery.webp': inspirationGalleryImage,
  'task-list.webp': taskListImage
});

const HOME_COPY = {
  zh: {
    eyebrow: '面向真实业务的 AI 视觉工作台',
    titleA: '从一张图，', titleB: '到一套', titleAccent: '会卖、会动', titleC: '的内容。',
    intro: 'Pic365 把灵感生图、精准改图、电商套图、无限画布和视频创作连成一条工作流。少填参数，把商品、品牌和人物的一致性留给系统处理。',
    start: '免费开始创作', findFit: '看看适合我的场景',
    proof: [['图像 + 视频', '统一创作入口'], ['参考图约束', '保持真实与一致'], ['多模型渠道', '质量与成本可选']],
    visualNote: '不仅是“生成一张图”', visualNoteBody: '把每次创作沉淀为可复用的素材、版本和画布关系。', realShots: '真实界面截图',
    principles: [
      ['灵感不是终点', '范例可直接进入创作，提示词、参考图和结果继续衔接。'],
      ['商品事实优先', '结构、颜色、材质、包装与配件约束自动进入生成链路。'],
      ['批量也能精细', '独立提示词、单张重做、版本采用与统一交付并行完成。'],
      ['创作资产可复用', '历史作品、媒资库、画布节点和引用关系长期保留。']
    ],
    audienceKicker: 'WHO IT IS FOR', audienceTitle: '不同团队，都有清晰的使用入口',
    audienceLead: '首页先回答“我能拿它做什么”。每个场景都给出典型任务、对应能力和真实产品界面。',
    audiences: [
      { label: '01 · 图片设计', title: '设计师与内容创作者', body: '从灵感库开始，使用母版与多张参考图锁定主体，再通过单图创作和局部精修快速收敛结果。', tags: ['灵感范例', 'AI 魔笔', '参考图编辑', '多版本比较'], image: 'free-studio.webp', icon: ImageIcon, className: 'design' },
      { label: '02 · 广告创作', title: '市场与品牌团队', body: '同一创意快速产出不同画幅、文案方向和渠道版本，适合广告素材测试、社交媒体和活动视觉。', tags: ['批量改图', '独立提示词', '多尺寸适配', '任务列表'], image: 'batch-edit.webp', icon: Megaphone, className: 'ads' },
      { label: '03 · 电商运营', title: '商家、运营与商品团队', body: '上传真实商品素材后，系统自动识别品类、目标用户和使用场景，再按平台生成主图、卖点图与交付素材。', tags: ['商品母版', '平台套图', '自动约束', '精修交付'], image: 'ecommerce-delivery.webp', icon: ShoppingBag, className: 'commerce' },
      { label: '04 · 短剧创作', title: '编导、分镜与短视频团队', body: '把角色定妆、场景参考和镜头版本放进无限画布，保持人物关系清晰，再让选中的画面直接动起来。', tags: ['角色一致性', '分镜画布', '引用关系', '图生视频'], image: 'task-list.webp', icon: Clapperboard, className: 'story' }
    ],
    workflowKicker: 'ONE CONNECTED WORKFLOW', workflowTitle: '创意、生产、管理\n不再分散在不同工具',
    workflowLead: 'Pic365 让“生成结果”继续成为下一步的输入，而不是下载后重新开始。',
    steps: [['从真实素材或灵感开始', '上传、粘贴、资源库或历史作品都可以进入创作。'], ['批量生成并保留版本关系', '参考图用途、提示词和任务状态都跟随作品保存。'], ['进入画布编排或视频创作', '选中实体即可引用、精修、衍生或转为动态内容。']],
    canvasCaption: '历史作品一键加入画布', deliveryCaption: '从生成结果继续精修与交付',
    casesKicker: 'EXAMPLES', casesTitle: '不是抽象能力，是可复用的生产结果', casesLead: '用当前产品中的真实任务举例，帮助访客快速判断 Pic365 是否适合自己的工作。',
    cases: [
      { type: '电商运营', title: '一组商品素材，完成平台套图', body: '商品母版约束结构和配件，按槽位生成主图、场景图、细节图，再统一进入精修交付。', fit: '品牌商家 / 代运营', action: '查看工作流', image: 'ecommerce-delivery.webp' },
      { type: '广告创作', title: '从范例风格快速生成营销视觉', body: '从饮品广告、海报和品牌图标范例进入创作，保留风格方向并替换为自己的主体。', fit: '市场 / 社媒 / 广告', action: '浏览范例', image: 'inspiration-gallery.webp' },
      { type: '短剧创作', title: '角色参考贯穿多个镜头版本', body: '主编辑图与辅助参考图分工明确，批量镜头保持角色特征，再在画布中组合为分镜。', fit: '编导 / 分镜 / 短视频', action: '进入画布', image: 'task-list.webp' }
    ],
    whyTitle: '为什么 Pic365 更适合持续创作？',
    features: [['真实素材约束', '参考图用途与商品事实进入后台约束，减少主体漂移。'], ['版本不丢失', '结果、子版本、任务与画布关系自动沉淀。'], ['成本可预期', '按模型、质量、参考图与视频时长清晰计费。'], ['团队可管理', '媒资、项目、通知和运营配置形成完整闭环。']],
    quote: '“少填参数，不牺牲控制。\n让系统处理复杂约束，\n让用户专注创意判断。”', principle: 'Pic365 产品原则', principleValue: '简单、真实、可持续',
    ctaKicker: 'START WITH ONE IDEA', ctaTitle: '把今天的一张图，变成明天的一整套内容',
    ctaBody: '从灵感生图开始，或者直接上传真实商品、角色和场景素材。Pic365 会在同一个工作区里继续完成改图、套图、画布编排和视频创作。',
    footer: 'AI 视觉内容工作台', footerLinks: '灵感生图 · 无限画布 · 电商套图 · 视频创作'
  },
  en: {
    eyebrow: 'An AI visual workspace built for real production', titleA: 'From one image', titleB: 'to a complete set of', titleAccent: 'selling, moving', titleC: 'content.',
    intro: 'Pic365 connects image generation, precise editing, commerce sets, infinite canvas, and video creation in one workflow—while the system handles product, brand, and character consistency.',
    start: 'Start creating free', findFit: 'Find your workflow', proof: [['Image + video', 'One creation entry'], ['Reference constraints', 'Keep facts consistent'], ['Multiple providers', 'Choose quality and cost']],
    visualNote: 'More than generating one image', visualNoteBody: 'Every creation becomes reusable assets, versions, and canvas relationships.', realShots: 'Real product screens',
    principles: [['Ideas keep moving', 'Examples flow directly into creation and refinement.'], ['Product facts first', 'Structure, color, material, packaging, and accessories stay constrained.'], ['Precise at scale', 'Independent prompts, retries, adoption, and delivery work together.'], ['Reusable assets', 'History, media, nodes, and references remain available.']],
    audienceKicker: 'WHO IT IS FOR', audienceTitle: 'A clear starting point for every team', audienceLead: 'Each scenario explains the job, the matching capability, and a real Pic365 interface.',
    audiences: [
      { label: '01 · IMAGE DESIGN', title: 'Designers and creators', body: 'Start from inspiration, lock the subject with a master and references, then refine individual images quickly.', tags: ['Inspiration', 'AI magic', 'References', 'Versions'], image: 'free-studio.webp', icon: ImageIcon, className: 'design' },
      { label: '02 · AD CREATION', title: 'Marketing and brand teams', body: 'Turn one idea into channel sizes and creative variants for campaigns, social media, and testing.', tags: ['Batch editing', 'Per-image prompts', 'Sizes', 'Tasks'], image: 'batch-edit.webp', icon: Megaphone, className: 'ads' },
      { label: '03 · COMMERCE', title: 'Merchants and operators', body: 'Upload real product assets, then generate platform-aware hero, benefit, detail, and delivery images.', tags: ['Master asset', 'Platform sets', 'Constraints', 'Delivery'], image: 'ecommerce-delivery.webp', icon: ShoppingBag, className: 'commerce' },
      { label: '04 · SHORT DRAMA', title: 'Directors and storyboard teams', body: 'Organize character, scene, and shot references on canvas, then turn selected frames into motion.', tags: ['Characters', 'Storyboards', 'References', 'Image to video'], image: 'task-list.webp', icon: Clapperboard, className: 'story' }
    ],
    workflowKicker: 'ONE CONNECTED WORKFLOW', workflowTitle: 'Create, produce, manage—\nwithout switching tools', workflowLead: 'Outputs remain usable inputs for the next step instead of becoming disconnected downloads.',
    steps: [['Start with real assets or inspiration', 'Upload, paste, library, and history all connect to creation.'], ['Generate at scale and keep versions', 'Reference roles, prompts, and task status remain attached.'], ['Compose on canvas or create video', 'Reference, refine, branch, and animate selected entities.']],
    canvasCaption: 'Add history directly to canvas', deliveryCaption: 'Continue from generation to delivery', casesKicker: 'EXAMPLES', casesTitle: 'Reusable production outcomes, not abstract features', casesLead: 'Real tasks help visitors identify the workflow that fits their work.',
    cases: [
      { type: 'Commerce', title: 'Turn product assets into a platform set', body: 'Use the master to lock structure and accessories, generate by slot, then refine and deliver.', fit: 'Brands / agencies', action: 'View workflow', image: 'ecommerce-delivery.webp' },
      { type: 'Advertising', title: 'Turn inspiration into campaign visuals', body: 'Enter from beverage ads, posters, and brand examples, then replace the subject while retaining direction.', fit: 'Marketing / social', action: 'Browse examples', image: 'inspiration-gallery.webp' },
      { type: 'Short drama', title: 'Keep characters consistent across shots', body: 'Separate primary and supporting references, generate shots in batches, and organize storyboards.', fit: 'Directors / video', action: 'Open canvas', image: 'task-list.webp' }
    ],
    whyTitle: 'Why Pic365 works for continuous creation', features: [['Fact constraints', 'Reference roles and product facts reduce subject drift.'], ['Versions persist', 'Results, branches, tasks, and canvas relationships remain.'], ['Predictable cost', 'Pricing follows model, quality, references, and video duration.'], ['Team-ready', 'Assets, projects, notifications, and operations form one loop.']],
    quote: '“Fewer settings without losing control.\nLet the system manage constraints,\nso people can focus on creative judgment.”', principle: 'Pic365 principle', principleValue: 'Simple, truthful, reusable',
    ctaKicker: 'START WITH ONE IDEA', ctaTitle: 'Turn today’s image into tomorrow’s complete content set', ctaBody: 'Start from inspiration or upload real products, characters, and scenes. Continue editing, composing, and creating video in the same workspace.', footer: 'AI visual content workspace', footerLinks: 'Image Studio · Infinite Canvas · Commerce · Video'
  }
};

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function Homepage({ language = 'zh', navigation, onCreate, onCanvas, onEcommerce, onCases }) {
  const t = HOME_COPY[language] || HOME_COPY.zh;
  return (
    <div className="homeLanding">
      {navigation}

      <section className="homeHero">
        <div className="homeWrap homeHeroGrid">
          <div className="homeHeroCopy">
            <span className="homeEyebrow"><i />{t.eyebrow}</span>
            <h1>{t.titleA}<br />{t.titleB}<em>{t.titleAccent}</em><br />{t.titleC}</h1>
            <p>{t.intro}</p>
            <div className="homeHeroActions"><button className="homePrimaryButton" type="button" onClick={onCreate}>{t.start}<ArrowRight size={17} /></button><button className="homeSecondaryButton" type="button" onClick={() => scrollToSection('homepage-audiences')}>{t.findFit}</button></div>
            <div className="homeProof">{t.proof.map(([title, body]) => <span key={title}><b>{title}</b>{body}</span>)}</div>
          </div>
          <div className="homeHeroVisual">
            <div className="homeFloatingNote"><strong>{t.visualNote}</strong><span>{t.visualNoteBody}</span></div>
            <div className="homeFloatingChip"><Sparkles size={13} />{t.realShots}</div>
            <figure className="homeWindow main"><div className="homeWindowBar"><i /><i /><i /></div><div><img src={inspirationGalleryImage} alt={t.realShots} /></div></figure>
            <figure className="homeWindow side"><div className="homeWindowBar"><i /><i /><i /></div><div><img src={freeStudioImage} alt={t.audiences[0].title} /></div></figure>
            <figure className="homeWindow mini"><div className="homeWindowBar"><i /><i /><i /></div><div><img src={ecommerceGenerateImage} alt={t.audiences[2].title} /></div></figure>
          </div>
        </div>
      </section>

      <section className="homePrinciples homeWrap">{t.principles.map(([title, body], index) => <article key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{body}</p></div></article>)}</section>

      <section className="homeSection tint" id="homepage-audiences">
        <div className="homeWrap">
          <header className="homeSectionHead"><div><small>{t.audienceKicker}</small><h2>{t.audienceTitle}</h2></div><p>{t.audienceLead}</p></header>
          <div className="homeAudienceGrid">{t.audiences.map((item) => { const Icon = item.icon; return <article className={`homeAudienceCard ${item.className}`} key={item.label}><span className="homeAudienceLabel"><Icon size={15} />{item.label}</span><h3>{item.title}</h3><p>{item.body}</p><ul>{item.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul><div className="homeShot"><img src={HOME_IMAGES[item.image]} alt={item.title} loading="lazy" /></div></article>; })}</div>
        </div>
      </section>

      <section className="homeSection">
        <div className="homeWrap homeWorkflow">
          <div className="homeWorkflowCopy"><small>{t.workflowKicker}</small><h2>{t.workflowTitle.split('\n').map((line) => <span key={line}>{line}</span>)}</h2><p>{t.workflowLead}</p><div className="homeSteps">{t.steps.map(([title, body], index) => <div className="homeStep" key={title}><b>{index + 1}</b><div><strong>{title}</strong><span>{body}</span></div></div>)}</div></div>
          <div className="homeWorkflowVisual"><figure><img src={canvasHistoryImage} alt={t.canvasCaption} loading="lazy" /><figcaption>{t.canvasCaption}</figcaption></figure><figure><img src={ecommerceDeliveryImage} alt={t.deliveryCaption} loading="lazy" /><figcaption>{t.deliveryCaption}</figcaption></figure></div>
        </div>
      </section>

      <section className="homeSection tint">
        <div className="homeWrap">
          <header className="homeSectionHead"><div><small>{t.casesKicker}</small><h2>{t.casesTitle}</h2></div><p>{t.casesLead}</p></header>
          <div className="homeCaseGrid">{t.cases.map((item, index) => <article className="homeCase" key={item.title}><div className="homeCaseImage"><img src={HOME_IMAGES[item.image]} alt={item.title} loading="lazy" /></div><div className="homeCaseBody"><small>{item.type}</small><h3>{item.title}</h3><p>{item.body}</p><footer><span>{language === 'zh' ? '适合：' : 'For: '}{item.fit}</span><button type="button" onClick={[onEcommerce, onCases, onCanvas][index]}>{item.action}<ArrowRight size={13} /></button></footer></div></article>)}</div>
        </div>
      </section>

      <section className="homeSection">
        <div className="homeWrap homeWhy">
          <div className="homeWhyPanel"><h3>{t.whyTitle}</h3><div className="homeFeatures">{t.features.map(([title, body], index) => <div className="homeFeature" key={title}>{index === 0 ? <ShieldCheck size={18} /> : index === 1 ? <Layers3 size={18} /> : index === 2 ? <Video size={18} /> : <Upload size={18} />}<div><b>{title}</b><span>{body}</span></div></div>)}</div></div>
          <div className="homeWhyPanel quote"><blockquote>{t.quote.split('\n').map((line) => <span key={line}>{line}</span>)}</blockquote><footer><span>{t.principle}</span><b>{t.principleValue}</b></footer></div>
        </div>
      </section>

      <section className="homeCta"><div className="homeWrap"><div className="homeCtaCard"><small>{t.ctaKicker}</small><h2>{t.ctaTitle}</h2><p>{t.ctaBody}</p><button className="homePrimaryButton" type="button" onClick={onCreate}>{t.start}<ArrowRight size={17} /></button></div></div></section>
      <footer className="homeFooter"><div className="homeWrap"><span>© 2026 Pic365 · {t.footer}</span><span>{t.footerLinks}</span></div></footer>
    </div>
  );
}
