import { getAdminNotificationConfig } from './_lib/local-db.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const value = getAdminNotificationConfig();
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    notice: value.siteNoticeEnabled && value.siteNoticeBody
      ? {
          title: value.siteNoticeTitle,
          body: value.siteNoticeBody,
          format: value.siteNoticeFormat,
          placement: value.siteNoticePlacement,
          audience: value.audience,
          updatedAt: value.updatedAt
        }
      : null
  });
}
