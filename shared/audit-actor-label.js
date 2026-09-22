import { ROLE_LABELS } from './admin-permissions.js';

export function auditActorLabel(event, language = 'zh') {
  if (event.actorType === 'system') return { name: 'system', detail: language === 'zh' ? '系统自动' : 'Automatic' };
  const name = event.actorName || event.actorEmail || event.actorUserId;
  return {
    name: name || (language === 'zh' ? '未知操作员' : 'Unknown actor'),
    detail: name ? (ROLE_LABELS[event.actorRole]?.[language] || event.actorRole || '')
      : (language === 'zh' ? '历史记录未记录身份' : 'Identity not recorded')
  };
}
