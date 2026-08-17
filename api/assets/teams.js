import { authenticateRequest } from '../_lib/local-auth.js';
import { addTeamMember, createTeam, deleteTeam, listTeams, removeTeamMember } from '../_lib/media-assets.js';
import { readJsonBody } from '../_lib/request.js';

function json(res, status, payload) {
  res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }
  const auth = authenticateRequest(req);
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });
  if (req.method === 'GET') return json(res, 200, { ok: true, teams: listTeams(auth.user.id) });
  const body = await readJsonBody(req).catch(() => ({}));
  try {
    if (req.method === 'POST') return json(res, 201, { ok: true, team: createTeam(auth.user.id, body.name) });
    if (req.method === 'DELETE') {
      const teamId = String(body.teamId || req.query?.teamId || '');
      const removed = deleteTeam(auth.user.id, teamId);
      return removed ? json(res, 200, { ok: true }) : json(res, 404, { ok: false, error: 'TEAM_NOT_FOUND' });
    }
    if (body.action === 'remove-member') {
      const removed = removeTeamMember(auth.user.id, String(body.teamId || ''), String(body.userId || ''));
      return removed ? json(res, 200, { ok: true }) : json(res, 404, { ok: false, error: 'TEAM_MEMBER_NOT_FOUND' });
    }
    const member = addTeamMember(auth.user.id, String(body.teamId || ''), body.email, body.role);
    return json(res, 200, { ok: true, member });
  } catch (error) {
    const code = error?.code || 'TEAM_UPDATE_FAILED';
    return json(res, code.endsWith('NOT_FOUND') ? 404 : 400, { ok: false, error: code });
  }
}
