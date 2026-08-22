import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Heart,
  Images,
  LibraryBig,
  LoaderCircle,
  Search,
  Sparkles,
  UploadCloud,
  Users,
  X
} from 'lucide-react';

const copy = {
  zh: {
    title: '从资产库选择',
    subtitle: '只建立项目引用，不复制文件或重复占用存储。',
    search: '搜索图片名称、标签或提示词',
    collection: '全部文件夹与品牌库',
    all: '全部',
    uploads: '我上传的',
    generated: 'AI 生成',
    shared: '团队共享',
    favorite: '收藏',
    linked: '已在项目',
    selected: (count, max) => `已选 ${count}/${max} 张`,
    empty: '没有找到可用图片',
    loadMore: '加载更多',
    cancel: '取消',
    confirm: (count) => `加入项目（${count}）`,
    linking: '正在加入…',
    failed: '部分素材未能加入，请重试。',
    role: '当前素材角色',
    folder: '文件夹',
    brand: '品牌库'
  },
  en: {
    title: 'Choose from asset library',
    subtitle: 'Creates project references without copying files or using storage twice.',
    search: 'Search image names, tags, or prompts',
    collection: 'All folders and brand kits',
    all: 'All',
    uploads: 'Uploads',
    generated: 'AI generated',
    shared: 'Shared',
    favorite: 'Favorites',
    linked: 'In project',
    tooLarge: 'Over 5 MB',
    unsupported: 'Unsupported format',
    selected: (count, max) => `${count}/${max} selected`,
    empty: 'No available images found',
    loadMore: 'Load more',
    cancel: 'Cancel',
    confirm: (count) => `Add to project (${count})`,
    linking: 'Adding…',
    failed: 'Some assets could not be added. Try again.',
    role: 'Current asset role',
    folder: 'Folder',
    brand: 'Brand kit'
  }
};

const FILTERS = [
  ['all', Images],
  ['uploads', UploadCloud],
  ['generated', Sparkles],
  ['shared', Users],
  ['favorite', Heart]
];

