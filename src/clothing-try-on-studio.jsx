import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, ImagePlus, ListTodo, LoaderCircle, LockKeyhole, Maximize2, Plus, Shirt, Trash2, Upload, UserRound, X } from 'lucide-react';
import { MODEL_BACKGROUNDS, SYSTEM_TRY_ON_MODELS, TRY_ON_REFERENCE_ORDER, buildClothingTryOnPrompt, buildModelPhotoPrompt, isModelPhotoProvider } from '../shared/clothing-try-on.js';
import { getImageModelConstraints, validateImageReferenceInputsForModel, validateImageSizeForModel } from '../shared/image-generation.js';
import FreeImageSettings from './free-image-settings.jsx';
import { ImageCreditPrice, useImagePricingAccess, useServerImagePricing } from './image-pricing-client.jsx';
import { fetchImageGeneration, isImageGenerationTimeout } from './image-generation-client.js';
import { MAX_ACTIVE_IMAGE_TASKS } from './image-task-list.js';
import ImageStudioFeedback from './image-studio-feedback.jsx';
import './clothing-try-on-studio.css';

const artworkUrls = import.meta.glob('./assets/try-on-models/generated/*.webp', { eager: true, query: '?url', import: 'default' });
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const INITIAL_DEFINITION = { name: '', gender: 'female', age: 30, build: 'average', appearance: '', pose: '', backgroundId: 'champagne' };
const isActive = task => ['queued', 'running', 'cancelling'].includes(task.status);

async function apiJson(url, body, method = 'POST') {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error || 'REQUEST_FAILED'), { code: payload.error, status: response.status });
  return payload;
}

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.readAsDataURL(blob);
  });
}

async function readPhoto(file) {
  if (!file || !IMAGE_MIMES.includes(file.type)) throw new Error('INVALID_REFERENCE_IMAGE_FORMAT');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('REFERENCE_IMAGE_TOO_LARGE');
  const imageDataUrl = await dataUrl(file);
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('INVALID_REFERENCE_IMAGE_FORMAT')); image.src = imageDataUrl; });
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('REFERENCE_IMAGE_TOO_LARGE');
  return { name: file.name || '衣服参考图', imageDataUrl, imageUrl: imageDataUrl, mimeType: file.type, width: image.naturalWidth, height: image.naturalHeight };
}

function normalizeResults(payload, prompt) {
  return (payload.images || []).map((item, index) => ({
    id: item.generationId || `try-on-${Date.now()}-${index}`, generationId: item.generationId,
    imageUrl: item.image, thumbnailUrl: item.thumbnailUrl || item.image, mimeType: item.contentType || 'image/png',
    size: item.size, quality: item.quality, prompt, status: 'succeeded', downloadAllowed: item.downloadAllowed,
    createdAt: new Date().toISOString(), creditsCharged: item.creditsCharged,
  })).filter(item => item.imageUrl);
}

function StudioModal({ title, onClose, busy, children, wide = false }) {
  const dialogRef = useRef(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialog?.querySelector('button:not(:disabled), input:not(:disabled)')?.focus());
    const keyboard = event => {
      if (event.key === 'Escape' && !latest.current.busy) { event.preventDefault(); latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')].filter(item => item.getClientRects().length);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    dialog.addEventListener('keydown', keyboard);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previousOverflow; dialog.removeEventListener('keydown', keyboard); previous?.focus?.(); };
  }, []);
  return <div className="tryOnModalBackdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className={`tryOnModal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="try-on-modal-title" tabIndex={-1} ref={dialogRef}>
      <header><h3 id="try-on-modal-title">{title}</h3><button type="button" onClick={onClose} disabled={busy} aria-label="关闭 / Close"><X size={18} /></button></header>
      {children}
    </section>
  </div>;
}

