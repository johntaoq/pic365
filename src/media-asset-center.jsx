import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileAudio,
  Film,
  Folder,
  FolderPlus,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Link2,
  LoaderCircle,
  Music2,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Tags,
  Trash2,
  UploadCloud,
  Users,
  WandSparkles,
  X
} from 'lucide-react';

const FILTERS = [
  ['all', ImageIcon],
  ['image', ImageIcon],
  ['video', Film],
  ['audio', Music2],
  ['upload', UploadCloud],
  ['generated', Sparkles],
  ['project', Link2],
  ['favorite', Heart],
  ['brand', Palette],
  ['shared', Users],
  ['trash', Trash2]
];

const copy = {
  zh: {
    title: '媒体资产中心', subtitle: '图片、视频和音频统一管理', all: '全部', image: '图片', video: '视频', audio: '音频',
    upload: '我上传的', generated: 'AI 生成的', project: '项目素材', favorite: '收藏', brand: '品牌库', shared: '团队共享', trash: '回收站',
    search: '搜索名称、提示词或标签', uploadMedia: '上传媒体', uploading: '处理中', sourceUpload: '本地上传', sourceGenerated: 'AI 生成结果',
    folder: '新建文件夹', brandKit: '新建品牌库', team: '团队', noAssets: '这里还没有资产', noAssetsHint: '上传媒体或完成一次生图后，资产会自动出现在这里。',
    loadMore: '加载更多', storage: '存储空间', assets: '项资产', rename: '名称', tags: '标签', collection: '文件夹 / 品牌库', noCollection: '未分类', save: '保存',
    download: '下载', useReference: 'AI修图', addProject: '加入电商项目', confirmAddProject: '确认加入', linkingProject: '正在加入…', alreadyInProject: '已加入当前项目', updateProjectRole: '更新素材角色', selectProject: '选择目标项目', projectField: '目标项目', projectRole: '素材角色', projectLinkHint: '仅建立引用，不复制文件；解除关联不会删除资产库原图。', projectLinkedDetail: (project, role) => `已作为“${role}”加入“${project}”`, openLinkedProject: '前往项目查看', projectProduct: '商品图', projectPackaging: '包装图', projectLogo: 'Logo', projectReference: '视觉参考图', share: '共享', shareEmail: '成员邮箱', shareTeam: '共享到团队',
    moveTrash: '移到回收站', restore: '恢复', close: '关闭', favoriteAction: '收藏', unfavorite: '取消收藏', processing: '正在处理', failed: '处理失败', ready: '可用',
    create: '创建', name: '名称', color: '颜色', createTeam: '创建团队', addMember: '添加成员', teamName: '团队名称', memberEmail: '注册用户邮箱', memberRole: '权限', viewer: '查看', editor: '编辑',
    copied: '已完成', updateFailed: '操作失败，请重试。', uploadFailed: '部分媒体上传或处理失败。', quotaExceeded: '资产空间不足。', unsupported: '不支持该文件格式。',
    projectLinked: '已加入项目', sharedDone: '共享完成', duration: '时长', size: '尺寸', original: '原始文件', preview: '预览文件', prompt: '提示词', promptHidden: '系统提示词已隐藏',
    folders: '文件夹', teams: '团队与共享', folderType: '普通文件夹', brandType: '品牌素材库', clickPreview: '点击查看与管理', fileLimit: '图片 25MB、视频 100MB、音频 40MB',
    signInTitle: '登录后使用资产库', signInText: '资产按账户隔离，并可跨设备使用。', signIn: '登录', refresh: '刷新'
  },
  en: {
    title: 'Media Asset Center', subtitle: 'Manage images, video, and audio in one place', all: 'All', image: 'Images', video: 'Video', audio: 'Audio',
    upload: 'Uploads', generated: 'AI generated', project: 'Project assets', favorite: 'Favorites', brand: 'Brand kits', shared: 'Shared', trash: 'Trash',
    search: 'Search names, prompts, or tags', uploadMedia: 'Upload media', uploading: 'Processing', sourceUpload: 'Local upload', sourceGenerated: 'AI result',
    folder: 'New folder', brandKit: 'New brand kit', team: 'Teams', noAssets: 'No assets here yet', noAssetsHint: 'Upload media or generate an image and it will appear here automatically.',
    loadMore: 'Load more', storage: 'Storage', assets: 'assets', rename: 'Name', tags: 'Tags', collection: 'Folder / brand kit', noCollection: 'Unsorted', save: 'Save',
    download: 'Download', useReference: 'AI Edit', addProject: 'Add to ecommerce project', confirmAddProject: 'Add to project', linkingProject: 'Adding…', alreadyInProject: 'Already in this project', updateProjectRole: 'Update asset role', selectProject: 'Select target project', projectField: 'Target project', projectRole: 'Asset role', projectLinkHint: 'Creates a reference without copying the file. Unlinking does not delete the original asset.', projectLinkedDetail: (project, role) => `Added to “${project}” as “${role}”`, openLinkedProject: 'Open project', projectProduct: 'Product image', projectPackaging: 'Packaging', projectLogo: 'Logo', projectReference: 'Visual reference', share: 'Share', shareEmail: 'Member email', shareTeam: 'Share with team',
    moveTrash: 'Move to trash', restore: 'Restore', close: 'Close', favoriteAction: 'Favorite', unfavorite: 'Unfavorite', processing: 'Processing', failed: 'Failed', ready: 'Ready',
    create: 'Create', name: 'Name', color: 'Color', createTeam: 'Create team', addMember: 'Add member', teamName: 'Team name', memberEmail: 'Registered email', memberRole: 'Role', viewer: 'Viewer', editor: 'Editor',
    copied: 'Done', updateFailed: 'The action failed. Try again.', uploadFailed: 'Some media could not be uploaded or processed.', quotaExceeded: 'Asset storage quota exceeded.', unsupported: 'This file type is not supported.',
    projectLinked: 'Added to project', sharedDone: 'Shared', duration: 'Duration', size: 'Dimensions', original: 'Original', preview: 'Preview', prompt: 'Prompt', promptHidden: 'System prompt hidden',
    folders: 'Folders', teams: 'Teams and sharing', folderType: 'Folder', brandType: 'Brand kit', clickPreview: 'Click to preview and manage', fileLimit: 'Images 25MB, video 100MB, audio 40MB',
    signInTitle: 'Sign in to use your asset library', signInText: 'Assets are isolated by account and available across devices.', signIn: 'Sign in', refresh: 'Refresh'
  }
};

