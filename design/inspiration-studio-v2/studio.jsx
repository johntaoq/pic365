import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown, ArrowUp, ArrowUpRight, AtSign, Check, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, Copy, Download, FileText, FolderOpen, GripVertical,
  ImagePlus, Images, ListTodo, LoaderCircle, Maximize2, Moon, Palette, Paperclip,
  Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, Square, Sun, Trash2, X,
} from 'lucide-react';
import { createBatchPromptAssignments, parseBatchPromptLines } from '../../shared/batch-image-prompts.js';
import { validateImageSizeForModel } from '../../shared/image-generation.js';
import GenerationSettings from './GenerationSettings.jsx';
import { INITIAL_GENERATION_SETTINGS, settingsContext } from './generation-settings.js';
import './studio.css';

const gallery = [
  { id: 519, title: '薄荷玫瑰香水', category: '商品摄影' },
  { id: 517, title: '夏日冰饮广告', category: '商业广告' },
  { id: 518, title: '花田夏日人像', category: '人像摄影' },
  { id: 515, title: '复古旅行海报', category: '海报设计' },
  { id: 514, title: '现代艺术人像', category: '艺术创作' },
  { id: 373, title: '牛排商业视觉', category: '商品摄影' },
];
const assetUrl = (item) => item.url || `../../data/images/case${item.id}.jpg`;
const promptExample = '一瓶淡绿色香水，木质圆形瓶盖，搭配薄荷玫瑰和亚麻丝带。自然侧光，浅色背景，突出玻璃质感，保留瓶身文字与产品比例。';
const styleItems = [
  { label: '商品摄影', image: gallery[0] }, { label: '商业广告', image: gallery[1] },
  { label: '自然人像', image: gallery[2] }, { label: '复古海报', image: gallery[3] },
  { label: '艺术插画', image: gallery[4] }, { label: '美食摄影', image: gallery[5] },
];
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`pic365.design-v2.${key}`)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(`pic365.design-v2.${key}`, JSON.stringify(value)); } catch {} };
function IconButton({ icon: Icon, label, className = '', ...props }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={17} /></button>;
}
function App() {
  const [theme, setTheme] = useState(() => read('theme', 'light'));
  const [tab, setTab] = useState('single');
  const [prompt, setPrompt] = useState(() => read('prompt', ''));
  const [references, setReferences] = useState([]);
  const [batchImages, setBatchImages] = useState([]);
  const [prompts, setPrompts] = useState(['']);
  const [batchMode, setBatchMode] = useState('paired');
  const [trayOpen, setTrayOpen] = useState(false);
  const [attachmentMenu, setAttachmentMenu] = useState(false);
  const [style, setStyle] = useState('');
  const [dialog, setDialog] = useState(null);
  const [query, setQuery] = useState('');
  const [importText, setImportText] = useState('');
  const [selected, setSelected] = useState(gallery[0]);
  const [previewTab, setPreviewTab] = useState('result');
  const [generationSettings, setGenerationSettings] = useState(INITIAL_GENERATION_SETTINGS);
  const [count, setCount] = useState(1);
  const [preserveSize, setPreserveSize] = useState(true);
  const [panelWidth, setPanelWidth] = useState(() => read('panelWidth', 460));
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState('');
  const [tasks, setTasks] = useState([
    { id: 'sample-1', prompt: promptExample, status: 'completed', image: gallery[0], count: 1 },
    { id: 'sample-2', prompt: '夏日冰饮广告，清透冰块与鲜切水果，明亮自然光。', status: 'completed', image: gallery[1], count: 1 },
    { id: 'sample-3', prompt: '自然光下的花田人像，柔和风感。', status: 'failed', image: gallery[2], count: 1 },
  ]);
  const [taskFilter, setTaskFilter] = useState('all');
  const fileInput = useRef();
  const textFileInput = useRef();
  const promptInput = useRef();
  const splitRef = useRef();
  const timer = useRef();
  const toastTimer = useRef();
  const submitLock = useRef(false);
  const objectUrls = useRef([]);
  const dialogRef = useRef();
  const focusReturn = useRef();
  const sourceTarget = useRef('single');
  const draggingIndex = useRef(-1);
  const uid = useRef(0);
  const batch = tab === 'batch';
  const taskView = tab === 'tasks';
  const images = batch ? batchImages : references;
  const assignments = createBatchPromptAssignments(batchImages, prompts.map(text => ({ text })), batchMode);
  const activePrompts = batchImages.length > 1 && batchMode === 'paired'
    ? Array.from({ length: Math.max(batchImages.length, prompts.length) }, (_, i) => prompts[i] || '')
    : batchImages.length > 1 && batchMode === 'shared' ? prompts.slice(0, 1) : prompts;
  const sizeValid = (batch && batchImages.length > 0 && preserveSize)
    || validateImageSizeForModel(generationSettings.auto ? 'auto' : `${generationSettings.width}x${generationSettings.height}`, settingsContext(generationSettings).service.model).valid;
  const valid = sizeValid && (batch ? assignments.length > 0 && assignments.every(item => item.promptItem?.text.trim()) : !!prompt.trim());
  const outputCount = batch ? assignments.length : count;
  const estimates = (generationSettings.quality === 'high' ? 12 : 6) * outputCount;
  const activeTasks = tasks.filter(item => item.status === 'running').length;

  useEffect(() => { document.documentElement.dataset.theme = theme; write('theme', theme); }, [theme]);
  useEffect(() => { write('prompt', prompt); }, [prompt]);
  useEffect(() => {
    if (!dialog) return;
    focusReturn.current = document.activeElement;
    dialogRef.current.showModal();
    return () => { dialogRef.current?.close(); focusReturn.current?.focus?.(); };
  }, [dialog]);
  useEffect(() => () => {
    clearTimeout(timer.current); clearTimeout(toastTimer.current);
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (splitRef.current.clientWidth > 800) setPanelWidth(current => Math.min(current, Math.max(400, splitRef.current.clientWidth - 380)));
    });
    observer.observe(splitRef.current);
    return () => observer.disconnect();
  }, []);

  function notify(message) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4000); }
  function switchTab(next) { setTab(next); setAttachmentMenu(false); }
  function openDialog(next) { setQuery(''); setAttachmentMenu(false); setDialog(next); }
  function openUpload(target = tab) { sourceTarget.current = target; fileInput.current.click(); setAttachmentMenu(false); }
  function openLibrary(target = tab) { sourceTarget.current = target; openDialog('library'); }
  function addReferences(items, target = tab) {
    const isBatch = target === 'batch';
    const setter = isBatch ? setBatchImages : setReferences;
    const current = isBatch ? batchImages : references;
    const unique = items.filter(item => !current.some(existing => existing.id === item.id));
    const max = isBatch ? 10 : 9;
    if (current.length + unique.length > max) notify(`最多 ${max} 张图片，已保留可添加的部分。`);
    setter(previous => [...previous, ...unique].slice(0, max));
    if (!isBatch) setTrayOpen(true);
    setAttachmentMenu(false);
  }
  function uploadFiles(files, target = tab) {
    const accepted = [];
    let rejected = 0;
    for (const file of Array.from(files || [])) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { rejected++; continue; }
      const url = URL.createObjectURL(file);
      objectUrls.current.push(url);
      accepted.push({ id: `upload-${++uid.current}`, title: file.name, url });
    }
    if (accepted.length) addReferences(accepted, target);
    if (rejected) notify(`${rejected} 个文件未添加：仅支持 JPG、PNG、WebP，每张不超过 15 MB。`);
  }
  function dropImages(event) { event.preventDefault(); setDragOver(false); uploadFiles(event.dataTransfer.files); }
  function setPromptRow(index, value) { setPrompts(current => Array.from({ length: Math.max(current.length, index + 1) }, (_, i) => i === index ? value : current[i] || '')); }
  function movePrompt(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= activePrompts.length) return;
    setPrompts(current => { const result = [...activePrompts]; [result[index], result[next]] = [result[next], result[index]]; return result; });
  }
  function importPrompts(text = importText) {
    const parsed = parseBatchPromptLines(text);
    if (!parsed.lines.length) return notify('请先输入或上传提示词。');
    setPrompts(parsed.lines); setDialog(null); setImportText('');
    notify(`已导入 ${parsed.lines.length} 条提示词${parsed.truncated ? '，超出 10 条的部分未导入' : ''}。`);
  }
  function generate(event, queueOnly = false) {
    event?.preventDefault();
    if (submitLock.current || busy || !valid) return;
    submitLock.current = true; setBusy(true);
    const task = { id: `preview-${++uid.current}`, prompt: batch ? assignments[0].promptItem.text : prompt, status: 'running', image: gallery[0], count: outputCount };
    setTasks(current => [task, ...current]);
    if (queueOnly) notify('预览任务已加入队列，不会调用生图服务。');
    timer.current = setTimeout(() => {
      setTasks(current => current.map(item => item.id === task.id ? { ...item, status: 'completed' } : item));
      setSelected(gallery[0]); setBusy(false); submitLock.current = false;
      notify('交互预览完成，展示项目示例图，未扣积分。');
    }, 1600);
  }
  function startResize(event) {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
  }
  function resize(event) {
    if (event.currentTarget.dataset.dragging !== 'true') return;
    const bounds = splitRef.current.getBoundingClientRect();
    setPanelWidth(Math.max(400, Math.min(bounds.width - 380, event.clientX - bounds.left)));
  }
  function finishResize(event) { event.currentTarget.dataset.dragging = 'false'; write('panelWidth', panelWidth); }
  function referenceTray() {
    if (!trayOpen && !references.length) return null;
    return <section className="attachment-tray" aria-label="附件托盘">
      <div className="master-column"><div className="section-label">母版</div>
        {references[0] ? imageTile(references[0], 0, false) : <button className="upload-master" type="button" onClick={() => openUpload('single')}><ImagePlus size={24} /><span>添加母版</span></button>}
      </div>
      <div className="references-column"><div className="section-label"><span>其他参考图</span><small>{Math.max(0, references.length - 1)}/8</small></div>
        <div className="reference-strip">{references.slice(1).map((item, i) => imageTile(item, i + 1, false))}
          <IconButton icon={Plus} className="add-image" label="添加参考图" onClick={() => setAttachmentMenu(true)} disabled={references.length >= 9} />
        </div>
        <small className="file-limit">JPG / PNG / WebP · 每张 ≤ 15 MB</small>
      </div>
    </section>;
  }
  function imageTile(item, index, isBatch) {
    return <div className="image-tile" key={item.id}>
      <img src={assetUrl(item)} alt={item.title} /><span>{isBatch ? index + 1 : index === 0 ? '母版' : `参考 ${index}`}</span>
      <IconButton icon={X} label={`移除${item.title}`} onClick={() => {
        (isBatch ? setBatchImages : setReferences)(current => current.filter(image => image.id !== item.id));
        if (!isBatch && references.length === 1) setTrayOpen(false);
      }} />
    </div>;
  }
  function settings() {
    return <section className="settings-section">
      <div className="section-heading"><h2><SlidersHorizontal size={16} />生成设置</h2></div>
      <GenerationSettings value={generationSettings} onChange={setGenerationSettings} sourceSize={batch && batchImages.length > 0 && preserveSize} disabled={busy} />
      {batch ? <label className="checkbox-line"><input type="checkbox" checked={preserveSize && !!batchImages.length} disabled={!batchImages.length} onChange={event => setPreserveSize(event.target.checked)} />保留原图尺寸</label>
        : <div className="count-field"><span>生成张数</span><div className="segmented" role="group" aria-label="生成张数">{[1, 2, 3, 4].map(value => <button type="button" key={value} aria-pressed={count === value} className={count === value ? 'active' : ''} onClick={() => setCount(value)}>{value}</button>)}</div></div>}
    </section>;
  }
  return <div className="app">
    <header className="topbar">
      <a className="brand" href="#single" onClick={() => switchTab('single')} aria-label="Pic365 灵感生图"><img src="../../data/images/pic365-logo.png" alt="pic365" /></a>
      <span className="top-divider" /><h1>灵感生图</h1>
      <span className="preview-label">设计预览 · 不扣积分</span>
      <div className="theme-switch" role="group" aria-label="显示主题">
        {[['light', Sun, '浅色'], ['dark', Moon, '深色'], ['black', Square, '黑色']].map(([id, Icon, label]) => <button type="button" key={id} className={theme === id ? 'active' : ''} aria-pressed={theme === id} aria-label={`${label}主题`} title={`${label}主题`} onClick={() => setTheme(id)}><Icon size={15} /><span>{label}</span></button>)}
      </div>
      <span className="account" title="预览账户">P</span>
    </header>
    <div className="workspace-bar">
      <nav className="mode-tabs" role="tablist" aria-label="创作模式">
        {[['single', ImagePlus, '单图创作'], ['batch', Images, '批量生图'], ['tasks', ListTodo, '任务列表']].map(([id, Icon, label]) => <button type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`} aria-selected={tab === id} className={tab === id ? 'active' : ''} key={id} onClick={() => switchTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          const ids = ['single', 'batch', 'tasks']; const next = ids[(ids.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3];
          switchTab(next); document.getElementById(`tab-${next}`).focus();
        }}><Icon size={17} /><span>{label}</span>{id === 'tasks' && <small>{activeTasks}</small>}</button>)}
      </nav>
      <div className="workspace-status"><span className="status-dot" /><span>{activeTasks ? `${activeTasks} 个任务处理中` : '就绪'}</span><span className="balance">12,203 <small>积分</small></span></div>
    </div>
    <main className="split-layout" ref={splitRef} style={{ '--editor-width': `${panelWidth}px` }}>
      <section className={`editor ${taskView ? 'task-editor' : ''}`} id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {!taskView ? <form className="editor-form" onSubmit={generate}>
          <div className="editor-scroll">
            {!batch ? <>
              <div className="section-heading"><h2>画面描述</h2><button type="button" className="text-button" onClick={() => openDialog('help')}><CircleHelp size={15} />提示词示例</button></div>
              <div className={`prompt-box ${dragOver ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false); }} onDrop={dropImages}
                onPaste={event => { if (event.clipboardData.files.length) { event.preventDefault(); uploadFiles(event.clipboardData.files); } }}>
                <textarea ref={promptInput} aria-label="画面描述" placeholder="描述你想创作的画面，或希望修改的细节…" maxLength="6000" value={prompt} onChange={event => setPrompt(event.target.value)} onKeyUp={event => {
                  if (event.key === '@') { setTrayOpen(true); openLibrary('single'); }
                }} />
                <div className="prompt-toolbar">
                  <div className="attachment-control">
                    <IconButton icon={Paperclip} label="添加图片" className={trayOpen || references.length ? 'selected' : ''} aria-expanded={attachmentMenu} onClick={() => {
                      const next = !attachmentMenu; setAttachmentMenu(next);
                      if (!references.length) setTrayOpen(next);
                    }} />
                    {attachmentMenu && <div className="attachment-menu"><button type="button" onClick={() => openUpload('single')}><FolderOpen size={16} />从文件夹上传</button><button type="button" onClick={() => openLibrary('single')}><Images size={16} />从资源库选择</button></div>}
                  </div>
                  <IconButton icon={AtSign} label="引用历史图片" onClick={() => { setTrayOpen(true); openLibrary('single'); }} />
                  <button type="button" className={`style-button ${style ? 'selected' : ''}`} onClick={() => openDialog('style')}><Palette size={16} /><span>{style || '风格'}</span><ChevronDown size={13} /></button>
                  <span className="char-count">{prompt.length}/6000</span>
                  <IconButton icon={Trash2} label="清空提示词" disabled={!prompt || busy} onClick={() => { setPrompt(''); promptInput.current.focus(); }} />
                </div>
                {dragOver && <div className="drop-cover"><ImagePlus size={28} />松开以添加参考图</div>}
              </div>
              {referenceTray()}
              <div className="writing-tools">
                <details className="quick-phrases"><summary>常用短语<ChevronDown size={13} /></summary><div>{['主体突出', '背景干净', '光线自然', '保留文字'].map(item => <button type="button" key={item} onClick={() => setPrompt(current => `${current}${current ? '，' : ''}${item}`)}>{item}</button>)}</div></details>
                <button type="button" className="text-button accent" disabled={!prompt.trim()} onClick={() => notify('AI 魔笔需要接入正式服务，设计预览不调用接口。')}><Sparkles size={15} />AI 魔笔<small>1 积分</small></button>
              </div>
            </> : <>
              <div className="section-heading"><h2>参考图<small>可选</small></h2><span className="muted">{batchImages.length}/10</span></div>
              <div className={`batch-upload ${dragOver ? 'drag-active' : ''}`} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={dropImages}>
                {batchImages.length ? <div className="batch-image-grid">{batchImages.map((item, index) => imageTile(item, index, true))}<IconButton icon={Plus} label="继续添加图片" className="add-image" onClick={() => openLibrary('batch')} disabled={batchImages.length >= 10} /></div>
                  : <><ImagePlus size={24} /><div><button className="text-button accent" type="button" onClick={() => openUpload('batch')}>上传图片</button><span className="muted"> 或 </span><button className="text-button" type="button" onClick={() => openLibrary('batch')}>资源库</button></div><small>最多 10 张 · 每张 ≤ 15 MB</small></>}
              </div>
              <div className="section-heading batch-heading"><h2>提示词<span className="count-badge">{assignments.length}</span></h2><button className="text-button" type="button" onClick={() => openDialog('import')}><FileText size={15} />批量导入</button></div>
              {batchImages.length > 1 && <div className="segmented mapping-mode" role="group" aria-label="提示词匹配方式">{[['paired', '逐图匹配'], ['shared', '统一提示词']].map(([id, label]) => <button type="button" className={batchMode === id ? 'active' : ''} aria-pressed={batchMode === id} key={id} onClick={() => setBatchMode(id)}>{label}</button>)}</div>}
              <p className="mapping-summary">{batchImages.length === 0 ? `纯文字生图 · ${assignments.length} 条提示词 → ${assignments.length} 张图` : batchImages.length === 1 ? `共用 1 张参考图 · ${assignments.length} 条提示词 → ${assignments.length} 张图` : batchMode === 'shared' ? `1 条提示词 → ${batchImages.length} 张参考图` : `${batchImages.length} 张参考图 ↔ ${batchImages.length} 条提示词`}</p>
              <div className="prompt-list">{activePrompts.map((text, index) => {
                const inactive = batchImages.length > 1 && batchMode === 'paired' && index >= batchImages.length;
                return <div className={`prompt-row ${inactive ? 'inactive' : ''}`} key={index} onDragOver={event => event.preventDefault()} onDrop={event => {
                  event.preventDefault(); const from = draggingIndex.current;
                  if (from >= 0) movePrompt(from, index - from); draggingIndex.current = -1;
                }}>
                  <div className="prompt-row-heading"><span className="prompt-index" draggable onDragStart={() => { draggingIndex.current = index; }} onDragEnd={() => { draggingIndex.current = -1; }}><GripVertical size={14} />{String(index + 1).padStart(2, '0')}</span>
                    <span className="row-assignment">{inactive ? '已保留 · 暂不生成' : batchImages.length ? batchMode === 'shared' && batchImages.length > 1 ? '全部参考图' : `参考图 ${batchImages.length === 1 ? 1 : index + 1}` : '文字生图'}</span>
                    <IconButton icon={ArrowUp} label={`上移提示词 ${index + 1}`} disabled={index === 0} onClick={() => movePrompt(index, -1)} /><IconButton icon={ArrowDown} label={`下移提示词 ${index + 1}`} disabled={index === activePrompts.length - 1} onClick={() => movePrompt(index, 1)} />
                    <IconButton icon={X} label={`删除提示词 ${index + 1}`} disabled={prompts.length === 1 || (batchImages.length > 1 && index < batchImages.length)} onClick={() => setPrompts(current => current.filter((_, i) => i !== index))} />
                  </div>
                  <textarea aria-label={`提示词 ${index + 1}`} value={text} placeholder={inactive ? '暂不生成，可上移匹配图片' : '输入画面或修改要求…'} maxLength="6000" onChange={event => setPromptRow(index, event.target.value)} />
                </div>;
              })}</div>
              {(batchImages.length <= 1 || (batchMode !== 'shared' && activePrompts.length < batchImages.length)) && <button className="add-prompt" type="button" disabled={prompts.length >= 10} onClick={() => setPrompts(current => [...current, ''])}><Plus size={15} />添加提示词</button>}
            </>}
            {settings()}
          </div>
          <footer className="generate-footer">
            <div className="estimate"><span>本次 <strong>{outputCount} 张</strong></span><span>预计 <strong>{valid ? estimates : '—'}</strong> 积分 <small>· 示例</small></span></div>
            <div className="generate-actions"><button className="primary-button" type="submit" disabled={!valid || busy} aria-busy={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}<span>{busy ? '正在预览…' : batch ? '预览批量生成' : '预览生成'}</span><ArrowUpRight size={18} /></button><IconButton icon={ListTodo} label="加入队列" className="queue-button" disabled={!valid || busy} onClick={event => generate(event, true)} /></div>
          </footer>
        </form> : <div className="tasks-content">
          <div className="section-heading"><h2>任务列表</h2><span className="muted">{tasks.length}/30</span></div>
          <div className="task-stats">{[['running', '进行中'], ['completed', '已完成'], ['failed', '失败'], ['all', '全部']].map(([id, label]) => <button type="button" key={id} className={taskFilter === id ? 'active' : ''} aria-pressed={taskFilter === id} onClick={() => setTaskFilter(id)}><span>{label}</span><strong>{id === 'all' ? tasks.length : tasks.filter(item => item.status === id).length}</strong></button>)}</div>
          <div className="task-list">{tasks.filter(item => taskFilter === 'all' || item.status === taskFilter).map(item => <article className={`task-item ${selected.id === item.image.id ? 'selected' : ''}`} key={item.id}>
            <button type="button" className="task-select" onClick={() => setSelected(item.image)} aria-label={`查看任务：${item.prompt}`}><img src={assetUrl(item.image)} alt="" /><span><span className={`task-state ${item.status}`}>{item.status === 'running' ? '处理中' : item.status === 'failed' ? '生成失败' : '已完成'}</span><strong>{item.prompt}</strong><small>{item.count} 张 · {item.status === 'failed' ? '示例：服务超时，积分已退回' : '1024 × 1536'}</small></span></button>
            <div className="task-item-actions"><button type="button" className="text-button" onClick={() => { setPrompt(item.prompt); switchTab('single'); }}><RotateCcw size={14} />{item.status === 'failed' ? '重新编辑' : '复用提示词'}</button><IconButton icon={X} label="移除任务" disabled={item.status === 'running'} onClick={() => setTasks(current => current.filter(task => task.id !== item.id))} /></div>
          </article>)}</div>
          {!tasks.some(item => taskFilter === 'all' || item.status === taskFilter) && <div className="empty-state"><ListTodo size={28} /><p>暂无此类任务</p></div>}
        </div>}
      </section>
      <div className="splitter" role="separator" aria-label="调整编辑区宽度" aria-orientation="vertical" aria-valuemin="400" aria-valuenow={Math.round(panelWidth)} tabIndex="0" onPointerDown={startResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={finishResize} onDoubleClick={() => { setPanelWidth(460); write('panelWidth', 460); }} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 400 : Math.max(400, Math.min(splitRef.current.clientWidth - 380, panelWidth + (event.key === 'ArrowLeft' ? -20 : 20)));
          setPanelWidth(next); write('panelWidth', next);
        }
      }}><span /></div>
      <section className="results">
        <div className="result-header"><div className="result-tabs"><button type="button" className={previewTab === 'result' ? 'active' : ''} onClick={() => setPreviewTab('result')}>图片预览</button><button type="button" className={previewTab === 'history' ? 'active' : ''} onClick={() => setPreviewTab('history')}>历史记录<small>{gallery.length}</small></button></div>
          <IconButton icon={Maximize2} label="放大预览" onClick={() => openDialog('preview')} />
        </div>
        {previewTab === 'result' ? <>
          <div className="image-stage"><span className="image-label">项目示例图</span><img src={assetUrl(selected)} alt={selected.title} onDoubleClick={() => openDialog('preview')} />
            {busy && <div className="busy-overlay" role="status"><LoaderCircle size={26} className="spin" /><strong>正在预览生成流程</strong><span>不调用生图服务</span></div>}
          </div>
          <div className="result-info"><div><strong>{selected.title}</strong><span>{selected.url ? '已上传图片' : '项目现有素材'} · 完整画幅</span></div><div className="result-actions"><button className="soft-button" type="button" onClick={() => { const target = taskView ? 'single' : tab; addReferences([selected], target); if (taskView) switchTab('single'); notify('已添加为参考图。'); }}><AtSign size={15} /><span>用作参考</span></button><a className="icon-button" href={assetUrl(selected)} download={`${selected.title}.jpg`} title="下载图片" aria-label="下载图片"><Download size={17} /></a></div></div>
          <section className="recent-section"><div className="section-label"><span>最近作品</span><button type="button" className="text-button" onClick={() => setPreviewTab('history')}>查看全部<ChevronRight size={14} /></button></div><div className="filmstrip">{gallery.map(item => <button type="button" key={item.id} className={selected.id === item.id ? 'active' : ''} onClick={() => setSelected(item)} title={item.title} aria-label={`预览${item.title}`} aria-pressed={selected.id === item.id}><img src={assetUrl(item)} alt={item.title} /></button>)}</div></section>
        </> : <div className="history-content"><div className="search-field"><Search size={16} /><input aria-label="搜索历史作品" placeholder="搜索作品" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="history-grid">{gallery.filter(item => item.title.includes(query)).map(item => <article key={item.id}><button className="history-image" type="button" onClick={() => { setSelected(item); setPreviewTab('result'); }}><img src={assetUrl(item)} alt={item.title} /></button><div><span>{item.title}</span><IconButton icon={AtSign} label={`引用${item.title}`} onClick={() => { addReferences([item], taskView ? 'single' : tab); if (taskView) switchTab('single'); }} /></div></article>)}</div>{!gallery.some(item => item.title.includes(query)) && <p className="empty-state">没有找到相关作品</p>}</div>}
      </section>
    </main>
    <input type="file" ref={fileInput} hidden accept="image/png,image/jpeg,image/webp" multiple onChange={event => { uploadFiles(event.target.files, sourceTarget.current); event.target.value = ''; }} />
    <input type="file" ref={textFileInput} hidden accept=".txt,text/plain" onChange={async event => { const file = event.target.files[0]; if (file) { if (file.size > 1024 * 1024) notify('TXT 文件不能超过 1 MB。'); else setImportText(await file.text()); } event.target.value = ''; }} />
    {dialog && <dialog ref={dialogRef} className={`modal modal-${dialog}`} onCancel={() => setDialog(null)} onClick={event => { if (event.target === event.currentTarget) setDialog(null); }}>
      <header><h2>{({ library: '选择参考图', style: '画面风格', import: '导入提示词', help: '提示词示例', preview: selected.title })[dialog]}</h2><IconButton icon={X} label="关闭弹窗" onClick={() => setDialog(null)} /></header>
      <div className="modal-body">
        {dialog === 'library' && <><div className="search-field"><Search size={16} /><input autoFocus placeholder="搜索资源名称" aria-label="搜索资源" value={query} onChange={event => setQuery(event.target.value)} /></div><div className="asset-grid">{gallery.filter(item => item.title.includes(query)).map(item => {
          const checked = (sourceTarget.current === 'batch' ? batchImages : references).some(image => image.id === item.id);
          return <button type="button" key={item.id} aria-label={item.title} aria-pressed={checked} className={checked ? 'selected' : ''} onClick={() => checked ? (sourceTarget.current === 'batch' ? setBatchImages : setReferences)(current => current.filter(image => image.id !== item.id)) : addReferences([item], sourceTarget.current)}><img src={assetUrl(item)} alt="" /><span>{item.title}</span>{checked && <i><Check size={15} /></i>}</button>;
        })}</div>{!gallery.some(item => item.title.includes(query)) && <p className="empty-state">没有找到相关图片</p>}</>}
        {dialog === 'style' && <><button type="button" className={`no-style ${!style ? 'selected' : ''}`} onClick={() => { setStyle(''); setDialog(null); }}>不使用预设风格{!style && <Check size={16} />}</button><div className="asset-grid">{styleItems.map(item => <button type="button" key={item.label} className={style === item.label ? 'selected' : ''} onClick={() => { setStyle(item.label); setDialog(null); }}><img src={assetUrl(item.image)} alt="" /><span>{item.label}</span>{style === item.label && <i><Check size={15} /></i>}</button>)}</div></>}
        {dialog === 'import' && <><div className="import-header"><span>每行一条，最多 10 条</span><button type="button" className="soft-button" onClick={() => textFileInput.current.click()}><FolderOpen size={15} />选择 TXT</button></div><textarea className="import-text" autoFocus aria-label="导入提示词内容" value={importText} onChange={event => setImportText(event.target.value)} placeholder={'白色背景的香水产品摄影\n温暖日光下的香水广告\n暗调背景的香水特写'} /><p className="muted">导入后将替换当前提示词列表。</p></>}
        {dialog === 'help' && <><p className="help-formula">主体 + 场景 + 构图 + 光线 + 需要保留的细节</p><p className="example-text">{promptExample}</p><button type="button" className="soft-button" onClick={() => { setPrompt(promptExample); setDialog(null); promptInput.current?.focus(); }}><Copy size={15} />使用这个示例</button></>}
        {dialog === 'preview' && <img className="full-preview" src={assetUrl(selected)} alt={selected.title} />}
      </div>
      {dialog === 'library' && <footer><span>已选择 {(sourceTarget.current === 'batch' ? batchImages : references).length} 张</span><button className="primary-button" type="button" onClick={() => setDialog(null)}>完成</button></footer>}
      {dialog === 'import' && <footer><span>{parseBatchPromptLines(importText).lines.length} 条提示词</span><button className="primary-button" type="button" disabled={!importText.trim()} onClick={() => importPrompts()}>导入</button></footer>}
    </dialog>}
    {toast && <div className="toast" role="status"><Check size={16} /><span>{toast}</span><IconButton icon={X} label="关闭提示" onClick={() => setToast('')} /></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
