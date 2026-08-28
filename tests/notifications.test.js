import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-notifications-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SESSION_SECRET = 'notification-test-secret';

const [db, { default: notificationsHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/notifications.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(token, method = 'GET', body = undefined) {
  let statusCode = 200;
  let payload;
  const res = { setHeader() {}, status(code) { statusCode = code; return this; }, json(value) { payload = value; return value; } };
  return Promise.resolve(notificationsHandler({ method, headers: token ? { cookie: `member_session=${encodeURIComponent(token)}` } : {}, query: {}, body }, res))
    .then(() => ({ statusCode, payload }));
}

test('bell notification center keeps read announcements and group invitations', async () => {
  const admin = db.createUser({ email: 'notice-admin@example.com', password: 'testing-1234', initialCredits: 100 });
  const member = db.createUser({ email: 'notice-member@example.com', password: 'testing-1234' });
  db.updateAdminNotificationConfig({
    siteNoticeEnabled: true,
    siteNoticeTitle: '系统通知',
    siteNoticeBody: '今晚更新。',
    siteNoticeFormat: 'markdown',
    audience: 'signed-in'
  }, admin.id);
  db.createGroupAccount(admin.id, '通知测试集团');
  db.inviteGroupMember(admin.id, member.email);
  const session = db.createSession(member.id);

  const initial = await invoke(session.token);
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.payload.unreadCount, 2);
  assert.deepEqual(initial.payload.notifications.map((item) => item.type).sort(), ['group_invitation', 'site_notice']);

  const invitation = initial.payload.notifications.find((item) => item.type === 'group_invitation');
  const read = await invoke(session.token, 'PATCH', { notificationId: invitation.id });
  assert.equal(read.payload.unreadCount, 1);
  assert.equal(read.payload.notifications.find((item) => item.id === invitation.id).unread, false);

  const allRead = await invoke(session.token, 'PATCH', { all: true });
  assert.equal(allRead.payload.unreadCount, 0);
  assert.equal(allRead.payload.notifications.length, 2);
});