function authHeaders(session, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  };
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function assetStatusText(asset, t) {
  if (asset.status === 'processing') return t.processing;
  if (asset.status === 'failed') return t.failed;
  return t.ready;
}

function AudioWaveform({ url }) {
  const [points, setPoints] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (!url) return undefined;
    fetch(url).then((response) => response.json()).then((values) => {
      if (!cancelled && Array.isArray(values)) setPoints(values.filter((_, index) => index % Math.max(1, Math.floor(values.length / 64)) === 0).slice(0, 64));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [url]);
  if (!points.length) return null;
  return <div className="mediaAssetWaveform" aria-hidden="true">{points.map((value, index) => <i style={{ height: `${Math.max(8, Number(value || 0) * 100)}%` }} key={`${index}-${value}`} />)}</div>;
}

function AssetMedia({ asset, detail = false }) {
  if (asset.mediaType === 'video') {
    return detail
      ? <video src={asset.previewUrl} poster={asset.posterUrl || asset.thumbnailUrl} controls playsInline preload="metadata" />
      : <div className="mediaAssetVideoThumb"><img src={asset.posterUrl || asset.thumbnailUrl} alt="" loading="lazy" /><Play size={25} /></div>;
  }
  if (asset.mediaType === 'audio') {
    return detail
      ? <div className="mediaAssetAudioPlayer"><FileAudio size={38} /><AudioWaveform url={asset.waveformUrl} /><audio src={asset.previewUrl} controls preload="metadata" /></div>
      : <div className="mediaAssetAudioThumb"><FileAudio size={34} /><span>{formatDuration(asset.durationMs)}</span></div>;
  }
  return <img src={detail ? asset.previewUrl : asset.thumbnailUrl} alt={asset.name} loading={detail ? 'eager' : 'lazy'} decoding="async" />;
}

function AssetDetail({ asset, language, collections, projects, teams, session, onClose, onUpdated, onPurged, onUseAsReference, onOpenEcommerceProject }) {
  const t = copy[language] || copy.en;
  const [draft, setDraft] = useState({ name: asset.name, tags: asset.tags.join(', '), collectionId: asset.collectionId || '' });
  const [projectId, setProjectId] = useState('');
  const [projectAssetType, setProjectAssetType] = useState('reference');
  const [projectLinks, setProjectLinks] = useState([]);
  const [shareMode, setShareMode] = useState('user');
  const [shareTarget, setShareTarget] = useState('');
  const [sharePermission, setSharePermission] = useState('view');
  const [permissions, setPermissions] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const projectRoleLabels = {
    product: t.projectProduct,
    packaging: t.projectPackaging,
    logo: t.projectLogo,
    reference: t.projectReference
  };
  const selectedProject = projects.find((project) => project.id === projectId) || null;
  const selectedProjectLink = projectLinks.find((link) => link.projectId === projectId) || null;
  const selectedRoleMatches = Boolean(selectedProjectLink && selectedProjectLink.assetType === projectAssetType);

  useEffect(() => {
    let active = true;
    fetch(`/api/assets/projects?assetId=${encodeURIComponent(asset.id)}`, {
      headers: authHeaders(session),
      cache: 'no-store'
    })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) setProjectLinks(payload.links || []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [asset.id, session]);

  useEffect(() => {
    let active = true;
    if (asset.shared) return () => { active = false; };
    fetch(`/api/assets/share?assetId=${encodeURIComponent(asset.id)}`, {
      headers: authHeaders(session),
      cache: 'no-store'
    })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) setPermissions(payload.permissions || []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [asset.id, asset.shared, session]);

  useEffect(() => {
    const link = projectLinks.find((item) => item.projectId === projectId);
    if (link?.assetType) setProjectAssetType(link.assetType);
  }, [projectId, projectLinks]);

  async function update(changes) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/assets/item?id=${encodeURIComponent(asset.id)}`, {
        method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify(changes)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      onUpdated(payload.asset);
      setMessage(t.copied);
    } catch { setMessage(t.updateFailed); } finally { setBusy(false); }
  }

  async function addToProject() {
    if (!projectId) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/assets/projects', {
        method: 'POST', headers: authHeaders(session, true), body: JSON.stringify({
          assetId: asset.id,
          projectId,
          assetType: projectAssetType,
          role: projectAssetType
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      const project = projects.find((item) => item.id === projectId);
      const nextLink = {
        projectAssetId: payload.projectAssetId || selectedProjectLink?.projectAssetId || '',
        projectId,
        assetType: payload.assetType || projectAssetType,
        projectName: project?.projectName || project?.productName || '',
        productName: project?.productName || ''
      };
      setProjectLinks((current) => [nextLink, ...current.filter((item) => item.projectId !== projectId)]);
      setMessage(t.projectLinkedDetail(nextLink.projectName, projectRoleLabels[nextLink.assetType] || nextLink.assetType));
    } catch { setMessage(t.updateFailed); } finally { setBusy(false); }
  }

  async function share() {
    if (!shareTarget) return;
    setBusy(true); setMessage('');
    try {
      const body = shareMode === 'team'
        ? { assetId: asset.id, principalType: 'team', principalId: shareTarget, permission: sharePermission }
        : { assetId: asset.id, principalType: 'user', email: shareTarget, permission: sharePermission };
      const response = await fetch('/api/assets/share', { method: 'POST', headers: authHeaders(session, true), body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      const refreshed = await fetch(`/api/assets/share?assetId=${encodeURIComponent(asset.id)}`, { headers: authHeaders(session), cache: 'no-store' }).then((item) => item.json());
      if (refreshed?.ok) setPermissions(refreshed.permissions || []);
      setMessage(t.sharedDone);
    } catch { setMessage(t.updateFailed); } finally { setBusy(false); }
  }

  async function revokeShare(permission) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/assets/share', {
        method: 'DELETE',
        headers: authHeaders(session, true),
        body: JSON.stringify({ assetId: asset.id, principalType: permission.principalType, principalId: permission.principalId })
      });
      if (!response.ok) throw new Error('REVOKE_FAILED');
      setPermissions((current) => current.filter((item) => item.principalType !== permission.principalType || item.principalId !== permission.principalId));
      setMessage(language === 'zh' ? '共享权限已撤销' : 'Sharing access revoked');
    } catch { setMessage(t.updateFailed); } finally { setBusy(false); }
  }

  async function purgeAsset() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/assets/item?id=${encodeURIComponent(asset.id)}&permanent=1`, {
        method: 'DELETE', headers: authHeaders(session)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'PURGE_FAILED');
      onPurged?.(asset.id);
    } catch { setMessage(language === 'zh' ? '该资产仍被项目引用，请先解除关联。' : 'This asset is still used by a project. Unlink it first.'); } finally { setBusy(false); }
  }

  return (
    <div className="mediaAssetOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="mediaAssetDetail" role="dialog" aria-modal="true" aria-label={asset.name}>
        <button className="mediaAssetClose" type="button" onClick={onClose} aria-label={t.close}><X size={19} /></button>
        <div className="mediaAssetDetailMedia"><AssetMedia asset={asset} detail /></div>
        <div className="mediaAssetInspector">
          <div className="mediaAssetInspectorHeading">
            <span className={`mediaTypeBadge ${asset.mediaType}`}>{t[asset.mediaType]}</span>
            <span>{assetStatusText(asset, t)}</span>
          </div>
          <label><span>{t.rename}</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>{t.tags}</span><input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="product, campaign" /></label>
          <label><span>{t.collection}</span><select value={draft.collectionId} onChange={(event) => setDraft((current) => ({ ...current, collectionId: event.target.value }))}><option value="">{t.noCollection}</option>{collections.map((item) => <option value={item.id} key={item.id}>{item.type === 'brand' ? '◆ ' : ''}{item.name}</option>)}</select></label>
          <button className="mediaAssetPrimary" type="button" disabled={busy} onClick={() => update({ ...draft, tags: draft.tags.split(',') })}><Check size={16} />{t.save}</button>
          <dl className="mediaAssetFacts">
            <div><dt>{t.size}</dt><dd>{asset.width && asset.height ? `${asset.width}×${asset.height}` : '-'}</dd></div>
            <div><dt>{t.duration}</dt><dd>{asset.durationMs ? formatDuration(asset.durationMs) : '-'}</dd></div>
            <div><dt>{t.original}</dt><dd>{formatBytes(asset.fileSize)}</dd></div>
          </dl>
          {asset.prompt || asset.promptHidden ? <div className="mediaAssetPrompt"><strong>{t.prompt}</strong><p>{asset.promptHidden ? t.promptHidden : asset.prompt}</p></div> : null}
          <div className="mediaAssetActionGrid">
            <button type="button" onClick={() => update({ favorite: !asset.favorite })}><Heart size={16} fill={asset.favorite ? 'currentColor' : 'none'} />{asset.favorite ? t.unfavorite : t.favoriteAction}</button>
            <a href={asset.downloadUrl}><Download size={16} />{t.download}</a>
            {asset.mediaType === 'image' && !asset.deletedAt ? <button type="button" onClick={() => onUseAsReference(asset)}><WandSparkles size={16} />{t.useReference}</button> : null}
            <button className={asset.deletedAt ? '' : 'danger'} type="button" onClick={() => update({ deleted: !asset.deletedAt })}>{asset.deletedAt ? <RotateCcw size={16} /> : <Trash2 size={16} />}{asset.deletedAt ? t.restore : t.moveTrash}</button>
            {asset.deletedAt ? <button className="danger" type="button" disabled={busy} onClick={purgeAsset}><Trash2 size={16} />{language === 'zh' ? '永久删除' : 'Delete permanently'}</button> : null}
          </div>
          {!asset.deletedAt && asset.mediaType === 'image' ? <div className="mediaAssetLinkBox"><header><strong><Link2 size={15} />{t.addProject}</strong><small>{t.projectLinkHint}</small></header><div className="mediaAssetProjectLinkFields"><label><span>{t.projectField}</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{t.selectProject}</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.projectName || project.productName}</option>)}</select></label><label><span>{t.projectRole}</span><select aria-label={t.projectRole} value={projectAssetType} onChange={(event) => setProjectAssetType(event.target.value)}><option value="product">{t.projectProduct}</option><option value="packaging">{t.projectPackaging}</option><option value="logo">{t.projectLogo}</option><option value="reference">{t.projectReference}</option></select></label><button className={selectedRoleMatches ? 'linked' : ''} type="button" disabled={!projectId || busy || selectedRoleMatches} onClick={addToProject}>{busy ? <LoaderCircle className="spinIcon" size={15} /> : selectedRoleMatches ? <Check size={15} /> : <Link2 size={15} />}{busy ? t.linkingProject : selectedRoleMatches ? t.alreadyInProject : selectedProjectLink ? t.updateProjectRole : t.confirmAddProject}</button></div>{selectedProjectLink && selectedProject ? <div className="mediaAssetProjectLinkStatus"><span><Check size={14} />{t.projectLinkedDetail(selectedProject.projectName || selectedProject.productName, projectRoleLabels[selectedProjectLink.assetType] || selectedProjectLink.assetType)}</span>{onOpenEcommerceProject ? <button type="button" onClick={() => onOpenEcommerceProject(selectedProject.id)}>{t.openLinkedProject}</button> : null}</div> : null}</div> : null}
          {!asset.deletedAt && !asset.shared ? <div className="mediaAssetShareBox"><div><button className={shareMode === 'user' ? 'active' : ''} type="button" onClick={() => { setShareMode('user'); setShareTarget(''); }}>{t.shareEmail}</button><button className={shareMode === 'team' ? 'active' : ''} type="button" onClick={() => { setShareMode('team'); setShareTarget(''); }}>{t.shareTeam}</button></div>{shareMode === 'user' ? <input value={shareTarget} onChange={(event) => setShareTarget(event.target.value)} placeholder={t.memberEmail} /> : <select value={shareTarget} onChange={(event) => setShareTarget(event.target.value)}><option value="">{t.shareTeam}</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select>}<select value={sharePermission} onChange={(event) => setSharePermission(event.target.value)}><option value="view">{t.viewer}</option><option value="edit">{t.editor}</option></select><button type="button" disabled={!shareTarget || busy} onClick={share}><Share2 size={15} />{t.share}</button>{permissions.length ? <ul>{permissions.map((permission) => <li key={`${permission.principalType}:${permission.principalId}`}><span>{permission.label} · {permission.permission === 'edit' ? t.editor : t.viewer}</span><button type="button" disabled={busy} onClick={() => revokeShare(permission)}><X size={14} /></button></li>)}</ul> : null}</div> : null}
          {message ? <p className="mediaAssetMessage">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}

