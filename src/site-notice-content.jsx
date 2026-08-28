import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { inferSiteNoticeFormat } from '../shared/site-notice.js';

const NOTICE_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'a', 'hr'
];

export function renderSiteNoticeContent(value, format = 'markdown') {
  const source = String(value || '').trim();
  if (!source) return '';
  const markup = inferSiteNoticeFormat(source, format) === 'html'
    ? source
    : marked.parse(source, { async: false, breaks: true, gfm: true });
  return DOMPurify.sanitize(markup, {
    ALLOWED_TAGS: NOTICE_TAGS,
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['style']
  });
}

export default function SiteNoticeContent({ body, format, className = '' }) {
  const html = useMemo(() => renderSiteNoticeContent(body, format), [body, format]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