function authHeaders(session) {
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export default function EcommerceAssetLibraryPicker({
  open,
  language = 'zh',
  session,
  assetTypeLabel,
  linkedAssetIds = [],
  maxSelectable = 9,
  maxFileBytes = Number.POSITIVE_INFINITY,
  allowedMimeTypes = [],
  onClose,
  onConfirm
}) {
  const t = copy[language] || copy.en;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [collectionId, setCollectionId] = useState('');
  const [collections, setCollections] = useState([]);
  const [assets, setAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState('');
  const linkedSet = useMemo(() => new Set(linkedAssetIds.filter(Boolean)), [linkedAssetIds]);
  const allowedMimeTypeSet = useMemo(() => new Set(allowedMimeTypes), [allowedMimeTypes.join('|')]);
  const selectableLimit = Math.max(0, Number(maxSelectable) || 0);

  const loadAssets = useCallback(async ({ append = false } = {}) => {
    if (!open) return;
    const nextOffset = append ? offset : 0;
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ mediaType: 'image', limit: '48', offset: String(nextOffset) });
      if (query.trim()) params.set('q', query.trim());
      if (collectionId) params.set('collectionId', collectionId);
      if (filter === 'uploads') params.set('sourceType', 'upload');
      if (filter === 'generated') params.set('sourceType', 'generated');
      if (filter === 'shared') params.set('shared', '1');
      if (filter === 'favorite') params.set('favorite', '1');
      const response = await fetch(`/api/assets?${params.toString()}`, {
        headers: authHeaders(session),
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'ASSET_LOAD_FAILED');
      setAssets((current) => append
        ? [...current, ...(payload.assets || []).filter((asset) => !current.some((item) => item.id === asset.id))]
        : payload.assets || []);
      setOffset(Number(payload.nextOffset || 0));
      setHasMore(Boolean(payload.hasMore));
    } catch {
      setMessage(t.failed);
    } finally {
      setLoading(false);
    }
  }, [collectionId, filter, offset, open, query, session, t.failed]);

  useEffect(() => {
    if (!open) return undefined;
    setSelectedIds([]);
    setMessage('');
    fetch('/api/assets/collections', { headers: authHeaders(session), cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => payload?.ok && setCollections(payload.collections || []))
      .catch(() => undefined);
    return undefined;
  }, [open, session]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = globalThis.setTimeout(() => loadAssets({ append: false }), 180);
    return () => globalThis.clearTimeout(timer);
  }, [open, query, filter, collectionId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !confirming) onClose?.();
    };
    globalThis.addEventListener?.('keydown', onKeyDown);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown);
  }, [confirming, onClose, open]);

  function toggleAsset(asset) {
    const assetId = asset.id;
    const unsupported = allowedMimeTypeSet.size > 0 && !allowedMimeTypeSet.has(asset.mimeType);
    if (linkedSet.has(assetId) || Number(asset.fileSize || 0) > maxFileBytes || unsupported) return;
    setSelectedIds((current) => {
      if (current.includes(assetId)) return current.filter((id) => id !== assetId);
      if (current.length >= selectableLimit) return current;
      return [...current, assetId];
    });
  }

  async function confirmSelection() {
    if (!selectedIds.length || confirming) return;
    setConfirming(true);
    setMessage('');
    try {
      await onConfirm?.(selectedIds);
      onClose?.();
    } catch {
      setMessage(t.failed);
    } finally {
      setConfirming(false);
    }
  }

  if (!open) return null;

  return (
    <div className="ecommerceAssetLibraryOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !confirming && onClose?.()}>
      <section className="ecommerceAssetLibraryPicker" role="dialog" aria-modal="true" aria-label={t.title}>
        <header>
          <div><span><LibraryBig size={18} /></span><div><h2>{t.title}</h2><p>{t.subtitle}</p></div></div>
          <button type="button" onClick={onClose} disabled={confirming} aria-label={t.cancel}><X size={19} /></button>
        </header>
        <div className="ecommerceAssetLibraryToolbar">
          <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} /></label>
          <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
            <option value="">{t.collection}</option>
            {collections.map((collection) => <option value={collection.id} key={collection.id}>{collection.type === 'brand' ? `◆ ${collection.name}` : collection.name}</option>)}
          </select>
        </div>
        <div className="ecommerceAssetLibraryFilters" role="tablist" aria-label={t.title}>
          {FILTERS.map(([id, Icon]) => <button className={filter === id ? 'active' : ''} type="button" onClick={() => setFilter(id)} key={id}><Icon size={14} />{t[id]}</button>)}
        </div>
        <div className="ecommerceAssetLibraryMeta"><span>{t.role}：<strong>{assetTypeLabel}</strong></span><em>{t.selected(selectedIds.length, selectableLimit)}</em></div>
        <div className="ecommerceAssetLibraryGrid">
          {assets.map((asset) => {
            const linked = linkedSet.has(asset.id);
            const tooLarge = Number(asset.fileSize || 0) > maxFileBytes;
            const unsupported = allowedMimeTypeSet.size > 0 && !allowedMimeTypeSet.has(asset.mimeType);
            const selected = selectedIds.includes(asset.id);
            return (
              <button className={`${selected ? 'selected' : ''} ${linked ? 'linked' : ''} ${tooLarge || unsupported ? 'unavailable' : ''}`.trim()} type="button" disabled={linked || tooLarge || unsupported} aria-pressed={selected} onClick={() => toggleAsset(asset)} key={asset.id}>
                <span className="ecommerceAssetLibraryThumb"><img src={asset.thumbnailUrl || asset.previewUrl || asset.originalUrl} alt={asset.name} loading="lazy" decoding="async" />{selected ? <i><Check size={15} /></i> : null}{linked ? <b>{t.linked}</b> : tooLarge ? <b>{t.tooLarge || (language === 'zh' ? '超过 5 MB' : 'Over 5 MB')}</b> : unsupported ? <b>{t.unsupported || (language === 'zh' ? '格式不支持' : 'Unsupported format')}</b> : null}</span>
                <strong title={asset.name}>{asset.name}</strong>
                <small>{asset.collectionName || (asset.shared ? t.shared : asset.sourceType === 'generated' ? t.generated : t.uploads)}</small>
              </button>
            );
          })}
          {!loading && !assets.length ? <div className="ecommerceAssetLibraryEmpty"><Images size={28} /><span>{t.empty}</span></div> : null}
        </div>
        {loading ? <div className="ecommerceAssetLibraryLoading"><LoaderCircle className="spin" size={20} /></div> : null}
        {hasMore ? <button className="ecommerceAssetLibraryMore" type="button" disabled={loading} onClick={() => loadAssets({ append: true })}>{t.loadMore}</button> : null}
        {message ? <p className="ecommerceAssetLibraryMessage">{message}</p> : null}
        <footer>
          <button type="button" onClick={onClose} disabled={confirming}>{t.cancel}</button>
          <button className="primary" type="button" onClick={confirmSelection} disabled={!selectedIds.length || confirming}>{confirming ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{confirming ? t.linking : t.confirm(selectedIds.length)}</button>
        </footer>
      </section>
    </div>
  );
}
