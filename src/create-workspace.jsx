import { useEffect, useState } from 'react';
import { Download, Eye, ImagePlus, Layers3, LoaderCircle, Sparkles, WandSparkles } from 'lucide-react';
import EcommerceWorkspace from './ecommerce-workspace';

function authHeaders(session) {
  return {};
}

function isAuthenticatedSession(session) {
  return Boolean(session?.user || session?.access_token);
}

const copy = {
  en: {
    eyebrow: 'Create with GPT-Image2',
    ecommerceMode: 'Product image sets',
    freeMode: 'Free-form image',
    title: 'Turn an idea into an image.',
    subtitle: 'Start from a prompt and turn an idea into an image.',
    promptLabel: 'Describe your image',
    placeholder: 'Describe the subject, composition, style, lighting, text, and output context...',
    sizeLabel: 'Canvas',
    sizeSquare: 'Square · 1024 × 1024',
    sizePortrait: 'Portrait · 1024 × 1536',
    sizeLandscape: 'Landscape · 1536 × 1024',
    qualityNote: 'P0 uses low quality and costs 1 credit per generation.',
    guestModeNote: 'Guest mode: one low-quality 1024 × 1024 image. Sign in with credits for the full canvas, cloud history, and downloads.',
    fullModeNote: 'Full canvas enabled: choose the canvas and quality, save to the cloud, and download your results.',
    creditRequired: 'This account needs credits to unlock the full canvas.',
    guestLimitReached: 'Your free guest image has been used. Sign in with credits to continue.',
    loadingAccess: 'Checking your workspace access...',
    qualityLabel: 'Quality',
    qualityLow: 'Low · faster',
    qualityMedium: 'Medium · detailed',
    generate: 'Generate image',
    generateGuest: 'Generate free image',
    signInForFull: 'Sign in for full canvas',
    generating: 'Generating...',
    signIn: 'Sign in to generate',
    emptyPrompt: 'Write a prompt first.',
    failed: 'Generation failed. Please try again.',
    history: 'Your recent generations',
    noHistory: 'Your generated images will appear here.',
    caseLibraryTitle: 'Start from a case',
    caseLibrarySubtitle: 'Filter the case library by the same categories used by cases and templates.',
    caseLibraryAll: 'All categories',
    caseLibraryEmpty: 'No cases in this category.',
    browseCases: 'Browse all cases',
    openCase: 'View case',
    download: 'Download',
    cloudSaved: 'Saved to your cloud history.',
    localSaved: 'Saved to local debug storage.',
    cloudSaveUnavailable: 'Cloud storage is not configured yet; this download is temporary.',
    guestDownloadNote: 'Guest previews cannot be downloaded or saved.',
    signInHint: 'One free low-quality preview is available. Sign in with credits for the full canvas.'
  },
  zh: {
    eyebrow: 'GPT-Image2 创作工作台',
    ecommerceMode: '电商套图',
    freeMode: '自由生图',
    title: '把想法直接变成图片。',
    subtitle: '输入 Prompt，把想法直接变成图片。',
    promptLabel: '描述你想要的图片',
    placeholder: '描述主体、构图、风格、光线、文字和使用场景……',
    sizeLabel: '画布比例',
    sizeSquare: '方形 · 1024 × 1024',
    sizePortrait: '竖图 · 1024 × 1536',
    sizeLandscape: '横图 · 1536 × 1024',
    qualityNote: 'P0 使用 low 质量，每次生成消耗 1 个积分。',
    guestModeNote: '游客模式：可免费生成 1 张 low 质量 1024 × 1024 图片。登录并拥有积分后，可使用完整画布、云端历史和下载。',
    fullModeNote: '完整画布已解锁：可选择画布和质量，云端保存并下载生成结果。',
    creditRequired: '当前账户需要积分才能解锁完整画布。',
    guestLimitReached: '游客免费图片已用完，请登录并获得积分后继续使用。',
    loadingAccess: '正在检查创作权限……',
    qualityLabel: '质量',
    qualityLow: 'Low · 更快',
    qualityMedium: 'Medium · 更细节',
    generate: '生成图片',
    generateGuest: '免费生成图片',
    signInForFull: '登录使用完整画布',
    generating: '生成中……',
    signIn: '登录后生成',
    emptyPrompt: '请先输入 Prompt。',
    failed: '生成失败，请稍后重试。',
    history: '最近生成',
    noHistory: '你生成的图片会显示在这里。',
    caseLibraryTitle: '从案例开始创作',
    caseLibrarySubtitle: '按案例和模板共用的分类快速筛选案例库。',
    caseLibraryAll: '全部分类',
    caseLibraryEmpty: '这个分类下暂时没有案例。',
    browseCases: '浏览全部案例',
    openCase: '查看案例',
    download: '下载图片',
    cloudSaved: '已保存到云端历史。',
    localSaved: '已保存到本地调试存储。',
    cloudSaveUnavailable: '云存储还没有配置完成；当前下载链接是临时的。',
    guestDownloadNote: '游客预览不能下载，也不会保存到云端。',
    signInHint: '游客可免费生成 1 张预览图；登录并拥有积分后可使用完整画布。'
  }
};

