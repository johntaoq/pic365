import {
  completeCreditReservation,
  createGeneration,
  getUserProfile,
  releaseCreditReservation,
  reserveCredit,
  updateGeneration
} from './_lib/local-db.js';
import { authenticateRequest } from './_lib/local-auth.js';
import { readJsonBody } from './_lib/request.js';
import { generateImage as generateProviderImage, isContentModerationError, isProviderConfigured } from './_lib/provider.js';
import { persistImage } from './_lib/storage.js';

const MAX_PROMPT_LENGTH = 6000;
const GUEST_GENERATION_COOKIE = 'gpt_image_guest_generation';
const GUEST_GENERATION_MAX_AGE = 60 * 60 * 24 * 365;

function json(res, status, payload) {
  res.status(status).json(payload);
}

function readCookies(req) {
  const header = req.headers?.cookie || req.headers?.Cookie || '';
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, decodeURIComponent(value.join('='))])
  );
}

function hasUsedGuestGeneration(req) {
  return readCookies(req)[GUEST_GENERATION_COOKIE] === '1';
}

function markGuestGenerationUsed(req, res) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const secureFlag = forwardedProto === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${GUEST_GENERATION_COOKIE}=1; Path=/; Max-Age=${GUEST_GENERATION_MAX_AGE}; HttpOnly; SameSite=Lax${secureFlag}`
  );
}

function hasFullWorkspaceAccess(profile) {
  return Boolean(profile?.isSuperAdmin || Number(profile?.creditBalance || 0) > 0);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (!isProviderConfigured()) return json(res, 500, { ok: false, error: 'SERVER_NOT_CONFIGURED' });

  const auth = authenticateRequest(req, { allowAnonymous: true });
  if (auth.error) return json(res, auth.status || 401, { ok: false, error: auth.error });

  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      authRequired: false,
      guestAllowed: !hasUsedGuestGeneration(req),
      guestFreeUsed: hasUsedGuestGeneration(req),
      fullWorkspace: hasFullWorkspaceAccess(auth.profile),
      user: auth.profile || null
    });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return json(res, 400, { ok: false, error: 'INVALID_PROMPT' });
  }

  const prompt = String(body.prompt || '').trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return json(res, 400, { ok: false, error: 'INVALID_PROMPT' });

  if (!auth.user || !auth.profile) {
    if (hasUsedGuestGeneration(req)) {
      return json(res, 402, { ok: false, error: 'GUEST_FREE_LIMIT_REACHED', guest: true, downloadAllowed: false });
    }
    try {
      const providerResult = await generateProviderImage({ prompt, size: '1024x1024', quality: 'low' });
      markGuestGenerationUsed(req, res);
      return json(res, 200, {
        ok: true,
        guest: true,
        generationId: null,
        image: providerResult.image,
        size: '1024x1024',
        quality: 'low',
        cloudSaved: false,
        downloadAllowed: false
      });
    } catch (error) {
      const moderationBlocked = isContentModerationError(error);
      console.warn('Guest image generation failed', {
        status: error?.status || null,
        moderationBlocked,
        message: String(error?.message || 'unknown').slice(0, 240)
      });
      return json(res, moderationBlocked ? 422 : error?.status === 429 ? 503 : 502, {
        ok: false,
        error: moderationBlocked ? 'CONTENT_MODERATION_BLOCKED' : error?.status === 429 ? 'UPSTREAM_BUSY' : 'GENERATION_FAILED',
        guest: true,
        downloadAllowed: false
      });
    }
  }

  if (!hasFullWorkspaceAccess(auth.profile)) return json(res, 402, { ok: false, error: 'CREDITS_REQUIRED' });

  const parsedCaseId = Number(body.caseId);
  const caseId = Number.isFinite(parsedCaseId) ? parsedCaseId : null;
  const size = ['1024x1024', '1024x1536', '1536x1024'].includes(body.size) ? body.size : '1024x1024';
  const quality = body.quality === 'medium' ? 'medium' : 'low';
  let reservation;
  try {
    reservation = reserveCredit(auth.user.id, { caseId, prompt });
  } catch (error) {
    if (error?.code === 'CREDITS_REQUIRED') return json(res, 402, { ok: false, error: 'CREDITS_REQUIRED' });
    console.warn('Failed to reserve local credit', { userId: auth.user.id, message: String(error?.message || 'unknown').slice(0, 240) });
    return json(res, 500, { ok: false, error: 'GENERATION_FAILED' });
  }

  let generationId;
  try {
    generationId = createGeneration({
      userId: auth.user.id,
      reservationId: reservation.reservationId,
      caseId,
      prompt,
      model: process.env.AI_IMAGE_MODEL || 'gpt-image-2',
      size,
      quality,
      provider: process.env.AI_PROVIDER || 'unikeyx'
    });
  } catch (error) {
    releaseCreditReservation(reservation.reservationId, 'GENERATION_RECORD_FAILED');
    console.warn('Failed to create local generation record', { userId: auth.user.id, message: String(error?.message || 'unknown').slice(0, 240) });
    return json(res, 500, { ok: false, error: 'GENERATION_FAILED' });
  }

  try {
    const providerResult = await generateProviderImage({ prompt, size, quality });
    const storedImage = await persistImage({ userId: auth.user.id, generationId, image: providerResult.image });
    updateGeneration(generationId, {
      status: 'succeeded',
      provider_request_id: providerResult.providerRequestId,
      storage_path: storedImage.storagePath,
      output_url: storedImage.url,
      completed_at: new Date().toISOString()
    });
    completeCreditReservation(reservation.reservationId);
    return json(res, 200, {
      ok: true,
      generationId,
      image: storedImage.url,
      size,
      quality,
      cloudSaved: storedImage.backend === 'azure-blob',
      storageBackend: storedImage.backend,
      downloadAllowed: true,
      user: getUserProfile(auth.user.id)
    });
  } catch (error) {
    const moderationBlocked = isContentModerationError(error);
    console.warn('Image generation failed', {
      status: error?.status || null,
      code: error?.code || null,
      moderationBlocked,
      message: String(error?.message || 'unknown').slice(0, 240)
    });
    const errorCode = moderationBlocked ? 'CONTENT_MODERATION_BLOCKED' : error?.status === 429 ? 'UPSTREAM_BUSY' : 'GENERATION_FAILED';
    updateGeneration(generationId, {
      status: 'failed',
      provider_request_id: error?.providerRequestId || null,
      error_code: errorCode,
      completed_at: new Date().toISOString()
    });
    releaseCreditReservation(reservation.reservationId, errorCode);
    return json(res, moderationBlocked ? 422 : error?.status === 429 ? 503 : 502, {
      ok: false,
      error: errorCode,
      user: getUserProfile(auth.user.id)
    });
  }
}
