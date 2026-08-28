import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-group-api-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.SESSION_SECRET = 'group-api-test-secret';

const [db, { default: groupsHandler }] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/groups.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function invoke(token, method = 'GET', body = undefined) {
  let statusCode = 200;
  let payload;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return value; }
  };
  return Promise.resolve(groupsHandler({
    method,
    headers: token ? { cookie: `member_session=${encodeURIComponent(token)}` } : {},
    query: {},
    body
  }, res)).then(() => ({ statusCode, payload }));
}

test('group API completes create, invite, accept, funding and budget assignment', async () => {
  const admin = db.createUser({ email: 'api-group-admin@example.com', password: 'testing-1234', initialCredits: 500 });
  const member = db.createUser({ email: 'api-group-member@example.com', password: 'testing-1234' });
  const adminSession = db.createSession(admin.id);
  const memberSession = db.createSession(member.id);

  const created = await invoke(adminSession.token, 'POST', { action: 'create', name: 'API 集团' });
  assert.equal(created.statusCode, 200);
  assert.equal(created.payload.membership.role, 'admin');

  const funded = await invoke(adminSession.token, 'POST', { action: 'fund', amount: 300, requestId: 'api-fund' });
  assert.equal(funded.payload.membership.balance, 300);
  assert.equal(funded.payload.user.personalCreditBalance, 200);

  const invited = await invoke(adminSession.token, 'POST', { action: 'invite', email: member.email });
  const invitationId = invited.payload.membership.outgoingInvitations[0].id;
  const memberView = await invoke(memberSession.token);
  assert.equal(memberView.payload.invitations[0].id, invitationId);

  const accepted = await invoke(memberSession.token, 'POST', { action: 'respond-invitation', invitationId, accept: true });
  assert.equal(accepted.payload.membership.role, 'member');
  const budget = await invoke(adminSession.token, 'POST', { action: 'adjust-budget', userId: member.id, amount: 120, requestId: 'api-budget' });
  assert.equal(budget.payload.membership.adminAvailable, 180);
  assert.equal(db.getUserProfile(member.id).creditBalance, 120);
});

test('group API rejects unauthenticated access and member administration', async () => {
  const anonymous = await invoke('', 'GET');
  assert.equal(anonymous.statusCode, 401);
  const member = db.getUserByEmail('api-group-member@example.com');
  const memberSession = db.createSession(member.id);
  const forbidden = await invoke(memberSession.token, 'POST', { action: 'invite', email: 'nobody@example.com' });
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.payload.error, 'GROUP_ADMIN_REQUIRED');
});
