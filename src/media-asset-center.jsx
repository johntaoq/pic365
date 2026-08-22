import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CircleAlert,
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
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Tags,
  Trash2,
  UploadCloud,
  UserRound,
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
  ['shared', Users],
  ['trash', Trash2]
];

const copy = {
  zh: {
    title: '媒体资产中心', subtitle: '图片、视频和音频统一管理', all: '全部', image: '图片', video: '视频', audio: '音频',
    upload: '我上传的', generated: 'AI 生成的', project: '项目素材', favorite: '收藏', shared: '团队共享', trash: '回收站',
    search: '搜索资产名称或所属分类', uploadMedia: '上传媒体', uploading: '处理中', allSources: '全部来源', sourceUpload: '本地上传', sourceGenerated: 'AI 生成结果',
    folder: '新建分类', team: '管理团队', noAssets: '这里还没有资产', noAssetsHint: '上传媒体或完成一次生图后，资产会自动出现在这里。',
    loadMore: '加载更多', storage: '存储空间', assets: '项资产', rename: '名称', tags: '标签', collection: '分类（可多选）', noCollection: '未分类', save: '保存',
    download: '下载', useReference: 'AI修图', share: '共享', shareTeam: '共享到团队', shareIndividual: '共享给个人', selectTeam: '选择整个团队', selectTeamMember: '选择单个团队成员', userIdPlaceholder: '输入已注册用户 ID', removeShare: '移除权限',
    moveTrash: '移到回收站', restore: '恢复', close: '关闭', favoriteAction: '收藏', unfavorite: '取消收藏', processing: '正在处理', failed: '处理失败', ready: '可用',
    create: '创建', creating: '创建中', deleting: '删除中', cancel: '取消', confirmDelete: '确认删除', name: '名称', color: '颜色', createTeam: '新建与管理团队', addMember: '添加成员', teamName: '团队名称', memberEmail: '输入已注册用户邮箱', memberRole: '权限', viewer: '查看', editor: '编辑',
    copied: '已完成', collectionCreated: '分类创建成功', teamCreated: '团队创建成功', collectionDeleted: '分类删除成功', teamDeleted: '团队删除成功', createFailed: '创建失败，请重试。', deleteFailed: '删除失败，请重试。', memberAdded: '成员已加入团队。', memberRemoved: '成员已移除。', registeredUserRequired: '该邮箱或用户 ID 尚未注册，无法操作。', cannotShareSelf: '不能把资产共享给自己。', teamOwnerProtected: '团队所有者不能作为普通成员添加或移除。', noTeamMembers: '该团队暂无可管理成员。', updateFailed: '操作失败，请重试。', uploadFailed: '部分媒体上传或处理失败。', quotaExceeded: '资产空间不足。', unsupported: '不支持该文件格式。',
    deleteCollectionTitle: '删除分类？', deleteTeamTitle: '删除团队？', deleteCollectionHint: '分类中的资产不会被删除，将回到“未分类”。', deleteTeamHint: '团队成员关系和团队共享权限将被移除，原始资产不会删除。',
    multiSelect: '批量选择', exitMultiSelect: '退出多选', selectedCount: '已选', selectVisible: '全选', clearSelection: '清空选择', chooseCollection: '选择分类', assignCollection: '归入分类', assigningCollection: '保存中', bulkCollectionDone: (count) => `${count} 项资产已归入分类`, bulkCollectionFailed: '批量归类失败，请重试。',
    bulkDelete: '批量删除', bulkDeleteTitle: '删除所选资产？', bulkDeleteLabel: (count) => `${count} 项资产`, bulkDeleteHint: '所选资产将移入回收站，原始文件暂不物理删除。', bulkDeleteDone: (count) => `${count} 项资产已移入回收站`, bulkDeleteFailed: '批量删除失败，请重试。', bulkDeleteSharedBlocked: '所选内容包含他人共享资产，只能批量删除自己的资产。',
    projectLinked: '已加入项目', sharedDone: '共享完成', duration: '时长', size: '尺寸', original: '原始文件', preview: '预览文件', prompt: '提示词', promptHidden: '系统提示词已隐藏',
    folders: '分类', teams: '我的团队', clickPreview: '点击查看与管理',
    signInTitle: '登录后使用资产库', signInText: '资产按账户隔离，并可跨设备使用。', signIn: '登录', refresh: '刷新'
  },
  en: {
    title: 'Media Asset Center', subtitle: 'Manage images, video, and audio in one place', all: 'All', image: 'Images', video: 'Video', audio: 'Audio',
    upload: 'Uploads', generated: 'AI generated', project: 'Project assets', favorite: 'Favorites', shared: 'Shared', trash: 'Trash',
    search: 'Search asset name or category', uploadMedia: 'Upload media', uploading: 'Processing', allSources: 'All sources', sourceUpload: 'Local upload', sourceGenerated: 'AI result',
    folder: 'New category', team: 'Manage teams', noAssets: 'No assets here yet', noAssetsHint: 'Upload media or generate an image and it will appear here automatically.',
    loadMore: 'Load more', storage: 'Storage', assets: 'assets', rename: 'Name', tags: 'Tags', collection: 'Categories (multiple)', noCollection: 'Unsorted', save: 'Save',
    download: 'Download', useReference: 'AI Edit', share: 'Share', shareTeam: 'Share with team', shareIndividual: 'Share with person', selectTeam: 'Select the whole team', selectTeamMember: 'Select one team member', userIdPlaceholder: 'Enter a registered user ID', removeShare: 'Remove access',
    moveTrash: 'Move to trash', restore: 'Restore', close: 'Close', favoriteAction: 'Favorite', unfavorite: 'Unfavorite', processing: 'Processing', failed: 'Failed', ready: 'Ready',
    create: 'Create', creating: 'Creating', deleting: 'Deleting', cancel: 'Cancel', confirmDelete: 'Delete', name: 'Name', color: 'Color', createTeam: 'Create and manage teams', addMember: 'Add member', teamName: 'Team name', memberEmail: 'Enter a registered email', memberRole: 'Role', viewer: 'Viewer', editor: 'Editor',
    copied: 'Done', collectionCreated: 'Category created', teamCreated: 'Team created', collectionDeleted: 'Category deleted', teamDeleted: 'Team deleted', createFailed: 'Creation failed. Try again.', deleteFailed: 'Deletion failed. Try again.', memberAdded: 'Member added.', memberRemoved: 'Member removed.', registeredUserRequired: 'That email or user ID is not registered.', cannotShareSelf: 'You cannot share an asset with yourself.', teamOwnerProtected: 'The team owner cannot be added or removed as a regular member.', noTeamMembers: 'This team has no manageable members.', updateFailed: 'The action failed. Try again.', uploadFailed: 'Some media could not be uploaded or processed.', quotaExceeded: 'Asset storage quota exceeded.', unsupported: 'This file type is not supported.',
    deleteCollectionTitle: 'Delete category?', deleteTeamTitle: 'Delete team?', deleteCollectionHint: 'Assets in this category will not be deleted; they will return to Unsorted.', deleteTeamHint: 'Team membership and team-wide sharing will be removed. Original assets will remain.',
    multiSelect: 'Batch select', exitMultiSelect: 'Exit selection', selectedCount: 'Selected', selectVisible: 'Select visible', clearSelection: 'Clear', chooseCollection: 'Choose category', assignCollection: 'Assign category', assigningCollection: 'Saving', bulkCollectionDone: (count) => `${count} assets assigned to the category`, bulkCollectionFailed: 'Bulk category assignment failed. Try again.',
    bulkDelete: 'Delete selected', bulkDeleteTitle: 'Delete selected assets?', bulkDeleteLabel: (count) => `${count} assets`, bulkDeleteHint: 'Selected assets will move to Trash. Original files are not permanently deleted yet.', bulkDeleteDone: (count) => `${count} assets moved to Trash`, bulkDeleteFailed: 'Bulk deletion failed. Try again.', bulkDeleteSharedBlocked: 'The selection contains assets shared by other users. You can only delete your own assets.',
    projectLinked: 'Added to project', sharedDone: 'Shared', duration: 'Duration', size: 'Dimensions', original: 'Original', preview: 'Preview', prompt: 'Prompt', promptHidden: 'System prompt hidden',
    folders: 'Categories', teams: 'My teams', clickPreview: 'Click to preview and manage',
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

function AssetDetail({ asset, language, collections, teams, session, onClose, onUpdated, onPurged, onUseAsReference }) {
  const t = copy[language] || copy.en;
  const [draft, setDraft] = useState({ name: asset.name, tags: asset.tags.join(', '), collectionIds: asset.collectionIds || (asset.collectionId ? [asset.collectionId] : []) });
  const [shareMode, setShareMode] = useState('team');
  const [shareTeamId, setShareTeamId] = useState('');
  const [shareMemberId, setShareMemberId] = useState('');
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState('view');
  const [permissions, setPermissions] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft({ name: asset.name, tags: asset.tags.join(', '), collectionIds: asset.collectionIds || (asset.collectionId ? [asset.collectionId] : []) });
  }, [asset.id, asset.name, asset.tags, asset.collectionId, asset.collectionIds]);
  const teamMemberGroups = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    members: (team.members || []).filter((member) => member.userId && member.userId !== asset.ownerUserId)
  })).filter((team) => team.members.length);
  const shareableTeams = teams.filter((team) => team.role === 'owner' || team.role === 'editor');
  const activeShareTarget = shareMode === 'team' ? shareTeamId : (shareMemberId || shareUserId.trim());
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

  async function update(changes) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/assets/item?id=${encodeURIComponent(asset.id)}`, {
        method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify(changes)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      onUpdated(payload.asset);
      setDraft({ name: payload.asset.name, tags: payload.asset.tags.join(', '), collectionIds: payload.asset.collectionIds || (payload.asset.collectionId ? [payload.asset.collectionId] : []) });
      setMessage(t.copied);
    } catch { setMessage(t.updateFailed); } finally { setBusy(false); }
  }

  function toggleCollection(collectionId) {
    setDraft((current) => ({
      ...current,
      collectionIds: current.collectionIds.includes(collectionId)
        ? current.collectionIds.filter((id) => id !== collectionId)
        : [...current.collectionIds, collectionId]
    }));
  }

  async function share() {
    if (!activeShareTarget) return;
    setBusy(true); setMessage('');
    try {
      const body = {
        assetId: asset.id,
        principalType: shareMode === 'team' ? 'team' : 'user',
        principalId: activeShareTarget,
        permission: sharePermission
      };
      const response = await fetch('/api/assets/share', { method: 'POST', headers: authHeaders(session, true), body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error);
      const refreshed = await fetch(`/api/assets/share?assetId=${encodeURIComponent(asset.id)}`, { headers: authHeaders(session), cache: 'no-store' }).then((item) => item.json());
      if (refreshed?.ok) setPermissions(refreshed.permissions || []);
      setShareTeamId('');
      setShareMemberId('');
      setShareUserId('');
      setMessage(t.sharedDone);
    } catch (error) {
      if (error?.message === 'USER_NOT_FOUND') setMessage(t.registeredUserRequired);
      else if (error?.message === 'CANNOT_SHARE_WITH_SELF') setMessage(t.cannotShareSelf);
      else setMessage(t.updateFailed);
    } finally { setBusy(false); }
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
          <div className="mediaAssetCollectionPicker"><span>{t.collection}</span>{collections.length ? <div>{collections.map((item) => <label className={draft.collectionIds.includes(item.id) ? 'selected' : ''} key={item.id}><input type="checkbox" checked={draft.collectionIds.includes(item.id)} onChange={() => toggleCollection(item.id)} /><i style={{ background: item.color }} /><Folder size={14} /><b>{item.name}</b><Check size={14} /></label>)}</div> : <em>{t.noCollection}</em>}</div>
          <button className="mediaAssetPrimary" type="button" disabled={busy} onClick={() => update({ ...draft, tags: draft.tags.split(',') })}><Check size={16} />{t.save}</button>
          <dl className="mediaAssetFacts">
            <div><dt>{t.size}</dt><dd>{asset.width && asset.height ? `${asset.width}×${asset.height}` : '-'}</dd></div>
            <div><dt>{t.duration}</dt><dd>{asset.durationMs ? formatDuration(asset.durationMs) : '-'}</dd></div>
            <div><dt>{t.original}</dt><dd>{formatBytes(asset.fileSize)}</dd></div>
          </dl>
          {asset.prompt || asset.promptHidden ? <div className="mediaAssetPrompt"><strong>{t.prompt}</strong><p>{asset.promptHidden ? t.promptHidden : asset.prompt}</p></div> : null}
          <div className="mediaAssetActionGrid">
            <button className={asset.favorite ? 'favoriteActive' : ''} type="button" disabled={busy} aria-pressed={asset.favorite} onClick={() => update({ favorite: !asset.favorite })}><Heart size={16} fill={asset.favorite ? 'currentColor' : 'none'} />{asset.favorite ? t.unfavorite : t.favoriteAction}</button>
            <a href={asset.downloadUrl} download><Download size={16} />{t.download}</a>
            {asset.mediaType === 'image' && !asset.deletedAt ? <button type="button" onClick={() => onUseAsReference(asset)}><WandSparkles size={16} />{t.useReference}</button> : null}
            <button className={asset.deletedAt ? '' : 'danger'} type="button" onClick={() => update({ deleted: !asset.deletedAt })}>{asset.deletedAt ? <RotateCcw size={16} /> : <Trash2 size={16} />}{asset.deletedAt ? t.restore : t.moveTrash}</button>
            {asset.deletedAt ? <button className="danger" type="button" disabled={busy} onClick={purgeAsset}><Trash2 size={16} />{language === 'zh' ? '永久删除' : 'Delete permanently'}</button> : null}
          </div>
          {!asset.deletedAt && !asset.shared ? <div className="mediaAssetShareBox"><div><button className={shareMode === 'team' ? 'active' : ''} type="button" onClick={() => { setShareMode('team'); setShareMemberId(''); setShareUserId(''); }}>{t.shareTeam}</button><button className={shareMode === 'user' ? 'active' : ''} type="button" onClick={() => { setShareMode('user'); setShareTeamId(''); }}>{t.shareIndividual}</button></div>{shareMode === 'team' ? <select value={shareTeamId} onChange={(event) => setShareTeamId(event.target.value)}><option value="">{t.selectTeam}</option>{shareableTeams.map((team) => <option value={team.id} key={team.id}>{team.name} · {team.memberCount}</option>)}</select> : <div className="mediaAssetPersonalShareTargets"><select value={shareMemberId} onChange={(event) => { setShareMemberId(event.target.value); if (event.target.value) setShareUserId(''); }}><option value="">{t.selectTeamMember}</option>{teamMemberGroups.map((team) => <optgroup label={team.teamName} key={team.teamId}>{team.members.map((member) => <option value={member.userId} key={`${team.teamId}:${member.userId}`}>{member.fullName ? `${member.fullName} · ${member.email}` : member.email}</option>)}</optgroup>)}</select><input value={shareUserId} onChange={(event) => { setShareUserId(event.target.value); if (event.target.value) setShareMemberId(''); }} placeholder={t.userIdPlaceholder} autoComplete="off" /></div>}<select value={sharePermission} onChange={(event) => setSharePermission(event.target.value)}><option value="view">{t.viewer}</option><option value="edit">{t.editor}</option></select><button type="button" disabled={!activeShareTarget || busy} onClick={share}>{busy ? <LoaderCircle className="spinIcon" size={15} /> : <Share2 size={15} />}{t.share}</button>{permissions.length ? <ul className="mediaAssetPermissionList">{permissions.map((permission) => <li key={`${permission.principalType}:${permission.principalId}`}><span className="mediaAssetPermissionIdentity">{permission.principalType === 'team' ? <Users size={15} /> : <UserRound size={15} />}<strong>{permission.label}</strong></span><em>{permission.permission === 'edit' ? t.editor : t.viewer}</em><button className="mediaAssetPermissionRemove" type="button" disabled={busy} onClick={() => revokeShare(permission)} aria-label={`${t.removeShare}: ${permission.label}`} title={t.removeShare}><Trash2 size={14} /><span>{t.removeShare}</span></button></li>)}</ul> : null}</div> : null}
          {message ? <p className="mediaAssetMessage">{message}</p> : null}
        </div>
      </section>
    </div>
  );
}

export default function MediaAssetCenter({ language = 'zh', session, profile, onSignIn, onUseAsReference }) {
  const t = copy[language] || copy.en;
  const inputRef = useRef(null);
  const assetRequestRef = useRef({ sequence: 0, controller: null });
  const toastTimerRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [collectionId, setCollectionId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [query, setQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [collections, setCollections] = useState([]);
  const [teams, setTeams] = useState([]);
  const [stats, setStats] = useState({
    totalCount: 0,
    totalBytes: 0,
    imageBytes: 0,
    videoBytes: 0,
    audioBytes: 0,
    quotaBytes: 1
  });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sourceFilter, setSourceFilter] = useState('');
  const [message, setMessage] = useState('');
  const [createPanel, setCreatePanel] = useState('');
  const [createDraft, setCreateDraft] = useState({ name: '', color: '#5eead4', email: '', teamId: '', role: 'member' });
  const [pendingAction, setPendingAction] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [bulkCollectionId, setBulkCollectionId] = useState('');
  const signedIn = Boolean(session?.user || session?.access_token);

  const showToast = useCallback((type, text) => {
    if (toastTimerRef.current) globalThis.clearTimeout?.(toastTimerRef.current);
    setToast({ type, text });
    toastTimerRef.current = globalThis.setTimeout?.(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3600);
  }, []);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ limit: '48', offset: '0' });
    if (query.trim()) params.set('q', query.trim());
    if (['image', 'video', 'audio'].includes(filter)) params.set('mediaType', filter);
    const effectiveSource = ['upload', 'generated'].includes(filter) ? filter : sourceFilter;
    if (effectiveSource) params.set('sourceType', effectiveSource);
    if (filter === 'favorite') params.set('favorite', '1');
    if (filter === 'project') params.set('project', '1');
    if (filter === 'shared') params.set('shared', '1');
    if (filter === 'trash') params.set('deleted', '1');
    if (collectionId) params.set('collectionId', collectionId);
    if (teamId) params.set('teamId', teamId);
    return params;
  }, [filter, query, collectionId, teamId, sourceFilter]);

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
    if (['upload', 'generated'].includes(nextFilter)) setSourceFilter(nextFilter);
    setCollectionId(nextCollectionId);
    setTeamId(nextTeamId);
    setSelectionMode(false);
    setSelectedAssetIds([]);
    setBulkCollectionId('');
    setRefreshNonce((current) => current + 1);
  }

  function changeSourceFilter(nextSource) {
    assetRequestRef.current.controller?.abort();
    setSelectedAsset(null);
    setAssets([]);
    setHasMore(false);
    setOffset(0);
    setSourceFilter(nextSource);
    if (['upload', 'generated'].includes(filter)) setFilter('all');
    setSelectionMode(false);
    setSelectedAssetIds([]);
    setBulkCollectionId('');
    setRefreshNonce((current) => current + 1);
  }

  const loadSupportData = useCallback(async () => {
    if (!signedIn) return;
    const [collectionResponse, teamResponse] = await Promise.all([
      fetch('/api/assets/collections', { headers: authHeaders(session), cache: 'no-store' }),
      fetch('/api/assets/teams', { headers: authHeaders(session), cache: 'no-store' })
    ]);
    const [collectionPayload, teamPayload] = await Promise.all([
      collectionResponse.json().catch(() => ({})), teamResponse.json().catch(() => ({}))
    ]);
    if (collectionPayload.ok) setCollections(collectionPayload.collections || []);
    if (teamPayload.ok) setTeams(teamPayload.teams || []);
  }, [signedIn, session]);

  useEffect(() => { loadAssets(); }, [queryParams, signedIn, refreshNonce]);
  useEffect(() => { loadSupportData(); }, [signedIn]);
  useEffect(() => () => assetRequestRef.current.controller?.abort(), []);
  useEffect(() => () => {
    if (toastTimerRef.current) globalThis.clearTimeout?.(toastTimerRef.current);
  }, []);
  useEffect(() => {
    setSelectedAssetIds([]);
  }, [query]);
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
        const params = new URLSearchParams({ fileName: file.name, sourceType: 'upload' });
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
    const panel = createPanel;
    if (!createDraft.name.trim() || !panel || pendingAction) return;
    const endpoint = panel === 'team' ? '/api/assets/teams' : '/api/assets/collections';
    const body = panel === 'team' ? { name: createDraft.name } : { name: createDraft.name, type: 'folder', color: createDraft.color };
    setPendingAction(`create:${panel}`);
    setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: authHeaders(session, true), body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'CREATE_FAILED');
      await loadSupportData();
      if (panel === 'team') {
        setCreateDraft((current) => ({ ...current, name: '', email: '', teamId: payload.team?.id || current.teamId }));
      } else {
        setCreatePanel('');
        setCreateDraft({ name: '', color: '#5eead4', email: '', teamId: '', role: 'member' });
      }
      showToast('success', panel === 'team' ? t.teamCreated : t.collectionCreated);
    } catch {
      showToast('error', t.createFailed);
    } finally {
      setPendingAction('');
    }
  }

  async function addMember() {
    if (!createDraft.teamId || !createDraft.email) return;
    const response = await fetch('/api/assets/teams', { method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify({ teamId: createDraft.teamId, email: createDraft.email, role: createDraft.role }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setCreateDraft((current) => ({ ...current, email: '' }));
      setMessage(t.memberAdded);
      await loadSupportData();
    } else if (payload.error === 'USER_NOT_FOUND') setMessage(t.registeredUserRequired);
    else if (payload.error === 'TEAM_OWNER_REQUIRED') setMessage(t.teamOwnerProtected);
    else setMessage(t.updateFailed);
  }

  async function removeMember(teamId, userId) {
    const response = await fetch('/api/assets/teams', { method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify({ action: 'remove-member', teamId, userId }) });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setMessage(t.memberRemoved);
      await loadSupportData();
    } else if (payload.error === 'TEAM_OWNER_REQUIRED') setMessage(t.teamOwnerProtected);
    else setMessage(t.updateFailed);
  }

  async function confirmDelete() {
    if (!deleteTarget || pendingAction) return;
    const target = deleteTarget;
    setPendingAction(`delete:${target.kind}:${target.id}`);
    setMessage('');
    try {
      const response = target.kind === 'assets'
        ? await fetch('/api/assets/bulk-delete', { method: 'PATCH', headers: authHeaders(session, true), body: JSON.stringify({ assetIds: target.assetIds }) })
        : target.kind === 'team'
          ? await fetch('/api/assets/teams', { method: 'DELETE', headers: authHeaders(session, true), body: JSON.stringify({ teamId: target.id }) })
          : await fetch(`/api/assets/collections?id=${encodeURIComponent(target.id)}`, { method: 'DELETE', headers: authHeaders(session) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'DELETE_FAILED');
      if (target.kind === 'assets') {
        setAssets((current) => current.filter((asset) => !target.assetIds.includes(asset.id)));
        setSelectedAssetIds([]);
        await Promise.all([loadSupportData(), loadAssets()]);
        setDeleteTarget(null);
        showToast('success', t.bulkDeleteDone(Number(payload.deleted || target.assetIds.length)));
        return;
      }
      const wasActive = target.kind === 'team' ? teamId === target.id : collectionId === target.id;
      if (wasActive) selectAssetScope({ nextFilter: 'all' });
      if (target.kind === 'team' && createDraft.teamId === target.id) {
        setCreateDraft((current) => ({ ...current, teamId: '', email: '' }));
      }
      await loadSupportData();
      if (!wasActive) await loadAssets();
      setDeleteTarget(null);
      showToast('success', target.kind === 'team' ? t.teamDeleted : t.collectionDeleted);
    } catch (error) {
      showToast('error', error?.message === 'ASSET_NOT_OWNED' ? t.bulkDeleteSharedBlocked : target.kind === 'assets' ? t.bulkDeleteFailed : t.deleteFailed);
    } finally {
      setPendingAction('');
    }
  }

  function toggleAssetSelection(assetId) {
    setSelectedAssetIds((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : [...current, assetId]);
  }

  function selectAssetFromCard(assetId) {
    if (!selectionMode) setSelectionMode(true);
    toggleAssetSelection(assetId);
  }

  function toggleSelectionMode() {
    setSelectionMode((current) => {
      if (current) {
        setSelectedAssetIds([]);
        setBulkCollectionId('');
      }
      return !current;
    });
  }

  async function assignSelectedAssetsToCollection() {
    if (!selectedAssetIds.length || !bulkCollectionId || pendingAction) return;
    setPendingAction('bulk-collection');
    setMessage('');
    try {
      const response = await fetch('/api/assets/bulk-collection', {
        method: 'PATCH',
        headers: authHeaders(session, true),
        body: JSON.stringify({ assetIds: selectedAssetIds, collectionId: bulkCollectionId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'BULK_BRAND_UPDATE_FAILED');
      setAssets((current) => current.map((asset) => payload.assets?.find((item) => item.id === asset.id) || asset));
      await Promise.all([loadSupportData(), loadAssets()]);
      setSelectedAssetIds([]);
      showToast('success', t.bulkCollectionDone(Number(payload.updated || 0)));
    } catch {
      showToast('error', t.bulkCollectionFailed);
    } finally {
      setPendingAction('');
    }
  }

  function requestBulkDelete() {
    if (!selectedAssetIds.length || pendingAction) return;
    const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
    const currentUserId = String(session?.user?.id || profile?.id || '');
    if (currentUserId && selectedAssets.some((asset) => asset.ownerUserId !== currentUserId)) {
      showToast('error', t.bulkDeleteSharedBlocked);
      return;
    }
    setDeleteTarget({
      kind: 'assets',
      id: 'selection',
      assetIds: [...selectedAssetIds],
      count: selectedAssetIds.length,
      name: t.bulkDeleteLabel(selectedAssetIds.length)
    });
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
  const ownedTeams = teams.filter((team) => team.role === 'owner');
  const managedTeam = ownedTeams.find((team) => team.id === createDraft.teamId) || null;
  const manageableMembers = (managedTeam?.members || []).filter((member) => member.role !== 'owner');
  return (
    <section className="mediaAssetCenter">
      <header className="mediaAssetHero"><div><h1>{t.title}</h1></div><div className="mediaAssetUsage"><strong>{formatBytes(stats.totalBytes)} / {formatBytes(stats.quotaBytes)}</strong><span>{stats.totalCount} {t.assets}</span><i><b style={{ width: `${usagePercent}%` }} /></i></div></header>
      <div className="mediaAssetLayout">
        <aside className="mediaAssetSidebar">
          <nav>{FILTERS.map(([id, Icon]) => <button className={filter === id && !collectionId && !teamId ? 'active' : ''} type="button" onClick={() => selectAssetScope({ nextFilter: id })} key={id}><Icon size={16} /><span>{t[id]}</span>{id === 'image' ? <em>{stats.imageCount || 0}</em> : id === 'video' ? <em>{stats.videoCount || 0}</em> : id === 'audio' ? <em>{stats.audioCount || 0}</em> : null}</button>)}</nav>
          <div className="mediaAssetCollections"><strong>{t.folders}</strong>{collections.map((item) => <div className={collectionId === item.id && !teamId ? 'active' : ''} key={item.id}><button className="mediaAssetCollectionSelect" type="button" onClick={() => selectAssetScope({ nextCollectionId: item.id })}><span style={{ background: item.color }} /><Folder size={14} /><b>{item.name}</b><em>{item.assetCount}</em></button><button className="mediaAssetSidebarDelete" type="button" disabled={Boolean(pendingAction)} onClick={() => setDeleteTarget({ kind: 'collection', id: item.id, name: item.name })} aria-label={language === 'zh' ? `删除分类：${item.name}` : `Delete category: ${item.name}`}><Trash2 size={13} /></button></div>)}</div>
          <div className="mediaAssetTeams"><strong>{t.teams}</strong>{teams.map((team) => <div className={teamId === team.id ? 'active' : ''} key={team.id}><button className="mediaAssetTeamSelect" type="button" onClick={() => selectAssetScope({ nextTeamId: team.id })}><Users size={14} /><span>{team.name}</span><em>{team.assetCount}</em></button>{team.role === 'owner' ? <button className="mediaAssetSidebarDelete" type="button" disabled={Boolean(pendingAction)} onClick={() => setDeleteTarget({ kind: 'team', id: team.id, name: team.name })} aria-label={language === 'zh' ? `删除团队：${team.name}` : `Delete team: ${team.name}`}><Trash2 size={13} /></button> : null}</div>)}</div>
        </aside>
        <div className="mediaAssetMain">
          <div className="mediaAssetToolbar">
            <label className="mediaAssetSearch"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>
            <select value={sourceFilter} aria-label={language === 'zh' ? '媒资来源过滤' : 'Asset source filter'} onChange={(event) => changeSourceFilter(event.target.value)}><option value="">{t.allSources}</option><option value="upload">{t.sourceUpload}</option><option value="generated">{t.sourceGenerated}</option></select>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/mp4,audio/ogg" multiple hidden onChange={(event) => uploadFiles(event.target.files)} />
            <button className="mediaAssetUploadButton" type="button" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <LoaderCircle className="spinIcon" size={17} /> : <UploadCloud size={17} />}{uploading ? t.uploading : t.uploadMedia}</button>
            {filter === 'trash' && assets.length ? <button className="danger" type="button" onClick={emptyTrash}><Trash2 size={16} />{language === 'zh' ? '清空回收站' : 'Empty trash'}</button> : null}
            <button type="button" disabled={Boolean(pendingAction)} onClick={() => setCreatePanel('collection')}><FolderPlus size={16} />{t.folder}</button>
            <button type="button" disabled={Boolean(pendingAction)} onClick={() => setCreatePanel('team')}><Users size={16} />{t.team}</button>
            {filter !== 'trash' ? <button className={selectionMode ? 'active' : ''} type="button" disabled={Boolean(pendingAction)} onClick={toggleSelectionMode}><Check size={16} />{selectionMode ? t.exitMultiSelect : t.multiSelect}</button> : null}
            <button className="mediaAssetRefreshButton" type="button" onClick={() => { loadAssets(); loadSupportData(); }} aria-label={t.refresh}><RefreshCw size={17} /><span>{t.refresh}</span></button>
          </div>
          {selectionMode ? <div className="mediaAssetBulkBar">
            <strong>{t.selectedCount} {selectedAssetIds.length}</strong>
            <button type="button" disabled={!assets.length || Boolean(pendingAction)} onClick={() => setSelectedAssetIds(assets.map((asset) => asset.id))}>{t.selectVisible}</button>
            <button type="button" disabled={!selectedAssetIds.length || Boolean(pendingAction)} onClick={() => setSelectedAssetIds([])}>{t.clearSelection}</button>
            <select value={bulkCollectionId} disabled={Boolean(pendingAction)} onChange={(event) => setBulkCollectionId(event.target.value)}><option value="">{t.chooseCollection}</option>{collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select>
            <button className="mediaAssetPrimary" type="button" disabled={!selectedAssetIds.length || !bulkCollectionId || Boolean(pendingAction)} onClick={assignSelectedAssetsToCollection}>{pendingAction === 'bulk-collection' ? <LoaderCircle className="spinIcon" size={15} /> : <Folder size={15} />}{pendingAction === 'bulk-collection' ? t.assigningCollection : t.assignCollection}</button>
            <button className="mediaAssetBulkDelete danger" type="button" disabled={!selectedAssetIds.length || Boolean(pendingAction)} onClick={requestBulkDelete}><Trash2 size={15} />{t.bulkDelete}</button>
          </div> : null}
          {createPanel ? <div className={`mediaAssetCreatePanel ${createPanel === 'team' ? 'teamManager' : ''}`}>
            <div><strong>{createPanel === 'team' ? t.createTeam : t.folder}</strong><button type="button" disabled={Boolean(pendingAction)} onClick={() => setCreatePanel('')}><X size={15} /></button></div>
            <label><span>{t.name}</span><input value={createDraft.name} disabled={Boolean(pendingAction)} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            {createPanel !== 'team' ? <label><span>{t.color}</span><input type="color" value={createDraft.color} disabled={Boolean(pendingAction)} onChange={(event) => setCreateDraft((current) => ({ ...current, color: event.target.value }))} /></label> : null}
            <button className="mediaAssetPrimary" type="button" disabled={!createDraft.name.trim() || Boolean(pendingAction)} onClick={createCollectionOrTeam}>{pendingAction === `create:${createPanel}` ? <LoaderCircle className="spinIcon" size={15} /> : <Check size={15} />}{pendingAction === `create:${createPanel}` ? t.creating : t.create}</button>
            {createPanel === 'team' && ownedTeams.length ? <div className="mediaAssetMemberForm">
              <select value={createDraft.teamId} onChange={(event) => setCreateDraft((current) => ({ ...current, teamId: event.target.value }))}><option value="">{t.team}</option>{ownedTeams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select>
              <input type="email" value={createDraft.email} onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))} placeholder={t.memberEmail} />
              <select value={createDraft.role} onChange={(event) => setCreateDraft((current) => ({ ...current, role: event.target.value }))}><option value="member">{t.viewer}</option><option value="editor">{t.editor}</option></select>
              <button type="button" disabled={!createDraft.teamId || !createDraft.email.trim()} onClick={addMember}>{t.addMember}</button>
              {managedTeam ? <div className="mediaAssetMemberList">{manageableMembers.length ? manageableMembers.map((member) => <div className="mediaAssetMemberRow" key={member.userId}><span><b>{member.fullName || member.email}</b><small>{member.email}{member.fullName ? ` · ${member.userId}` : ` · ID ${member.userId}`}</small></span><em>{member.role === 'editor' ? t.editor : t.viewer}</em><button type="button" onClick={() => removeMember(managedTeam.id, member.userId)} aria-label={`${t.memberRemoved}: ${member.email}`}><X size={13} /></button></div>) : <p>{t.noTeamMembers}</p>}</div> : null}
            </div> : null}
          </div> : null}
          <div className="mediaAssetMetaBar">
            <span>{assets.length} / {stats.accessibleCount ?? stats.totalCount} {t.assets}</span>
            <small>{t.image} {formatBytes(stats.imageBytes)} · {t.video} {formatBytes(stats.videoBytes)} · {t.audio} {formatBytes(stats.audioBytes)}</small>
          </div>
          {message ? <p className="mediaAssetPageMessage">{message}</p> : null}
          {loading && !assets.length ? <div className="mediaAssetLoading"><LoaderCircle className="spinIcon" size={28} /></div> : null}
          {!loading && !assets.length ? <div className="mediaAssetEmpty"><HardDrive size={34} /><h2>{t.noAssets}</h2><p>{t.noAssetsHint}</p></div> : null}
          <div className="mediaAssetGrid">{assets.map((asset) => {
            const selected = selectedAssetIds.includes(asset.id);
            const collectionNames = (asset.collections || []).map((collection) => collection.name).join(' · ');
            return <article className={`mediaAssetCard ${asset.status} ${selectionMode ? 'selectionMode' : ''} ${selected ? 'selected' : ''}`} key={asset.id} onClick={() => selectionMode ? toggleAssetSelection(asset.id) : setSelectedAsset(asset)}><div className="mediaAssetCardMedia"><AssetMedia asset={asset} /><span className={`mediaTypeBadge ${asset.mediaType}`}>{t[asset.mediaType]}</span>{asset.favorite ? <Heart className="mediaAssetFavorite" size={16} fill="currentColor" /> : null}{filter !== 'trash' ? <button className="mediaAssetSelectionToggle" type="button" aria-pressed={selected} aria-label={selected ? t.clearSelection : t.multiSelect} onClick={(event) => { event.stopPropagation(); selectAssetFromCard(asset.id); }}>{selected ? <Check size={17} /> : null}</button> : null}</div><div className="mediaAssetCardBody"><strong title={asset.name}>{asset.name}</strong><span title={collectionNames}>{collectionNames || (asset.sourceType === 'generated' ? t.generated : t.upload)}</span><small>{asset.width && asset.height ? `${asset.width}×${asset.height}` : asset.durationMs ? formatDuration(asset.durationMs) : formatBytes(asset.fileSize)}</small></div><button type="button">{selectionMode ? (selected ? `${t.selectedCount} 1` : t.multiSelect) : t.clickPreview}</button></article>;
          })}</div>
          {hasMore ? <button className="mediaAssetLoadMore" type="button" disabled={loading} onClick={() => loadAssets({ append: true })}>{loading ? <LoaderCircle className="spinIcon" size={16} /> : null}{t.loadMore}</button> : null}
        </div>
      </div>
      {selectedAsset ? <AssetDetail asset={selectedAsset} language={language} collections={collections} teams={teams} session={session} onClose={() => setSelectedAsset(null)} onUpdated={(asset) => { updateAssetInState(asset); loadSupportData(); loadAssets(); }} onPurged={(assetId) => { setAssets((current) => current.filter((asset) => asset.id !== assetId)); setSelectedAsset(null); loadAssets(); }} onUseAsReference={(asset) => { onUseAsReference?.(asset); setSelectedAsset(null); }} /> : null}
      {deleteTarget ? <div className="mediaAssetConfirmOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !pendingAction && setDeleteTarget(null)}><div className="mediaAssetConfirmDialog" role="alertdialog" aria-modal="true" aria-labelledby="media-asset-delete-title"><span><Trash2 size={20} /></span><h2 id="media-asset-delete-title">{deleteTarget.kind === 'assets' ? t.bulkDeleteTitle : deleteTarget.kind === 'team' ? t.deleteTeamTitle : t.deleteCollectionTitle}</h2><strong>{deleteTarget.name}</strong><p>{deleteTarget.kind === 'assets' ? t.bulkDeleteHint : deleteTarget.kind === 'team' ? t.deleteTeamHint : t.deleteCollectionHint}</p><div><button type="button" disabled={Boolean(pendingAction)} onClick={() => setDeleteTarget(null)}>{t.cancel}</button><button className="danger" type="button" disabled={Boolean(pendingAction)} onClick={confirmDelete}>{pendingAction ? <LoaderCircle className="spinIcon" size={15} /> : <Trash2 size={15} />}{pendingAction ? t.deleting : t.confirmDelete}</button></div></div></div> : null}
      {toast ? <div className={`mediaAssetToast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>{toast.type === 'error' ? <CircleAlert size={17} /> : <Check size={17} />}<span>{toast.text}</span></div> : null}
    </section>
  );
}