export default function CreateWorkspace({
  language,
  session,
  profile,
  cases = [],
  categoryOptions = [],
  category = 'All',
  onCategoryChange,
  onOpenCase,
  onBrowseCases,
  onSignIn,
  onBilling,
  onProfileChange
}) {
  const t = copy[language] || copy.en;
  const [workspaceMode, setWorkspaceMode] = useState('ecommerce');
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('medium');
  const [guestUsed, setGuestUsed] = useState(false);
  const [state, setState] = useState({ status: 'idle', image: '', message: '', generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
  const [history, setHistory] = useState([]);
  const categoryLabels = new Map(categoryOptions.map((option) => [option.value, option.label]));
  const isSignedIn = isAuthenticatedSession(session);
  const hasFullWorkspace = isSignedIn && Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
  const isGuest = !isSignedIn;
  const visibleHistory = history.filter((item) => item.status === 'succeeded' && item.imageUrl);

  useEffect(() => {
    let active = true;
    if (!isSignedIn || !hasFullWorkspace) {
      setHistory([]);
      return () => {
        active = false;
      };
    }

    fetch('/api/generations', { headers: authHeaders(session) })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) setHistory(payload.generations || []);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [isSignedIn, hasFullWorkspace]);

  useEffect(() => {
    if (isSignedIn) return undefined;
    let active = true;
    fetch('/api/generate-image')
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) setGuestUsed(Boolean(payload.guestFreeUsed));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [isSignedIn]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setState({ status: 'error', image: '', message: t.emptyPrompt, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
      return;
    }
    if (isSignedIn && !profile) {
      setState({ status: 'error', image: '', message: t.loadingAccess, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
      return;
    }
    if (isSignedIn && !hasFullWorkspace) {
      onBilling();
      setState({ status: 'idle', image: '', message: t.creditRequired, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
      return;
    }
    if (isGuest && guestUsed) {
      onSignIn();
      setState({ status: 'error', image: '', message: t.guestLimitReached, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
      return;
    }

    setState({ status: 'generating', image: '', message: '', generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
    try {
      const requestSize = hasFullWorkspace ? size : '1024x1024';
      const requestQuality = hasFullWorkspace ? quality : 'low';
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(session)
        },
        body: JSON.stringify({ prompt: trimmedPrompt, size: requestSize, quality: requestQuality })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !payload.image) {
        if (payload.user) onProfileChange(payload.user);
        if (payload.error === 'CREDITS_REQUIRED') {
          onBilling();
          setState({ status: 'idle', image: '', message: t.creditRequired, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
          return;
        }
        if (payload.error === 'GUEST_FREE_LIMIT_REACHED') {
          setGuestUsed(true);
          onSignIn();
          setState({ status: 'error', image: '', message: t.guestLimitReached, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
          return;
        }
        throw new Error(payload.error || 'GENERATION_FAILED');
      }

      const item = {
        id: payload.generationId || `${Date.now()}`,
        prompt: trimmedPrompt,
        imageUrl: payload.image,
        createdAt: new Date().toISOString(),
        status: 'succeeded'
      };
      if (payload.guest) {
        setGuestUsed(true);
      } else {
        setHistory((current) => [item, ...current.filter((entry) => entry.id !== item.id)].slice(0, 30));
      }
      setState({
        status: 'success',
        image: payload.image,
        message: '',
        generationId: payload.generationId || '',
        downloadAllowed: Boolean(payload.downloadAllowed && hasFullWorkspace),
        cloudSaved: Boolean(payload.cloudSaved && hasFullWorkspace),
        storageBackend: payload.storageBackend || ''
      });
      if (payload.user) onProfileChange(payload.user);
    } catch {
      setState({ status: 'error', image: '', message: t.failed, generationId: '', downloadAllowed: false, cloudSaved: false, storageBackend: '' });
    }
  }

  const isGenerating = state.status === 'generating';

  return (
    <section className="createWorkspaceSection" id="create">
      <div className="createWorkspaceModeSwitch" role="tablist" aria-label={language === 'zh' ? '创作模式' : 'Creation mode'}>
        <button className={workspaceMode === 'ecommerce' ? 'active' : ''} type="button" onClick={() => setWorkspaceMode('ecommerce')}>
          <Layers3 size={16} />
          {t.ecommerceMode}
        </button>
        <button className={workspaceMode === 'single' ? 'active' : ''} type="button" onClick={() => setWorkspaceMode('single')}>
          <WandSparkles size={16} />
          {t.freeMode}
        </button>
      </div>

      {workspaceMode === 'ecommerce' ? (
        <EcommerceWorkspace
          language={language}
          session={session}
          profile={profile}
          onSignIn={onSignIn}
          onBilling={onBilling}
          onProfileChange={onProfileChange}
        />
      ) : (
        <>
      <div className="createWorkspaceIntro">
        <span className="eyebrow"><Sparkles size={15} /> {t.eyebrow}</span>
        <h2>{t.title}</h2>
        <p>{t.subtitle}</p>
      </div>

      <div className="createWorkspaceGrid">
        <form className="createWorkspaceForm" onSubmit={handleSubmit}>
          <label className="createFieldLabel" htmlFor="create-prompt">{t.promptLabel}</label>
          <textarea
            id="create-prompt"
            className="createPromptInput"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t.placeholder}
            maxLength={6000}
            disabled={isGenerating}
          />

          <div className="createControls">
            <label className="createSelectLabel" htmlFor="create-size">
              <span>{t.sizeLabel}</span>
            <select id="create-size" value={size} onChange={(event) => setSize(event.target.value)} disabled={isGenerating || !hasFullWorkspace}>
                <option value="1024x1024">{t.sizeSquare}</option>
                <option value="1024x1536">{t.sizePortrait}</option>
                <option value="1536x1024">{t.sizeLandscape}</option>
              </select>
            </label>
            {hasFullWorkspace ? (
              <label className="createSelectLabel" htmlFor="create-quality">
                <span>{t.qualityLabel}</span>
                <select id="create-quality" value={quality} onChange={(event) => setQuality(event.target.value)} disabled={isGenerating}>
                  <option value="low">{t.qualityLow}</option>
                  <option value="medium">{t.qualityMedium}</option>
                </select>
              </label>
            ) : null}
            <span className="createCreditNote">{hasFullWorkspace ? t.fullModeNote : t.guestModeNote}</span>
          </div>

          <button className="createSubmitButton" type="submit" disabled={isGenerating}>
            {isGenerating ? <LoaderCircle size={17} className="spin" /> : <ImagePlus size={17} />}
            {isGenerating
              ? t.generating
              : isGuest
                ? guestUsed ? t.signInForFull : t.generateGuest
                : hasFullWorkspace ? t.generate : t.creditRequired}
          </button>

          {!isSignedIn ? <p className="createAuthHint">{t.signInHint}</p> : null}
          {isSignedIn && !hasFullWorkspace ? <p className="createAuthHint">{t.creditRequired}</p> : null}
          {state.message ? <p className="createErrorMessage">{state.message}</p> : null}
        </form>

        <div className="createResultPanel">
          {state.image ? (
            <>
              <img
                className="createResultImage"
                src={state.image}
                alt={prompt || 'Generated image'}
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onContextMenu={(event) => {
                  if (!state.downloadAllowed) event.preventDefault();
                }}
              />
              {state.downloadAllowed ? (
                <>
                  <a className="createDownloadButton" href={state.image} download={`gpt-image-${state.generationId || 'result'}.png`}>
                    <Download size={16} />
                    {t.download}
                  </a>
                  <p className="createStorageNote">
                    {state.storageBackend === 'local-disk' ? t.localSaved : state.cloudSaved ? t.cloudSaved : t.cloudSaveUnavailable}
                  </p>
                </>
              ) : (
                <p className="createGuestResultNote">{t.guestDownloadNote}</p>
              )}
            </>
          ) : (
            <div className="createResultEmpty">
              <ImagePlus size={28} />
              <span>{t.subtitle}</span>
            </div>
          )}
        </div>
      </div>

      <div className="createHistory">
        <div className="createHistoryHeader">
          <h3>{t.history}</h3>
          {hasFullWorkspace && profile ? <span>{profile.creditBalance || 0} credits</span> : null}
        </div>
        {hasFullWorkspace && visibleHistory.length ? (
          <div className="createHistoryGrid">
            {visibleHistory.map((item) => (
              <article className="createHistoryCard" key={item.id}>
                <img src={item.imageUrl} alt={item.prompt} loading="lazy" />
                <p>{item.prompt}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="createHistoryEmpty">{t.noHistory}</p>
        )}
      </div>

      <div className="createCaseLibrary">
        <div className="createCaseLibraryHeader">
          <div>
            <h3>{t.caseLibraryTitle}</h3>
            <p>{t.caseLibrarySubtitle}</p>
          </div>
          <button type="button" onClick={onBrowseCases}>
            {t.browseCases}
          </button>
        </div>
        <div className="createQuickFilters" role="tablist" aria-label={t.caseLibraryTitle}>
          <button
            className={category === 'All' ? 'active' : ''}
            type="button"
            onClick={() => onCategoryChange?.('All')}
          >
            {t.caseLibraryAll}
          </button>
          {categoryOptions.map((option) => (
            <button
              className={category === option.value ? 'active' : ''}
              type="button"
              onClick={() => onCategoryChange?.(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        {cases.length ? (
          <div className="createCaseGrid">
            {cases.map((item) => (
              <button className="createCaseCard" type="button" onClick={() => onOpenCase?.(item)} key={item.id}>
                <img src={item.image} alt={item.imageAlt || item.title} loading="lazy" />
                <span>{categoryLabels.get(item.category) || item.category}</span>
                <strong>{item.title}</strong>
                <em>
                  <Eye size={14} />
                  {t.openCase}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <p className="createCaseLibraryEmpty">{t.caseLibraryEmpty}</p>
        )}
      </div>
        </>
      )}
    </section>
  );
}