export default function ClothingTryOnStudio({ language = 'zh', visible, session, profile, providers = [], imageSettings,
  tasks = [], activeQueueTaskCount = 0, onSignIn, onBilling, onOpenPreview, onOpenTasks, onTasksQueued, onProfileChange, onGenerated }) {
  const zh = language === 'zh';
  const say = (cn, en) => zh ? cn : en;
  const signedIn = Boolean(session?.user || session?.access_token);
  const userKey = String(profile?.id || session?.user?.id || '');
  const [selectedId, setSelectedId] = useState(SYSTEM_TRY_ON_MODELS[0].id);
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [source, setSource] = useState('system');
  const [gender, setGender] = useState('all');
  const [garment, setGarment] = useState(null);
  const [garmentType, setGarmentType] = useState('auto');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState({ text: '', error: false });
  const [results, setResults] = useState([]);
  const [activeResultId, setActiveResultId] = useState('');
  const [modal, setModal] = useState('');
  const [definition, setDefinition] = useState(INITIAL_DEFINITION);
  const [definitionMode, setDefinitionMode] = useState('generate');
  const [modelUpload, setModelUpload] = useState(null);
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [modelProviderId, setModelProviderId] = useState('');
  const [pendingModelSave, setPendingModelSave] = useState(null);
  const [library, setLibrary] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const garmentInput = useRef(null);
  const modelInput = useRef(null);
  const submissionLock = useRef(false);
  const mounted = useRef(true);
  const currentUser = useRef(userKey);
  currentUser.current = userKey;
  const systemReferenceCache = useRef(new Map());
  const privateLoadSequence = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    privateLoadSequence.current += 1;
    setModels([]); setResults([]); setGarment(null); setSelectedId(SYSTEM_TRY_ON_MODELS[0].id);
    setSource('system'); setModal(''); setModelUpload(null); setPendingModelSave(null); setAdultConfirmed(false);
  }, [userKey]);

  const photoProviders = providers.filter(item => isModelPhotoProvider(item.model));
  useEffect(() => {
    if (!photoProviders.some(item => item.id === modelProviderId)) setModelProviderId(photoProviders[0]?.id || '');
  }, [providers, modelProviderId]);
  const provider = providers.find(item => item.id === imageSettings.providerId);
  const modelProvider = photoProviders.find(item => item.id === modelProviderId);
  const systemModels = SYSTEM_TRY_ON_MODELS.map(item => ({ ...item, source: 'system', adultConfirmed: true,
    imageUrl: artworkUrls[`./assets/try-on-models/generated/${item.artwork}`] || '',
    thumbnailUrl: artworkUrls[`./assets/try-on-models/generated/${item.artwork}`] || '', mimeType: 'image/webp' }));
  const allModels = [...systemModels, ...models];
  const selectedModel = allModels.find(item => item.id === selectedId);
  const visibleModels = (source === 'system' ? systemModels : models).filter(item => gender === 'all' || item.gender === gender);
  const workflow = { kind: 'clothing-try-on', referenceOrder: TRY_ON_REFERENCE_ORDER, adultConfirmed: true, modelId: selectedModel?.id || '',
    modelSource: selectedModel?.source || 'system', modelName: selectedModel?.name || '', garmentName: garment?.name || '', garmentType, notes };
  const prompt = buildClothingTryOnPrompt(workflow);
  const referenceCheck = validateImageReferenceInputsForModel({ model: provider?.model || '', count: 2,
    mimeTypes: [garment?.mimeType, selectedModel?.mimeType].filter(Boolean) });
  const sizeCheck = validateImageSizeForModel(imageSettings.size, provider?.model);
  const inputsReady = Boolean(selectedModel?.imageUrl && garment);
  const { skipImagePricing, showImagePricing, requestImagePricing } = useImagePricingAccess();
  const quoteOptions = { providerId: provider?.id || '', size: imageSettings.size, quality: imageSettings.quality, prompt, referenceCount: 2, chargeTextTokens: provider?.chargeTextTokens };
  const quote = useServerImagePricing(quoteOptions, { enabled: Boolean(visible && signedIn && provider && referenceCheck.valid && sizeCheck.valid) });
  let modelPrompt = '';
  try { modelPrompt = buildModelPhotoPrompt(definition); } catch { /* Invalid form is checked before submitting. */ }
  const modelSizeCheck = validateImageSizeForModel(imageSettings.size, modelProvider?.model);
  const modelQuoteOptions = { providerId: modelProvider?.id || '', size: imageSettings.size, quality: 'low', prompt: modelPrompt, referenceCount: 0, chargeTextTokens: modelProvider?.chargeTextTokens };
  const modelQuote = useServerImagePricing(modelQuoteOptions, { enabled: Boolean(modal === 'model' && definitionMode === 'generate' && signedIn && modelProvider && modelPrompt && modelSizeCheck.valid) });
  const tryOnTasks = tasks.filter(task => task.studioWorkflow?.kind === 'clothing-try-on');
  const failedTryOnTasks = tryOnTasks.filter(task => task.status === 'failed');
  const completedModelsKey = tasks.filter(task => task.studioWorkflow?.kind === 'model-creation' && task.status === 'completed').map(task => task.id).join('|');
  const combinedResults = useMemo(() => {
    const seen = new Set();
    return [...results, ...tryOnTasks.flatMap(task => task.results || [])].filter(item => !seen.has(item.id) && seen.add(item.id));
  }, [results, tasks]);
  const activeResult = combinedResults.find(item => item.id === activeResultId) || combinedResults[0];
  const disabled = Boolean(busy || imageSettings.isGenerating);

  function errorText(error) {
    const code = error?.code || error?.message || '';
    if (['CREDITS_REQUIRED', 'GROUP_BALANCE_REQUIRED', 'GROUP_BUDGET_REQUIRED'].includes(code)) return say('积分不足，请先充值。', 'Insufficient credits. Add credits first.');
    if (['TASK_ACTIVE_LIMIT', 'TASK_LIST_FULL'].includes(code)) return say('生成队列已满，请先完成现有任务。', 'The generation queue is full.');
    if (code === 'MODEL_LOW_QUALITY_REQUIRED') return say('模特照片只能使用 Low，不能生成 Medium / High。', 'Model photos are restricted to Low quality.');
    if (code === 'MODEL_IMAGE_25_REQUIRED') return say('创建模特必须使用 image2.5。', 'Model creation requires image2.5.');
    if (code === 'REFERENCE_IMAGE_TOO_LARGE') return say('单张图片不得超过 10 MB 或 4000 万像素。', 'Photos must be under 10 MB and 40 megapixels.');
    if (code === 'INVALID_REFERENCE_IMAGE_FORMAT') return say('请选择可读取的 JPG、PNG 或 WebP 图片。', 'Choose a valid JPG, PNG or WebP photo.');
    if (['ADULT_MODEL_REQUIRED', 'ADULT_MODEL_CONFIRMATION_REQUIRED'].includes(code)) return say('仅支持成年人模特；请确认照片授权，年龄必须为 18–80 岁。', 'Adult models only. Confirm authorization and use an age of 18–80.');
    if (code === 'TRY_ON_MODEL_NOT_FOUND') return say('该私有模特不可用，请重新选择或上传。', 'This private model is unavailable. Select or upload another.');
    if (isImageGenerationTimeout(error)) return say('请求超时，生成可能仍在进行。请先检查生成历史，勿重复提交以免重复计费。', 'Request timed out. Check generation history before retrying to avoid duplicate charges.');
    if (error?.status === 401) return say('登录已过期，请重新登录。', 'Your session expired. Sign in again.');
    if (code === 'PRICING_LOAD_FAILED') return say('无法确认费用，尚未提交生成。请稍后重试。', 'Unable to confirm the price. Generation was not submitted.');
    return say('操作未完成，请稍后重试；已生成的图片可在生成历史中查看。', 'The operation did not complete. Check history for any generated images.');
  }
  const reportError = error => { if (mounted.current) setNotice({ text: errorText(error), error: true }); };

  async function loadModels() {
    if (!signedIn) return;
    const sequence = ++privateLoadSequence.current;
    const identity = currentUser.current;
    setModelsLoading(true);
    try {
      const payload = await apiJson('/api/try-on-models', undefined, 'GET');
      if (mounted.current && currentUser.current === identity && sequence === privateLoadSequence.current) setModels(payload.models || []);
    } catch (error) { if (sequence === privateLoadSequence.current && currentUser.current === identity) reportError(error); }
    finally { if (mounted.current && sequence === privateLoadSequence.current) setModelsLoading(false); }
  }
  useEffect(() => { if (visible && signedIn) void loadModels(); }, [visible, signedIn, userKey, completedModelsKey]);

  async function addGarment(file) {
    if (disabled || submissionLock.current) return;
    const identity = currentUser.current;
    try { const photo = await readPhoto(file); if (identity === currentUser.current && mounted.current) { setGarment(photo); setNotice({ text: '', error: false }); } } catch (error) { if (identity === currentUser.current) reportError(error); }
    if (garmentInput.current) garmentInput.current.value = '';
  }

  async function modelReference(model) {
    if (model.source === 'custom') return { assetId: model.id };
    if (!systemReferenceCache.current.has(model.id)) {
      const response = await fetch(model.imageUrl);
      if (!response.ok) throw new Error('MODEL_PHOTO_UNAVAILABLE');
      systemReferenceCache.current.set(model.id, { imageDataUrl: await dataUrl(await response.blob()) });
    }
    return systemReferenceCache.current.get(model.id);
  }

  async function confirmedQuote(options, count) {
    if (skipImagePricing) return;
    const pricing = await requestImagePricing(options);
    if (pricing.source !== 'server' || !Number.isFinite(Number(pricing.credits))) throw new Error('PRICING_LOAD_FAILED');
    if (!profile?.isSuperAdmin && Number(profile?.creditBalance || 0) < Number(pricing.credits) * count) {
      onBilling?.(); throw new Error('CREDITS_REQUIRED');
    }
    return pricing;
  }

  async function submitTryOn(mode) {
    if (submissionLock.current || disabled) return;
    if (!signedIn) { onSignIn?.(); return; }
    if (!inputsReady) { setNotice({ text: say('请添加衣服照片，并选择一位模特。', 'Add a garment photo and select a model first.'), error: true }); return; }
    if (!provider || !referenceCheck.valid || !sizeCheck.valid) { setNotice({ text: say('当前服务不支持两张参考图或此尺寸，请调整生图设置。', 'Choose a service supporting two references and the output size.'), error: true }); return; }
    if (mode === 'queue' && activeQueueTaskCount >= MAX_ACTIVE_IMAGE_TASKS) { reportError(new Error('TASK_ACTIVE_LIMIT')); return; }
    submissionLock.current = true; setBusy(mode); setNotice({ text: '', error: false });
    const identity = currentUser.current;
    const request = { prompt, size: imageSettings.size, quality: imageSettings.quality, count: imageSettings.count,
      providerId: provider.id, taskMode: 'single', clientTaskId: `try-on-${crypto.randomUUID()}`, studioWorkflow: { ...workflow } };
    try {
      await confirmedQuote(quoteOptions, request.count);
      request.references = [garment.assetId ? { assetId: garment.assetId } : { imageDataUrl: garment.imageDataUrl }, await modelReference(selectedModel)];
      if (identity !== currentUser.current) return;
      if (mode === 'queue') {
        const payload = await apiJson('/api/generation-tasks', request);
        if (identity !== currentUser.current) return;
        onTasksQueued?.([payload.task]);
        setNotice({ text: say('已加入队列，模特和衣服已锁定；可继续制作下一张。', 'Queued with a snapshot of the model and garment. You can prepare the next photo.'), error: false });
      } else {
        const response = await fetchImageGeneration('/api/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error || 'GENERATION_FAILED'), { status: response.status });
        if (identity !== currentUser.current) return;
        const items = normalizeResults(payload, prompt);
        setResults(current => [...items, ...current].slice(0, 40)); setActiveResultId(items[0]?.id || '');
        onGenerated?.(items);
        if (payload.user) onProfileChange?.(payload.user);
        setNotice({ text: payload.partial ? say('部分图片已生成，失败图片不会扣生成费用。', 'Some photos completed. Failed photos are not charged.') : say('换装照已生成，并保存到生成历史。', 'Try-on photos generated and saved to history.'), error: Boolean(payload.partial) });
      }
    } catch (error) { if (identity === currentUser.current) reportError(error); }
    finally { submissionLock.current = false; if (mounted.current) setBusy(''); }
  }

  function openModelModal() {
    if (!signedIn) { onSignIn?.(); return; }
    setDefinition(INITIAL_DEFINITION); setModelUpload(null); setAdultConfirmed(false); setPendingModelSave(null);
    setDefinitionMode('generate'); setNotice({ text: '', error: false }); setModal('model');
  }

  function selectPrivateModel(model) {
    setModels(current => [model, ...current.filter(item => item.id !== model.id)]);
    setSelectedId(model.id); setSource('custom'); setGender('all'); setModal(''); setPendingModelSave(null);
  }

  async function submitModel(mode) {
    if (submissionLock.current || disabled) return;
    if (!signedIn) { onSignIn?.(); return; }
    if (!adultConfirmed) { reportError(new Error('ADULT_MODEL_CONFIRMATION_REQUIRED')); return; }
    const snapshot = { ...definition };
    const identity = currentUser.current;
    try { buildModelPhotoPrompt(snapshot); } catch (error) { reportError(error); return; }
    if (definitionMode === 'generate' && !pendingModelSave && (!modelProvider || !modelSizeCheck.valid)) {
      setNotice({ text: say('请选择 image2.5 服务与有效尺寸。', 'Select an image2.5 service and valid dimensions.'), error: true }); return;
    }
    if (definitionMode === 'upload' && !modelUpload) { setNotice({ text: say('请先上传一张有授权的成年模特照片。', 'Upload an authorized adult model photo first.'), error: true }); return; }
    if (mode === 'queue' && activeQueueTaskCount >= MAX_ACTIVE_IMAGE_TASKS) { reportError(new Error('TASK_ACTIVE_LIMIT')); return; }
    submissionLock.current = true; setBusy(`model-${mode}`); setNotice({ text: '', error: false });
    try {
      if (pendingModelSave) {
        const payload = await apiJson('/api/try-on-models', pendingModelSave);
        if (identity === currentUser.current) selectPrivateModel(payload.model);
      } else if (definitionMode === 'upload') {
        const payload = await apiJson('/api/try-on-models', { imageDataUrl: modelUpload.imageDataUrl, definition: snapshot, adultConfirmed: true });
        if (identity === currentUser.current) selectPrivateModel(payload.model);
      } else {
        await confirmedQuote(modelQuoteOptions, 1);
        if (identity !== currentUser.current || !mounted.current) return;
        const request = { prompt: buildModelPhotoPrompt(snapshot), providerId: modelProvider.id, quality: 'low', count: 1,
          size: imageSettings.size, references: [], taskMode: 'single', clientTaskId: `model-low-${crypto.randomUUID()}`,
          studioWorkflow: { kind: 'model-creation', definition: snapshot } };
        if (mode === 'queue') {
          const payload = await apiJson('/api/generation-tasks', request);
          if (identity !== currentUser.current) return;
          onTasksQueued?.([payload.task]); setModal('');
          setNotice({ text: say('Low 模特已排队，完成后自动加入「我的模特」。', 'Low model photo queued. It will be saved to My models when completed.'), error: false });
        } else {
          const response = await fetchImageGeneration('/api/generate-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.error || 'GENERATION_FAILED'), { status: response.status });
          if (identity !== currentUser.current) return;
          if (payload.user) onProfileChange?.(payload.user);
          if (payload.createdModel) selectPrivateModel(payload.createdModel);
          else {
            const saveRequest = { generationId: payload.images[0].generationId, definition: snapshot };
            setPendingModelSave(saveRequest);
            const saved = await apiJson('/api/try-on-models', saveRequest);
            if (identity === currentUser.current && mounted.current) selectPrivateModel(saved.model);
          }
        }
      }
    } catch (error) { if (identity === currentUser.current) reportError(error); }
    finally { submissionLock.current = false; if (mounted.current) setBusy(''); }
  }

  async function openLibrary() {
    if (!signedIn) { onSignIn?.(); return; }
    setModal('library'); setLibraryLoading(true);
    const identity = currentUser.current;
    try { const payload = await apiJson('/api/assets?mediaType=image&limit=100&sort=recent', undefined, 'GET'); if (identity === currentUser.current) setLibrary(payload.assets || []); }
    catch (error) { if (identity === currentUser.current) reportError(error); }
    finally { if (mounted.current && identity === currentUser.current) setLibraryLoading(false); }
  }

  async function removeModel(model) {
    if (disabled) return;
    const identity = currentUser.current;
    try {
      await apiJson('/api/try-on-models', { modelId: model.id }, 'DELETE');
      if (identity !== currentUser.current || !mounted.current) return;
      setModels(current => current.filter(item => item.id !== model.id));
      if (selectedId === model.id) setSelectedId(SYSTEM_TRY_ON_MODELS[0].id);
      setNotice({ text: say('已从模特库移除，原照片仍保留在资源库。', 'Removed from the model picker. The source photo remains in your library.'), error: false });
    } catch (error) { reportError(error); }
  }

  const closeModal = () => { if (!busy) setModal(''); };
  const modelQuoteBlocked = !skipImagePricing && (modelQuote.loading || !modelQuote.pricing);
  const submitDisabled = disabled || (signedIn && (!inputsReady || !provider || !referenceCheck.valid || !sizeCheck.valid || (!skipImagePricing && (quote.loading || !quote.pricing))));

  return <section className="tryOnStudio" aria-label={say('衣服换装工作台', 'Clothing try-on studio')}>
    <div className="freeImageMainGrid tryOnMainGrid" inert={modal ? true : undefined}>
      <form className="freeImageComposer" onSubmit={event => { event.preventDefault(); void submitTryOn('immediate'); }}>
        <div className="studioComposerBody">
          <div className="tryOnIntro"><h3><Shirt size={17} />{say('衣服换装', 'Clothing try-on')}</h3><p>{say('添加衣服原图，选一位模特，生成自然合身的电商换装照。', 'Add a garment photo and choose a model for a natural ecommerce try-on.')}</p></div>
          <section className="tryOnReferenceSection">
            <header className="tryOnSectionHeading"><strong>{say('衣服 + 模特', 'Garment + model')}</strong><small>{say('两张参考图，固定顺序', 'Two references, fixed order')}</small></header>
            <div className="tryOnReferencePair">
              <div className={`tryOnReferenceSlot garment ${garment ? 'filled' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void addGarment(event.dataTransfer.files[0]); }} onPaste={event => { const file = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file')?.getAsFile(); if (file) { event.preventDefault(); void addGarment(file); } }} tabIndex={0} aria-label={say('衣服参考图1，可拖入或粘贴', 'Garment reference 1, drop or paste a photo')}>
                <span className="tryOnSlotLabel">01 · {say('衣服', 'Garment')}</span>
                <button type="button" className="tryOnGarmentUpload" onClick={() => garmentInput.current?.click()} disabled={disabled}>{garment ? <img src={garment.imageUrl} alt={garment.name} /> : <><Upload size={23} /><span>{say('上传衣服照片', 'Upload garment')}</span><small>{say('支持拖入 / 粘贴', 'Drop or paste supported')}</small></>}</button>
                {garment && <button className="tryOnRemoveReference" type="button" onClick={() => setGarment(null)} disabled={disabled} aria-label={say('移除衣服照片', 'Remove garment photo')}><X size={13} /></button>}
                {garment && <small title={garment.name}>{garment.name}</small>}
              </div>
              <span className="tryOnReferencePlus" aria-hidden="true"><Plus size={16} /></span>
              <div className="tryOnReferenceSlot model" aria-label={say('模特参考图2', 'Model reference 2')}><span className="tryOnSlotLabel">02 · {say('模特', 'Model')}</span>{selectedModel?.imageUrl ? <img src={selectedModel.imageUrl} alt={selectedModel.name} /> : <UserRound size={28} />}<small>{selectedModel ? (zh ? selectedModel.name : selectedModel.nameEn || selectedModel.name) : say('请选择模特', 'Choose a model')}</small></div>
            </div>
            <input ref={garmentInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void addGarment(event.target.files[0])} />
            <div className="tryOnReferenceActions"><span>JPG / PNG / WebP · ≤ 10 MB</span><button type="button" onClick={() => void openLibrary()} disabled={disabled}><ImagePlus size={13} />{say('从资源库选择衣服', 'Choose garment from library')}</button></div>
            <p className="tryOnIdentityLock"><LockKeyhole size={13} />{say('参考图1还原衣服；参考图2保留模特长相、体型、姿势和背景。', 'Reference 1 locks garment design; reference 2 preserves model identity, body, pose and background.')}</p>
          </section>
          <div className="tryOnStylingFields"><label><span>{say('换装部位', 'Garment scope')}</span><select value={garmentType} onChange={event => setGarmentType(event.target.value)} disabled={disabled}>{[['auto', '自动识别', 'Auto detect'], ['top', '上衣', 'Top'], ['bottom', '下装', 'Bottom'], ['outerwear', '外套', 'Outerwear'], ['dress', '连衣裙', 'Dress'], ['outfit', '整套服装', 'Complete outfit']].map(([value, cn, en]) => <option key={value} value={value}>{say(cn, en)}</option>)}</select></label><label><span>{say('补充要求（可选）', 'Additional instructions (optional)')}</span><textarea rows={2} maxLength={1200} value={notes} onChange={event => setNotes(event.target.value)} disabled={disabled} placeholder={say('例如：自然展示衣服的垂坠感，不改变背景', 'For example: show natural fabric drape, keep the background')} /></label></div>
          <FreeImageSettings {...imageSettings} language={language} providers={providers} isGenerating={disabled} />
          {provider && !referenceCheck.valid && <p className="tryOnWarning" role="status">{say('当前生图服务不支持两张参考图，请更换服务。', 'This service does not support both references. Select another service.')}</p>}
          {!sizeCheck.valid && <p className="tryOnWarning">{say('当前尺寸不适用于此服务，请调整像素尺寸。', 'Adjust pixel dimensions for this service.')}</p>}
        </div>
        <footer className="studioComposerFooter">
          {notice.text && !modal && <ImageStudioFeedback className="tryOnNotice" tone={notice.error ? 'error' : 'status'}>{notice.text}</ImageStudioFeedback>}
          {quote.error && !modal && !notice.error && <ImageStudioFeedback className="tryOnNotice">{errorText({ code: 'PRICING_LOAD_FAILED' })}</ImageStudioFeedback>}
          <div className="freeImageGenerateActions">
            <button className="freeImageGenerateButton" type="submit" disabled={submitDisabled} aria-busy={busy === 'immediate'}>
              {busy === 'immediate' ? <LoaderCircle size={19} className="spin" /> : <ImagePlus size={19} />}
              <span className="freeImageGenerateLabel">{say(busy === 'immediate' ? '生成中' : signedIn ? '立即生图' : '登录后生图', busy === 'immediate' ? 'Generating' : signedIn ? 'Generate now' : 'Sign in to generate')}</span>
              {signedIn && showImagePricing && (quote.loading || quote.pricing
                ? <ImageCreditPrice pricing={quote.loading ? null : quote.pricing} quantity={imageSettings.count} language={language} compact totalOnly />
                : <span className="imageCreditPrice pending compact">{say('报价暂不可用', 'Quote unavailable')}</span>)}
            </button>
            <button className="freeImageQueueButton" type="button" onClick={() => void submitTryOn('queue')} disabled={submitDisabled || activeQueueTaskCount >= MAX_ACTIVE_IMAGE_TASKS}><ListTodo size={18} />{say('加入队列', 'Add to queue')}</button>
          </div>
          <p className="tryOnCaption">{say('共用生图计费规则 · 实际扣费以服务端结算为准', 'Shared image pricing · final charges settle on the server')}</p>
        </footer>
      </form>
      <section className="tryOnModelShowcase" aria-label={say('模特橱窗', 'Model showcase')}>
        <header className="tryOnSectionHeading tryOnShowcaseHeading"><h3><UserRound size={16} />{say('模特橱窗', 'Model showcase')}</h3><button type="button" onClick={openModelModal} disabled={disabled}><Plus size={14} />{say('自定义模特', 'Custom model')}</button></header>
        <p className="tryOnShowcaseHint">{say('单选一位模特，自动填入参考图2。', 'Choose one model to fill reference 2 automatically.')}</p>
        <div className="tryOnShowcaseSelection" role="status"><span>{say('当前选择', 'Selected model')}</span><strong>{selectedModel ? (zh ? selectedModel.name : selectedModel.nameEn || selectedModel.name) : say('尚未选择', 'None selected')}</strong><small>{say('参考图2', 'Reference 2')}</small></div>
        <div className="tryOnModelFilters"><div role="group" aria-label={say('模特来源', 'Model source')}>
          <button type="button" aria-pressed={source === 'system'} onClick={() => setSource('system')}>{say('系统模特', 'System models')} <small>20</small></button>
          <button type="button" aria-pressed={source === 'custom'} onClick={() => setSource('custom')}>{say('我的模特', 'My models')} <small>{models.length}</small></button>
        </div><select value={gender} onChange={event => setGender(event.target.value)} aria-label={say('模特性别筛选', 'Filter models by gender')}><option value="all">{say('全部', 'All')}</option><option value="female">{say('女模特', 'Women')}</option><option value="male">{say('男模特', 'Men')}</option></select></div>
        <div className="tryOnModelGrid" role="group" aria-label={say('成年模特图库', 'Adult model gallery')}>
          {visibleModels.map(model => <article key={model.id} className={selectedId === model.id ? 'selected' : ''}>
            <button className="tryOnModelCard" type="button" aria-pressed={selectedId === model.id} aria-label={`${zh ? model.name : model.nameEn || model.name} · ${model.age} ${say('岁', 'years')}`} onClick={() => setSelectedId(model.id)} disabled={disabled || !model.imageUrl || model.status === 'failed'}>
              {model.thumbnailUrl ? <img src={model.thumbnailUrl} alt={zh ? model.name : model.nameEn || model.name} loading="lazy" /> : <div className={`tryOnModelPending ${model.status === 'failed' ? 'error' : ''}`}><UserRound size={24} /><small>{model.status === 'failed' ? say('模特照片生成失败', 'Model photo failed') : say('照片准备中', 'Photo pending')}</small></div>}
              <span><strong>{zh ? model.name : model.nameEn || model.name}</strong><small>{model.age} {say('岁', 'years')} · {model.gender === 'female' ? say('女', 'Woman') : say('男', 'Man')}</small></span>
              {selectedId === model.id && <i aria-hidden="true"><Check size={12} /></i>}
            </button>
            {model.source === 'custom' && <button type="button" className="tryOnRemoveModel" onClick={() => void removeModel(model)} disabled={disabled} aria-label={`${say('移除模特', 'Remove model')} ${model.name}`} title={say('仅从模特库移除，保留原照片', 'Remove from picker only; keep source photo')}><Trash2 size={13} /></button>}
          </article>)}
          {!visibleModels.length && <p className="tryOnInlineEmpty">{modelsLoading ? say('正在读取模特…', 'Loading models…') : say('这里还没有模特，可点击「自定义模特」生成或上传。', 'No models here. Generate or upload a custom model.')}</p>}
        </div>
        <footer className="tryOnShowcaseFooter"><small>{say(`显示 ${visibleModels.length} 位 · 可滚动浏览`, `${visibleModels.length} models · scroll to browse`)}</small><p className="tryOnCaption">{say('10 位女模特 + 10 位男模特 · 成年且得体着装 · 使用系统模特不收费', '10 women + 10 men · clothed adults · system model selection is free')}</p></footer>
      </section>
      <section className="freeImageResults studioResultsPanel tryOnResults">
        <header className="tryOnResultsHeader"><strong>{say('换装效果', 'Try-on preview')}</strong><button type="button" onClick={onOpenTasks}><ListTodo size={14} />{say('查看任务', 'View tasks')}{tryOnTasks.filter(isActive).length > 0 && <small>{tryOnTasks.filter(isActive).length}</small>}</button></header>
        {activeResult ? <div className="tryOnResultStage"><button type="button" onClick={() => onOpenPreview?.(activeResult)} className="tryOnResultImage" aria-label={say('放大换装照', 'Expand try-on photo')}><img src={activeResult.imageUrl} alt={say('换装生成结果', 'Generated try-on')} /></button><footer><small>{activeResult.size?.replace('x', ' × ')} · {activeResult.quality}</small><div><button type="button" onClick={() => onOpenPreview?.(activeResult)}><Maximize2 size={14} />{say('放大', 'Expand')}</button>{activeResult.generationId && activeResult.downloadAllowed && <a href={`/api/generated?id=${encodeURIComponent(activeResult.generationId)}&download=1`} download><Download size={14} />{say('下载', 'Download')}</a>}</div></footer></div>
          : <div className="tryOnEmptyPreview"><div className="tryOnPreviewComposition">{selectedModel?.imageUrl ? <img src={selectedModel.imageUrl} alt={say('当前选择的模特参考图，非换装结果', 'Selected model reference, not a try-on result')} /> : <UserRound size={50} />}{garment ? <span><img src={garment.imageUrl} alt={say('衣服参考图', 'Garment reference')} /></span> : <span><Shirt size={26} /></span>}</div><h3>{say('让衣服穿在合适的模特身上', 'Show your garment on the right model')}</h3><p>{say('添加衣服原图，在模特橱窗选择模特，再立即生成或加入队列。', 'Add a garment, choose a model from the showcase, then generate or queue.')}</p><small>{say('当前展示为模特参考照片，不是换装结果', 'Shown: model reference photo, not a try-on result')}</small></div>}
        {combinedResults.length > 0 && <div className="tryOnResultRail">{combinedResults.slice(0, 30).map(item => <button type="button" key={item.id} aria-label={say('选择换装结果', 'Select try-on result')} aria-pressed={item.id === activeResult?.id} onClick={() => setActiveResultId(item.id)}><img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" /></button>)}</div>}
        {tryOnTasks.some(isActive) && <div className="tryOnQueueStatus" role="status"><LoaderCircle size={14} className="spin" />{say(`${tryOnTasks.filter(isActive).length} 个换装任务在队列中`, `${tryOnTasks.filter(isActive).length} try-on tasks in queue`)}<button type="button" onClick={onOpenTasks}>{say('管理 / 取消', 'Manage / cancel')}</button></div>}
        {failedTryOnTasks.length > 0 && <div className="tryOnQueueFailure"><ImageStudioFeedback>{say(`${failedTryOnTasks.length} 个换装任务生成失败，请在任务列表查看原因或重做。`, `${failedTryOnTasks.length} try-on tasks failed. Check the task list for details or redo.`)}<button type="button" onClick={onOpenTasks}>{say('查看任务', 'View tasks')}</button></ImageStudioFeedback></div>}
      </section>
    </div>
    {modal === 'model' && <StudioModal title={say('自定义成年模特', 'Custom adult model')} onClose={closeModal} busy={Boolean(busy)} wide>
      <div className="tryOnModalBody">
        <div className="tryOnModalModes" role="group" aria-label={say('创建模特方式', 'Model creation method')}><button type="button" aria-pressed={definitionMode === 'generate'} disabled={disabled || Boolean(pendingModelSave)} onClick={() => setDefinitionMode('generate')}><UserRound size={15} />{say('AI 创建模特', 'Generate model')}</button><button type="button" aria-pressed={definitionMode === 'upload'} disabled={disabled || Boolean(pendingModelSave)} onClick={() => setDefinitionMode('upload')}><Upload size={15} />{say('上传自己的模特', 'Upload your model')}</button></div>
        <p className="tryOnIdentityLock"><LockKeyhole size={14} />{say('仅支持有授权的成年人照片。AI 模特固定 image2.5 · Low；不生成 High。', 'Authorized adult photos only. Generated models are fixed to image2.5 · Low, never High.')}</p>
        <div className="tryOnDefinitionGrid"><label><span>{say('模特名称', 'Model name')}</span><input maxLength={60} value={definition.name} disabled={disabled || Boolean(pendingModelSave)} onChange={event => setDefinition(current => ({ ...current, name: event.target.value }))} placeholder={say('例如：暖灰通勤女模特', 'For example: warm-gray tailored model')} /></label><label><span>{say('性别', 'Gender')}</span><select value={definition.gender} disabled={disabled || Boolean(pendingModelSave)} onChange={event => setDefinition(current => ({ ...current, gender: event.target.value }))}><option value="female">{say('成年女模特', 'Adult woman')}</option><option value="male">{say('成年男模特', 'Adult man')}</option></select></label><label><span>{say('年龄', 'Age')}</span><input type="number" min={18} max={80} step={1} value={definition.age} disabled={disabled || Boolean(pendingModelSave)} onChange={event => setDefinition(current => ({ ...current, age: event.target.value === '' ? '' : Number(event.target.value) }))} /></label><label><span>{say('体型', 'Body build')}</span><select value={definition.build} disabled={disabled || Boolean(pendingModelSave)} onChange={event => setDefinition(current => ({ ...current, build: event.target.value }))}>{[['average', '匀称', 'Average'], ['slim', '纤细', 'Slim'], ['athletic', '运动', 'Athletic'], ['curvy', '丰盈', 'Curvy'], ['plus-size', '大码', 'Plus-size'], ['tall', '高挑', 'Tall']].map(([value, cn, en]) => <option key={value} value={value}>{say(cn, en)}</option>)}</select></label></div>
        {definitionMode === 'generate' ? <>
          <label className="tryOnModalField"><span>{say('外貌与发型（可选）', 'Appearance and hair (optional)')}</span><input value={definition.appearance} maxLength={200} disabled={disabled || Boolean(pendingModelSave)} onChange={event => setDefinition(current => ({ ...current, appearance: event.target.value }))} placeholder={say('例如：自然肤色、齐肩黑发、温和表情', 'For example: natural complexion, shoulder-length dark hair')} /></label>
          <label className="tryOnModalField"><span>{say('站姿（可选）', 'Pose (optional)')}</span><input value={definition.pose} maxLength={200} disabled={disabled || Boolean(pendingModelSave)} onChange={event => setDefinition(current => ({ ...current, pose: event.target.value }))} placeholder={say('默认全身自然站姿，双手不遮挡衣服', 'Default: full-body natural stance, hands clear of clothing')} /></label>
          <fieldset className="tryOnBackgroundField" disabled={disabled || Boolean(pendingModelSave)}><legend>{say('棚拍背景色', 'Studio background')}</legend><div>{MODEL_BACKGROUNDS.map(background => <button type="button" key={background.id} aria-pressed={definition.backgroundId === background.id} onClick={() => setDefinition(current => ({ ...current, backgroundId: background.id }))}><i style={{ background: background.color }} />{zh ? background.name : background.nameEn}{definition.backgroundId === background.id && <Check size={12} />}</button>)}</div></fieldset>
          <FreeImageSettings {...imageSettings} language={language} providers={photoProviders} providerId={modelProviderId} setProviderId={setModelProviderId} model={modelProvider?.model} modelConstraints={getImageModelConstraints(modelProvider?.model)} quality="low" qualityLocked setQuality={() => {}} hideCount count={1} isGenerating={disabled || Boolean(pendingModelSave)} />
          {!photoProviders.length && <p className="tryOnWarning">{say('尚未配置 image2.5 生图服务，不能创建模特；不会替换为其他模型。', 'No image2.5 service is configured. Model creation will not substitute another model.')}</p>}
        </> : <div className="tryOnModelUpload"><input ref={modelInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={async event => { try { setModelUpload(await readPhoto(event.target.files[0])); } catch (error) { reportError(error); } event.target.value = ''; }} /><button type="button" onClick={() => modelInput.current?.click()} disabled={disabled}>{modelUpload ? <img src={modelUpload.imageUrl} alt={say('上传的成年模特', 'Uploaded adult model')} /> : <><Upload size={26} /><span>{say('上传成年模特照片', 'Upload adult model photo')}</span><small>JPG / PNG / WebP · ≤ 10 MB</small></>}</button><p>{say('原照片的背景会保留；上传和保存不产生生图费用。', 'The original background is preserved. Uploading and saving do not incur generation charges.')}</p></div>}
        <label className="tryOnAdultConfirm"><input type="checkbox" checked={adultConfirmed} disabled={disabled} onChange={event => setAdultConfirmed(event.target.checked)} /><span>{definitionMode === 'upload' ? say('我确认照片中的人已满 18 岁，并且我有权使用此照片。', 'I confirm the person is 18 or older and I have permission to use this photo.') : say('我确认创建的是成年虚构模特，穿着得体、不涉及未成年人。', 'I confirm this is a fictional adult model in appropriate clothing, not a minor.')}</span></label>
        {notice.text && <ImageStudioFeedback className="tryOnNotice" tone={notice.error ? 'error' : 'status'}>{notice.text}</ImageStudioFeedback>}
        {definitionMode === 'generate' && !pendingModelSave && modelQuote.error && !notice.error && <ImageStudioFeedback className="tryOnNotice">{errorText({ code: 'PRICING_LOAD_FAILED' })}</ImageStudioFeedback>}
      </div>
      <footer className="tryOnModalFooter">
        {(pendingModelSave || definitionMode === 'upload') && <div className="tryOnPriceRow"><span>{say('预计费用', 'Estimated cost')}</span><strong>{say('保存不收费', 'Saving is free')}</strong></div>}
        <div className="freeImageGenerateActions">
          <button type="button" className="freeImageGenerateButton" onClick={() => void submitModel('immediate')} disabled={disabled || !adultConfirmed || (definitionMode === 'generate' && !pendingModelSave && (modelQuoteBlocked || !modelSizeCheck.valid || !modelPrompt))} aria-busy={busy === 'model-immediate'}>
            {busy ? <LoaderCircle size={19} className="spin" /> : definitionMode === 'generate' && !pendingModelSave ? <ImagePlus size={19} /> : <UserRound size={19} />}
            <span className="freeImageGenerateLabel">{pendingModelSave ? say('重试保存（不重新生图）', 'Retry save (no regeneration)') : definitionMode === 'upload' ? say('保存我的模特', 'Save my model') : say(busy === 'model-immediate' ? '生成中' : '立即生图', busy === 'model-immediate' ? 'Generating' : 'Generate now')}</span>
            {showImagePricing && definitionMode === 'generate' && !pendingModelSave && (modelQuote.loading || modelQuote.pricing
              ? <ImageCreditPrice pricing={modelQuote.loading ? null : modelQuote.pricing} language={language} compact totalOnly />
              : <span className="imageCreditPrice pending compact">{say('报价暂不可用', 'Quote unavailable')}</span>)}
          </button>
          {definitionMode === 'generate' && !pendingModelSave && <button type="button" className="freeImageQueueButton" onClick={() => void submitModel('queue')} disabled={disabled || !adultConfirmed || modelQuoteBlocked || !modelSizeCheck.valid || activeQueueTaskCount >= MAX_ACTIVE_IMAGE_TASKS}><ListTodo size={18} />{say('加入队列', 'Add to queue')}</button>}
        </div>
      </footer>
    </StudioModal>}
    {modal === 'library' && <StudioModal title={say('选择衣服参考图', 'Choose garment reference')} onClose={closeModal} busy={false} wide><div className="tryOnModalBody"><p className="tryOnCaption">{say('请选择清晰展示衣服的商品图；商品图中的人物不会作为模特身份。', 'Choose a clear garment product photo. Any person in it will not determine the model identity.')}</p><div className="tryOnLibraryGrid">{libraryLoading ? <p>{say('正在加载资源库…', 'Loading library…')}</p> : library.filter(asset => asset.status === 'ready' && IMAGE_MIMES.includes(asset.mimeType)).map(asset => <button type="button" key={asset.id} onClick={() => { setGarment({ assetId: asset.id, name: asset.name, mimeType: asset.mimeType, imageUrl: asset.previewUrl || asset.originalUrl }); setModal(''); }}><img src={asset.thumbnailUrl || asset.originalUrl} alt={asset.name} loading="lazy" /><span>{asset.name}</span></button>)}</div>{!libraryLoading && !library.length && <p>{say('资源库暂无图片，可以直接上传衣服照片。', 'No photos yet. Upload a garment directly.')}</p>}</div></StudioModal>}
  </section>;
}
