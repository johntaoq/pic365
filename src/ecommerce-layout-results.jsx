import React, { useMemo, useState } from 'react';
import { Download, Image, ListTodo, LoaderCircle, Maximize2 } from 'lucide-react';
import { LAYOUT_TEMPLATES } from '../shared/ecommerce-layout-studio.js';
import { isActiveImageTask } from './image-task-list.js';
import { imageQualityLabel } from './image-quality-labels.js';
import {
  latestLayoutBatchId, layoutBatchResults, layoutBatchRows, layoutResultFilename,
  layoutResultIdentity, layoutTaskFailureText, selectLayoutResult
} from './ecommerce-layout-results.js';

const STATUS = {
  preparing: ['准备中', 'Preparing'],
  queued: ['排队中', 'Queued'],
  running: ['生成中', 'Generating'],
  cancelling: ['取消中', 'Cancelling'],
  completed: ['已完成', 'Completed'],
  failed: ['生成失败', 'Failed'],
  cancelled: ['已取消', 'Cancelled'],
  interrupted: ['已中断', 'Interrupted']
};

export default function EcommerceLayoutResults({
  language, tasks = [], pendingLayouts = [], onOpenPreview, onOpenTasks, submittedBatchId = ''
}) {
  const zh = language === 'zh';
  const [selection, setSelection] = useState({ id: '', batchId: '' });
  const [imageFailed, setImageFailed] = useState('');
  const batchId = submittedBatchId || latestLayoutBatchId(tasks);
  const rows = useMemo(
    () => layoutBatchRows(tasks, batchId, batchId === submittedBatchId ? pendingLayouts : []),
    [tasks, batchId, submittedBatchId, pendingLayouts]
  );
  const items = useMemo(() => layoutBatchResults(rows), [rows]);
  const active = selectLayoutResult(items, selection.batchId === batchId ? selection.id : '', batchId);
  const activeId = layoutResultIdentity(active);
  const resultsByTask = new Map(items.map((item) => [item.taskId, item]));
  const completed = rows.filter((task) => task.status === 'completed').length;
  const failed = rows.filter((task) => ['failed', 'cancelled', 'interrupted'].includes(task.status)).length;
  const hasFailure = rows.some((task) => task.status === 'failed');
  const running = rows.some((task) => task.status === 'preparing' || isActiveImageTask(task));
  const expandLabel = zh ? '放大图片' : 'Enlarge image';
  const downloadLabel = zh ? '下载原图' : 'Download original';
  const openPreview = () => active && onOpenPreview?.(active);

  return <aside className="layoutStudioResults" aria-label={zh ? '本轮版式生图结果' : 'Current layout generation results'}>
    <header className="layoutStudioPanelHead layoutStudioResultHead">
      <div><h2>{zh ? '图片预览' : 'Image preview'}</h2></div>
      <div className="layoutStudioResultTools">
        <button type="button" disabled={!active} onClick={openPreview} aria-label={expandLabel} title={expandLabel}><Maximize2 size={17} /></button>
        {active?.downloadAllowed ? <a href={active.imageUrl} download={layoutResultFilename(active)} aria-label={downloadLabel} title={downloadLabel}><Download size={17} /></a> : null}
      </div>
    </header>
    <div className="layoutStudioResultStage">
      {active && imageFailed !== activeId ? <button type="button" className="layoutStudioResultImage" onClick={openPreview} aria-label={expandLabel} title={expandLabel}>
        <img src={active.imageUrl} alt={zh ? '当前生成结果' : 'Current generated image'} decoding="async" draggable={false} onError={() => setImageFailed(activeId)} />
      </button> : <div className={`layoutStudioResultEmpty ${active || (hasFailure && !running) ? 'error' : ''}`} role={active || (hasFailure && !running) ? 'alert' : 'status'}>
        {running && !active ? <LoaderCircle className="spin" size={28} /> : <Image size={28} />}
        <span>{active ? (zh ? '图片暂时无法加载' : 'Image unavailable') : running ? (zh ? '等待本轮图片' : 'Waiting for this batch') : failed ? (zh ? '本轮未生成图片' : 'No image generated') : (zh ? '暂无预览图片' : 'No image to preview')}</span>
        {active ? <button type="button" onClick={() => setImageFailed('')}>{zh ? '重试' : 'Retry'}</button> : null}
      </div>}
    </div>
    <div className="layoutStudioResultMeta">
      <span>{active ? `${String(active.size || '').replace('x', ' × ')}${active.quality ? ` · ${imageQualityLabel(active.quality, language)}` : ''}` : ''}</span>
      {active?.downloadAllowed ? <a href={active.imageUrl} download={layoutResultFilename(active)}><Download size={14} />{zh ? '下载' : 'Download'}</a> : null}
    </div>
    <section className="layoutStudioTasks" aria-label={zh ? '本轮生图任务' : 'Current image tasks'}>
      <header className="layoutStudioPanelHead layoutStudioTasksHead">
        <div><h2>{zh ? '本轮任务' : 'Current batch'}</h2><small>{rows.length}</small></div>
        {onOpenTasks ? <button type="button" onClick={onOpenTasks} aria-label={zh ? '查看任务队列' : 'View task queue'} title={zh ? '查看任务队列' : 'View task queue'}><ListTodo size={16} /></button> : null}
      </header>
      {rows.length ? <>
        <div className="layoutStudioBatchStatus" role="status">
          <span>{zh ? `已完成 ${completed}/${rows.length}` : `${completed}/${rows.length} completed`}{failed ? <span className={hasFailure ? 'error' : 'warning'}>{zh ? ` · 未完成 ${failed}` : ` · ${failed} unfinished`}</span> : null}</span>
          <progress value={completed} max={rows.length} aria-label={zh ? '本轮完成进度' : 'Batch progress'} />
        </div>
        <div className="layoutStudioTaskGrid" role="group" aria-label={zh ? '本轮结果缩略图' : 'Current batch thumbnails'}>
          {rows.map((task) => {
            const item = resultsByTask.get(task.id);
            const layout = LAYOUT_TEMPLATES.find((entry) => entry.id === task.layoutId);
            const name = layout ? (zh ? layout.name : layout.nameEn)
              : (zh ? `版式 ${String(task.batchIndex + 1).padStart(2, '0')}` : `Layout ${task.batchIndex + 1}`);
            const status = task.status === 'completed' && !item
              ? (zh ? '结果不可用' : 'Result unavailable')
              : task.status === 'failed' ? layoutTaskFailureText(task.error, language)
              : (STATUS[task.status]?.[zh ? 0 : 1] || (zh ? '处理中' : 'Processing'));
            const selected = Boolean(item && activeId === layoutResultIdentity(item));
            const content = <>
              {item ? <img src={item.thumbnailUrl || item.imageUrl} alt="" loading="lazy" decoding="async" />
                : <span className="layoutStudioTileState">
                  {task.status === 'running' || task.status === 'cancelling' || task.status === 'preparing'
                    ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Image size={18} aria-hidden="true" />}
                  <span>{status}</span>
                </span>}
              <span className="layoutStudioTileIndex">{String(task.batchIndex + 1).padStart(2, '0')}</span>
              <span className="layoutStudioTileCaption" title={name}>{name}</span>
            </>;
            return item ? <button type="button" className={`layoutStudioTaskTile ${task.status} ${selected ? 'selected' : ''}`} key={task.id}
              aria-pressed={selected} aria-label={`${zh ? '预览' : 'Preview'} ${name}`} title={`${zh ? '预览' : 'Preview'} ${name}`}
              onClick={() => setSelection({ id: layoutResultIdentity(item), batchId })}>{content}</button>
              : <div className={`layoutStudioTaskTile ${task.status} ${task.status === 'completed' ? 'unavailable' : ''}`} key={task.id} aria-label={`${name}：${status}`} title={task.status === 'failed' ? status : undefined}>{content}</div>;
          })}
        </div>
      </> : <p className="layoutStudioTasksEmpty">{zh ? '暂无版式生图任务' : 'No layout tasks yet'}</p>}
    </section>
  </aside>;
}
