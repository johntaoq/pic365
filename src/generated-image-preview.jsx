import { useEffect, useState } from 'react';
import { generatedImagePreviewSources } from '../shared/image-thumbnails.js';

export default function GeneratedImagePreview({ item, ...props }) {
  const { thumbnail, preview } = generatedImagePreviewSources(item);
  const [ready, setReady] = useState(null);
  const [thumbnailRetry, setThumbnailRetry] = useState({ source: '', attempt: 0 });
  const retryUrl = (url, attempt) => attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url;
  const thumbnailAttempt = thumbnailRetry.source === thumbnail ? thumbnailRetry.attempt : 0;
  const previewReady = ready?.source === preview;

  useEffect(() => {
    if (!preview || preview === thumbnail) return undefined;
    let active = true;
    let timer;
    let attempt = 0;
    const image = new Image();
    const load = () => { image.src = retryUrl(preview, attempt); };
    image.onload = async () => {
      await image.decode?.().catch(() => undefined);
      if (active) setReady({ source: preview, url: image.src });
    };
    image.onerror = () => {
      if (active && attempt < 3) timer = setTimeout(load, 2000 * 2 ** attempt++);
    };
    load();
    return () => { active = false; clearTimeout(timer); image.onload = null; image.onerror = null; };
  }, [thumbnail, preview]);

  useEffect(() => {
    if (thumbnailRetry.source !== thumbnail || !thumbnailRetry.attempt || previewReady) return undefined;
    const timer = setTimeout(() => setThumbnailRetry((current) => ({ ...current, ready: true })), 2000 * 2 ** (thumbnailRetry.attempt - 1));
    return () => clearTimeout(timer);
  }, [thumbnail, thumbnailRetry.source, thumbnailRetry.attempt, previewReady]);

  return <img {...props}
    src={previewReady ? ready.url : retryUrl(thumbnail, thumbnailRetry.ready ? thumbnailAttempt : Math.max(0, thumbnailAttempt - 1))}
    onError={(event) => {
      props.onError?.(event);
      if (!previewReady && thumbnailAttempt < 3) setThumbnailRetry({ source: thumbnail, attempt: thumbnailAttempt + 1, ready: false });
    }}
  />;
}