export default function MediaAssetCenter({ language = 'zh', session, profile, onSignIn, onUseAsReference, onOpenEcommerceProject }) {
  const t = copy[language] || copy.en;
  const inputRef = useRef(null);
  const assetRequestRef = useRef({ sequence: 0, controller: null });
  const [filter, setFilter] = useState('all');
  const [collectionId, setCollectionId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [collections, setCollections] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState({ totalCount: 0, totalBytes: 0, quotaBytes: 1 });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sourceType, setSourceType] = useState('upload');
  const [message, setMessage] = useState('');
  const [createPanel, setCreatePanel] = useState('');
  const [createDraft, setCreateDraft] = useState({ name: '', color: '#5eead4', email: '', teamId: '', role: 'member' });
  const signedIn = Boolean(session?.user || session?.access_token);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ limit: '48', offset: '0' });
    if (query.trim()) params.set('q', query.trim());
    if (['image', 'video', 'audio'].includes(filter)) params.set('mediaType', filter);
    if (filter === 'upload') params.set('sourceType', 'upload');
    if (filter === 'generated') params.set('sourceType', 'generated');
    if (filter === 'favorite') params.set('favorite', '1');
    if (filter === 'project') params.set('project', '1');
    if (filter === 'brand') params.set('collectionType', 'brand');
    if (filter === 'shared') params.set('shared', '1');
    if (filter === 'trash') params.set('deleted', '1');
    if (collectionId) params.set('collectionId', collectionId);
    if (teamId) params.set('teamId', teamId);
    return params;
  }, [filter, query, collectionId, teamId]);

  const loadAssets = useCallback(async ({ append = false } = {}) => {
    if (!signedIn) return;
    const sequence = assetRequestRef.current.sequence + 1;
    assetRequestRef.current.sequence = sequence;
    assetRequestRef.current.controller?.abort();
    const controller = new AbortController();
    assetRequestRef.current.controller = controller;
    setLoading(true); setMessage('');
    try {
      const params = new URLSearchParams(queryParams);
      params.set('offset', String(append ? offset : 0));
      const response = await fetch(`/api/assets?${params.toString()}`, {
        headers: authHeaders(session),
        cache: 'no-store',
        signal: controller.signal
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      if (sequence !== assetRequestRef.current.sequence) return;
      setAssets((current) => append ? [...current, ...payload.assets.filter((item) => !current.some((entry) => entry.id === item.id))] : payload.assets);
      setStats((current) => payload.stats || current);
      setHasMore(Boolean(payload.hasMore));
      setOffset(Number(payload.nextOffset || 0));
    } catch (error) {
      if (error?.name !== 'AbortError' && sequence === assetRequestRef.current.sequence) setMessage(t.updateFailed);
    } finally {
      if (sequence === assetRequestRef.current.sequence) setLoading(false);
    }
  }, [signedIn, queryParams, offset, session]);

  function selectAssetScope({ nextFilter = 'all', nextCollectionId = '', nextTeamId = '' }) {
    assetRequestRef.current.controller?.abort();
    setSelectedAsset(null);
    setAssets([]);
    setHasMore(false);
    setOffset(0);
    setFilter(nextFilter);
    setCollectionId(nextCollectionId);
    setTeamId(nextTeamId);
    setRefreshNonce((current) => current + 1);
  }

  const loadSupportData = useCallback(async () => {
    if (!signedIn) return;
    const [collectionResponse, teamResponse, projectResponse] = await Promise.all([
      fetch('/api/assets/collections', { headers: authHeaders(session), cache: 'no-store' }),
      fetch('/api/assets/teams', { headers: authHeaders(session), cache: 'no-store' }),
      fetch('/api/assets/projects', { headers: authHeaders(session), cache: 'no-store' })
    ]);
    const [collectionPayload, teamPayload, projectPayload] = await Promise.all([
      collectionResponse.json().catch(() => ({})), teamResponse.json().catch(() => ({})), projectResponse.json().catch(() => ({}))
    ]);
    if (collectionPayload.ok) setCollections(collectionPayload.collections || []);
    if (teamPayload.ok) setTeams(teamPayload.teams || []);
    if (projectPayload.ok) setProjects(projectPayload.projects || []);
  }, [signedIn, session]);

  useEffect(() => { loadAssets(); }, [queryParams, signedIn, refreshNonce]);
  useEffect(() => { loadSupportData(); }, [signedIn]);
  useEffect(() => () => assetRequestRef.current.controller?.abort(), []);
  useEffect(() => {
    if (!assets.some((asset) => asset.status === 'processing')) return undefined;
    const timer = globalThis.setTimeout?.(() => loadAssets(), 1800);
    return () => globalThis.clearTimeout?.(timer);
  }, [assets, loadAssets]);

  async function uploadFiles(fileList) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setUploading(true); setMessage('');
    let failed = false;
    for (const file of files) {
      try {
        const params = new URLSearchParams({ fileName: file.name, sourceType });
        const response = await fetch(`/api/assets?${params.toString()}`, {
          method: 'POST', headers: { ...authHeaders(session), 'Content-Type': file.type || 'application/octet-stream' }, body: file
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          if (payload.error === 'ASSET_QUOTA_EXCEEDED') setMessage(t.quotaExceeded);
          else if (payload.error === 'UNSUPPORTED_MEDIA_TYPE') setMessage(t.unsupported);
          throw new Error(payload.error);
        }
      } catch { failed = true; }
    }
    if (failed && !message) setMessage(t.uploadFailed);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    await Promise.all([loadAssets(), loadSupportData()]);
  }

  async function createCollectionOrTeam() {
    if (!createDraft.name.trim()) return;
    const endpoint = createPanel === 'team' ? '/api/assets/teams' : '/api/assets/collections';
    const body = createPanel === 'team' ? { name: createDraft.name } : { name: createDraft.name, type: createPanel, color: createDraft.color };
    const response = await fetch(endpoint, { method: 'POST', headers: authHeaders(session, true), body: JSON.stringify(body) });
    if (response.ok) {
      setCreatePanel(''); setCreateDraft({ name: '', color: '#5eead4', email: '', teamId: '', role: 'member' });
      await loadSupportData();
    } else setMessage(t.updateFailed);
  }

  async function addMember() {
    if (!createDraft.teamId || !createDraft.email) return;
    const response = await fetch('/api/assets/teams', { method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify({ teamId: createDraft.teamId, email: createDraft.email, role: createDraft.role }) });
    if (response.ok) { setCreateDraft((current) => ({ ...current, email: '' })); setMessage(t.copied); await loadSupportData(); }
    else setMessage(t.updateFailed);
  }

  async function removeMember(teamId, userId) {
    const response = await fetch('/api/assets/teams', { method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify({ action: 'remove-member', teamId, userId }) });
    if (response.ok) await loadSupportData();
    else setMessage(t.updateFailed);
  }

  async function removeTeam(removedTeamId) {
    const response = await fetch('/api/assets/teams', { method: 'DELETE', headers: authHeaders(session, true), body: JSON.stringify({ teamId: removedTeamId }) });
    if (response.ok) {
      if (teamId === removedTeamId) selectAssetScope({ nextFilter: 'all' });
      await loadSupportData();
      if (teamId !== removedTeamId) await loadAssets();
    }
    else setMessage(t.updateFailed);
  }

  async function emptyTrash() {
    const response = await fetch('/api/assets', { method: 'DELETE', headers: authHeaders(session) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload?.ok) {
      setStats(payload.stats || stats);
      setSelectedAsset(null);
      await loadAssets();
      setMessage(payload.skipped ? (language === 'zh' ? `已删除 ${payload.deleted} 项，${payload.skipped} 项仍被项目引用。` : `${payload.deleted} deleted; ${payload.skipped} still linked.`) : '');
    } else setMessage(t.updateFailed);
  }

  function updateAssetInState(nextAsset) {
    setAssets((current) => current.map((item) => item.id === nextAsset.id ? nextAsset : item).filter((item) => filter === 'trash' ? item.deletedAt : !item.deletedAt));
    setSelectedAsset(nextAsset);
  }

  if (!signedIn) return <section className="mediaAssetCenter mediaAssetSignedOut"><HardDrive size={40} /><h1>{t.signInTitle}</h1><p>{t.signInText}</p><button type="button" onClick={onSignIn}>{t.signIn}</button></section>;

  const usagePercent = Math.min(100, stats.quotaBytes ? (stats.totalBytes / stats.quotaBytes) * 100 : 0);
  return (
    <section className="mediaAssetCenter">
      <header className="mediaAssetHero"><div><span><HardDrive size={17} /> PIC365 ASSETS</span><h1>{t.title}</h1><p>{t.subtitle}</p></div><div className="mediaAssetUsage"><strong>{formatBytes(stats.totalBytes)} / {formatBytes(stats.quotaBytes)}</strong><span>{stats.totalCount} {t.assets}</span><i><b style={{ width: `${usagePercent}%` }} /></i></div></header>
      <div className="mediaAssetLayout">
        <aside className="mediaAssetSidebar">
          <nav>{FILTERS.map(([id, Icon]) => <button className={filter === id && !collectionId && !teamId ? 'active' : ''} type="button" onClick={() => selectAssetScope({ nextFilter: id })} key={id}><Icon size={16} /><span>{t[id]}</span>{id === 'image' ? <em>{stats.imageCount || 0}</em> : id === 'video' ? <em>{stats.videoCount || 0}</em> : id === 'audio' ? <em>{stats.audioCount || 0}</em> : null}</button>)}</nav>
          <div className="mediaAssetCollections"><strong>{t.folders}</strong>{collections.map((item) => <button className={collectionId === item.id && !teamId ? 'active' : ''} type="button" onClick={() => selectAssetScope({ nextCollectionId: item.id })} key={item.id}><span style={{ background: item.color }} />{item.type === 'brand' ? <Palette size={14} /> : <Folder size={14} />}<b>{item.name}</b><em>{item.assetCount}</em></button>)}</div>
          <div className="mediaAssetTeams"><strong>{t.teams}</strong>{teams.map((team) => <div className={teamId === team.id ? 'active' : ''} key={team.id}><button className="mediaAssetTeamSelect" type="button" onClick={() => selectAssetScope({ nextTeamId: team.id })}><Users size={14} /><span>{team.name}</span><em>{team.assetCount}</em></button>{team.role === 'owner' ? <button className="mediaAssetTeamDelete" type="button" onClick={() => removeTeam(team.id)} aria-label={language === 'zh' ? `删除团队：${team.name}` : `Delete team: ${team.name}`}><Trash2 size={13} /></button> : null}</div>)}</div>
        </aside>
        <div className="mediaAssetMain">
          <div className="mediaAssetToolbar">
            <label className="mediaAssetSearch"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="upload">{t.sourceUpload}</option><option value="generated">{t.sourceGenerated}</option></select>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/ogg" multiple hidden onChange={(event) => uploadFiles(event.target.files)} />
            <button className="mediaAssetUploadButton" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="spinIcon" size={17} /> : <UploadCloud size={17} />}{uploading ? t.uploading : t.uploadMedia}</button>
            {filter === 'trash' && assets.length ? <button className="danger" type="button" onClick={emptyTrash}><Trash2 size={16} />{language === 'zh' ? '清空回收站' : 'Empty trash'}</button> : null}
            <button type="button" onClick={() => setCreatePanel('folder')}><FolderPlus size={16} />{t.folder}</button>
            <button type="button" onClick={() => setCreatePanel('brand')}><Palette size={16} />{t.brandKit}</button>
            <button type="button" onClick={() => setCreatePanel('team')}><Users size={16} />{t.team}</button>
            <button className="iconOnly" type="button" onClick={() => { loadAssets(); loadSupportData(); }} aria-label={t.refresh}><RefreshCw size={17} /></button>
          </div>
          {createPanel ? <div className="mediaAssetCreatePanel"><div><strong>{createPanel === 'team' ? t.createTeam : createPanel === 'brand' ? t.brandKit : t.folder}</strong><button type="button" onClick={() => setCreatePanel('')}><X size={15} /></button></div><label><span>{t.name}</span><input value={createDraft.name} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} /></label>{createPanel !== 'team' ? <label><span>{t.color}</span><input type="color" value={createDraft.color} onChange={(event) => setCreateDraft((current) => ({ ...current, color: event.target.value }))} /></label> : null}<button className="mediaAssetPrimary" type="button" onClick={createCollectionOrTeam}>{t.create}</button>{createPanel === 'team' && teams.length ? <div className="mediaAssetMemberForm"><select value={createDraft.teamId} onChange={(event) => setCreateDraft((current) => ({ ...current, teamId: event.target.value }))}><option value="">{t.team}</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select><input value={createDraft.email} onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))} placeholder={t.memberEmail} /><select value={createDraft.role} onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value }))}><option value="member">{t.viewer}</option><option value="editor">{t.editor}</option></select><button type="button" onClick={addMember}>{t.addMember}</button>{teams.find((team) => team.id === createDraft.teamId)?.members?.filter((member) => member.role !== 'owner').map((member) => <div className="mediaAssetMemberRow" key={member.userId}><span>{member.email}</span><em>{member.role === 'editor' ? t.editor : t.viewer}</em><button type="button" onClick={() => removeMember(createDraft.teamId, member.userId)}><X size={13} /></button></div>)}</div> : null}</div> : null}
          <div className="mediaAssetMetaBar"><span>{assets.length} / {stats.accessibleCount ?? stats.totalCount} {t.assets}</span><small>{t.fileLimit}</small></div>
          {message ? <p className="mediaAssetPageMessage">{message}</p> : null}
          {loading && !assets.length ? <div className="mediaAssetLoading"><LoaderCircle className="spinIcon" size={28} /></div> : null}
          {!loading && !assets.length ? <div className="mediaAssetEmpty"><HardDrive size={34} /><h2>{t.noAssets}</h2><p>{t.noAssetsHint}</p></div> : null}
          <div className="mediaAssetGrid">{assets.map((asset) => <article className={`mediaAssetCard ${asset.status}`} key={asset.id} onClick={() => setSelectedAsset(asset)}><div className="mediaAssetCardMedia"><AssetMedia asset={asset} /><span className={`mediaTypeBadge ${asset.mediaType}`}>{t[asset.mediaType]}</span>{asset.favorite ? <Heart className="mediaAssetFavorite" size={16} fill="currentColor" /> : null}</div><div className="mediaAssetCardBody"><strong title={asset.name}>{asset.name}</strong><span>{asset.collectionName || (asset.sourceType === 'generated' ? t.generated : t.upload)}</span><small>{asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.durationMs ? formatDuration(asset.durationMs) : formatBytes(asset.fileSize)}</small></div><button type="button">{t.clickPreview}</button></article>)}</div>
          {hasMore ? <button className="mediaAssetLoadMore" type="button" disabled={loading} onClick={() => loadAssets({ append: true })}>{loading ? <LoaderCircle className="spinIcon" size={16} /> : null}{t.loadMore}</button> : null}
        </div>
      </div>
      {selectedAsset ? <AssetDetail asset={selectedAsset} language={language} collections={collections} projects={projects} teams={teams} session={session} onClose={() => setSelectedAsset(null)} onUpdated={(asset) => { updateAssetInState(asset); loadSupportData(); }} onPurged={(assetId) => { setAssets((current) => current.filter((asset) => asset.id !== assetId)); setSelectedAsset(null); loadAssets(); }} onUseAsReference={(asset) => { onUseAsReference?.(asset); setSelectedAsset(null); }} onOpenEcommerceProject={(projectId) => { onOpenEcommerceProject?.(projectId); setSelectedAsset(null); }} /> : null}
    </section>
  );
}
