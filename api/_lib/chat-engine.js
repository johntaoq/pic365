import { randomUUID } from 'node:crypto';
import {
  calculateChatChargeCenti,
  DEFAULT_CHAT_PRICING_RMB_PER_MILLION,
  normalizeChatPricing,
  normalizeChatUsage,
  parseTieredPricingExpression,
  priceMicrosToRmb,
  priceRmbToMicros
} from '../../shared/chat-billing.js';
import {
  bindDefaultSystemGroupChannel,
  filterProvidersForUser,
  getDb,
  getUserProfile,
  reserveCreditCenti,
  settleCreditReservationInTransaction,
  userCanAccessProvider
} from './local-db.js';
import { decryptProviderSecret, encryptProviderSecret, maskProviderSecret } from './provider-secrets.js';

const DEFAULT_CHAT_MODEL = 'gpt-5.6-luna';
const DEFAULT_CHAT_NAME = '5.6-luna';
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_CHARACTERS = 48_000;
const DEFAULT_SYSTEM_PROMPT = [
  '你是 Pic365 的聊天精灵。',
  '请直接、准确地回答用户问题，并结合用户上传的图片进行识别、分析或建议。',
  '不要声称执行了没有实际执行的操作；涉及站内功能时，明确告诉用户下一步。',
  '回答默认简洁，除非用户要求详细说明。'
].join('\n');

function now() {
  return new Date().toISOString();
}

function clean(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength);
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function normalizeProviderRow(row, includeSecret = false) {
  if (!row) return null;
  const pricing = normalizeChatPricing({
    input: priceMicrosToRmb(row.input_price_microyuan),
    output: priceMicrosToRmb(row.output_price_microyuan),
    cacheRead: priceMicrosToRmb(row.cache_read_price_microyuan),
    cacheWrite: priceMicrosToRmb(row.cache_write_price_microyuan)
  });
  const result = {
    id: row.id,
    name: row.name,
    providerType: row.provider_type || 'openai-compatible',
    baseUrl: row.base_url,
    model: row.model,
    systemPrompt: row.system_prompt || DEFAULT_SYSTEM_PROMPT,
    maxOutputTokens: Math.max(128, Math.min(16_384, Number(row.max_output_tokens) || DEFAULT_MAX_OUTPUT_TOKENS)),
    pricing,
    pricingSource: row.pricing_source || 'manual',
    pricingVersion: row.pricing_version || '',
    exchangeRate: priceMicrosToRmb(row.exchange_rate_micros || priceRmbToMicros(7)),
    priceSyncedAt: row.price_synced_at || '',
    enabled: Boolean(row.enabled),
    isDefault: Boolean(row.is_default),
    hasApiKey: Boolean(row.api_key_encrypted),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  };
  if (includeSecret) result.apiKey = decryptProviderSecret(row.api_key_encrypted);
  else {
    let rawKey = '';
    try { rawKey = decryptProviderSecret(row.api_key_encrypted); } catch { rawKey = ''; }
    result.apiKeyMasked = maskProviderSecret(rawKey);
  }
  return result;
}

function sourceImageProvider(db) {
  return db.prepare(`
    SELECT base_url, api_key_encrypted
    FROM image_provider_configs
    WHERE enabled = 1 AND api_key_encrypted != ''
    ORDER BY CASE WHEN lower(model) LIKE 'gpt-%' THEN 0 ELSE 1 END, is_default DESC, created_at ASC
    LIMIT 1
  `).get();
}

export function ensureDefaultChatProviderConfig() {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM chat_provider_configs LIMIT 1').get();
  if (existing) return normalizeProviderRow(db.prepare('SELECT * FROM chat_provider_configs WHERE id = ?').get(existing.id));
  const source = sourceImageProvider(db);
  const environmentApiKey = process.env.CHAT_PROVIDER_API_KEY
    || process.env.COPILOT_PROVIDER_API_KEY
    || process.env.UNIKEYX_COPILOT_API_KEY
    || '';
  const apiKeyEncrypted = environmentApiKey
    ? encryptProviderSecret(environmentApiKey)
    : source?.api_key_encrypted
      || (process.env.AI_API_KEY || process.env.UNIKEYX_API_KEY
      ? encryptProviderSecret(process.env.AI_API_KEY || process.env.UNIKEYX_API_KEY)
      : '');
  if (!apiKeyEncrypted) return null;
  const createdAt = now();
  const id = randomUUID();
  const pricing = DEFAULT_CHAT_PRICING_RMB_PER_MILLION;
  db.prepare(`
    INSERT INTO chat_provider_configs
      (id, name, provider_type, base_url, api_key_encrypted, model, system_prompt, max_output_tokens,
       input_price_microyuan, output_price_microyuan, cache_read_price_microyuan, cache_write_price_microyuan,
       exchange_rate_micros, pricing_source, enabled, is_default, created_at, updated_at)
    VALUES (?, ?, 'openai-compatible', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, 1, ?, ?)
  `).run(
    id,
    DEFAULT_CHAT_NAME,
    process.env.CHAT_PROVIDER_BASE_URL
      || process.env.COPILOT_PROVIDER_BASE_URL
      || source?.base_url
      || process.env.AI_BASE_URL
      || process.env.UNIKEYX_BASE_URL
      || 'https://www.unikeyx.com',
    apiKeyEncrypted,
    process.env.CHAT_PROVIDER_MODEL || DEFAULT_CHAT_MODEL,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_MAX_OUTPUT_TOKENS,
    priceRmbToMicros(pricing.input),
    priceRmbToMicros(pricing.output),
    priceRmbToMicros(pricing.cacheRead),
    priceRmbToMicros(pricing.cacheWrite),
    priceRmbToMicros(7),
    createdAt,
    createdAt
  );
  bindDefaultSystemGroupChannel('chat', id);
  return normalizeProviderRow(db.prepare('SELECT * FROM chat_provider_configs WHERE id = ?').get(id));
}

export function listChatProviderConfigs({ admin = false, userId = '' } = {}) {
  ensureDefaultChatProviderConfig();
  const rows = getDb().prepare(`SELECT * FROM chat_provider_configs ${admin ? '' : 'WHERE enabled = 1'} ORDER BY is_default DESC, created_at ASC`).all();
  const providers = rows.map((row) => {
    const provider = normalizeProviderRow(row);
    if (admin) return provider;
    return {
      id: provider.id,
      name: provider.name,
      model: provider.model,
      enabled: provider.enabled
    };
  });
  return admin ? providers : filterProvidersForUser(providers, userId, 'chat');
}

export function getChatProviderConfig(providerId = '', { includeSecret = true, userId = '' } = {}) {
  ensureDefaultChatProviderConfig();
  const db = getDb();
  const rows = providerId
    ? [db.prepare('SELECT * FROM chat_provider_configs WHERE id = ? AND enabled = 1').get(providerId)].filter(Boolean)
    : db.prepare('SELECT * FROM chat_provider_configs WHERE enabled = 1 ORDER BY is_default DESC, created_at ASC').all();
  const row = userId ? rows.find((item) => userCanAccessProvider(userId, 'chat', item.id)) : rows[0];
  return normalizeProviderRow(row, includeSecret);
}

export function saveChatProviderConfig(values = {}) {
  const db = getDb();
  const id = clean(values.id, 80) || randomUUID();
  const existing = db.prepare('SELECT * FROM chat_provider_configs WHERE id = ?').get(id);
  const previous = normalizeProviderRow(existing);
  const apiKeyEncrypted = values.apiKey
    ? encryptProviderSecret(clean(values.apiKey, 2000))
    : existing?.api_key_encrypted || '';
  if (!apiKeyEncrypted) throw Object.assign(new Error('API_KEY_REQUIRED'), { code: 'API_KEY_REQUIRED' });
  const pricing = normalizeChatPricing(values.pricing || previous?.pricing || DEFAULT_CHAT_PRICING_RMB_PER_MILLION);
  const updatedAt = now();
  const enabled = values.enabled !== false;
  const isDefault = values.isDefault !== false;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (isDefault) db.prepare('UPDATE chat_provider_configs SET is_default = 0').run();
    db.prepare(`
      INSERT INTO chat_provider_configs
        (id, name, provider_type, base_url, api_key_encrypted, model, system_prompt, max_output_tokens,
         input_price_microyuan, output_price_microyuan, cache_read_price_microyuan, cache_write_price_microyuan,
         exchange_rate_micros, pricing_source, pricing_version, price_synced_at, enabled, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, provider_type=excluded.provider_type, base_url=excluded.base_url,
        api_key_encrypted=excluded.api_key_encrypted, model=excluded.model, system_prompt=excluded.system_prompt,
        max_output_tokens=excluded.max_output_tokens, input_price_microyuan=excluded.input_price_microyuan,
        output_price_microyuan=excluded.output_price_microyuan,
        cache_read_price_microyuan=excluded.cache_read_price_microyuan,
        cache_write_price_microyuan=excluded.cache_write_price_microyuan,
        exchange_rate_micros=excluded.exchange_rate_micros, pricing_source=excluded.pricing_source,
        pricing_version=excluded.pricing_version, price_synced_at=excluded.price_synced_at,
        enabled=excluded.enabled, is_default=excluded.is_default, updated_at=excluded.updated_at
    `).run(
      id,
      clean(values.name, 80) || previous?.name || DEFAULT_CHAT_NAME,
      clean(values.providerType, 60) || previous?.providerType || 'openai-compatible',
      clean(values.baseUrl, 500).replace(/\/+$/, '') || previous?.baseUrl || 'https://www.unikeyx.com',
      apiKeyEncrypted,
      clean(values.model, 160) || previous?.model || DEFAULT_CHAT_MODEL,
      clean(values.systemPrompt, 8000) || previous?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      Math.max(128, Math.min(16_384, Math.round(Number(values.maxOutputTokens ?? previous?.maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS))),
      priceRmbToMicros(pricing.input),
      priceRmbToMicros(pricing.output),
      priceRmbToMicros(pricing.cacheRead),
      priceRmbToMicros(pricing.cacheWrite),
      priceRmbToMicros(values.exchangeRate ?? previous?.exchangeRate ?? 7),
      clean(values.pricingSource, 24) || previous?.pricingSource || 'manual',
      clean(values.pricingVersion, 160) || previous?.pricingVersion || '',
      values.priceSyncedAt === null ? null : clean(values.priceSyncedAt, 80) || previous?.priceSyncedAt || null,
      enabled ? 1 : 0,
      isDefault ? 1 : 0,
      existing?.created_at || updatedAt,
      updatedAt
    );
    if (!db.prepare('SELECT id FROM chat_provider_configs WHERE enabled = 1 AND is_default = 1 LIMIT 1').get()) {
      db.prepare('UPDATE chat_provider_configs SET is_default = 1 WHERE id = (SELECT id FROM chat_provider_configs WHERE enabled = 1 ORDER BY created_at ASC LIMIT 1)').run();
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return normalizeProviderRow(db.prepare('SELECT * FROM chat_provider_configs WHERE id = ?').get(id));
}

function providerRoot(baseUrl) {
  return clean(baseUrl, 500).replace(/\/+$/, '').replace(/\/v1$/i, '');
}

async function fetchJson(url, fetchImpl, signal) {
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw Object.assign(new Error('PRICE_SYNC_FAILED'), { code: 'PRICE_SYNC_FAILED', status: response.status });
  }
  return payload;
}

export async function synchronizeChatProviderPricing(providerId, { fetchImpl = fetch } = {}) {
  const provider = getChatProviderConfig(providerId, { includeSecret: false });
  if (!provider) throw Object.assign(new Error('CHAT_PROVIDER_NOT_FOUND'), { code: 'CHAT_PROVIDER_NOT_FOUND' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const root = providerRoot(provider.baseUrl);
    const [pricingPayload, statusPayload] = await Promise.all([
      fetchJson(`${root}/api/pricing`, fetchImpl, controller.signal),
      fetchJson(`${root}/api/status`, fetchImpl, controller.signal).catch(() => ({ data: {} }))
    ]);
    const models = Array.isArray(pricingPayload?.data) ? pricingPayload.data : [];
    const row = models.find((item) => String(item?.model_name || item?.model || '') === provider.model);
    if (!row) throw Object.assign(new Error('MODEL_PRICE_NOT_FOUND'), { code: 'MODEL_PRICE_NOT_FOUND' });
    const usdRates = parseTieredPricingExpression(row.billing_expr);
    if (!usdRates) throw Object.assign(new Error('UNSUPPORTED_PRICE_FORMAT'), { code: 'UNSUPPORTED_PRICE_FORMAT' });
    const exchangeRate = Math.max(0.000001, Number(statusPayload?.data?.usd_exchange_rate) || provider.exchangeRate || 1);
    const pricing = Object.fromEntries(Object.entries(usdRates).map(([key, amount]) => [key, amount * exchangeRate]));
    return saveChatProviderConfig({
      ...provider,
      pricing,
      exchangeRate,
      pricingSource: 'synced',
      pricingVersion: clean(pricingPayload?.pricing_version, 160),
      priceSyncedAt: now()
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildProviderUrl(baseUrl, pathname) {
  const root = clean(baseUrl, 500).replace(/\/+$/, '');
  return `${root.endsWith('/v1') ? root : `${root}/v1`}/${String(pathname || '').replace(/^\/+/, '')}`;
}

function contentText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((part) => typeof part === 'string' ? part : part?.text || part?.content || '').filter(Boolean).join('\n').trim();
}

export async function requestChatCompletion({ provider, messages, fetchImpl = fetch, signal }) {
  if (!provider?.apiKey) throw Object.assign(new Error('CHAT_PROVIDER_NOT_CONFIGURED'), { code: 'CHAT_PROVIDER_NOT_CONFIGURED' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', cancel, { once: true });
  const clientRequestId = randomUUID();
  try {
    const response = await fetchImpl(buildProviderUrl(provider.baseUrl, 'chat/completions'), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Client-Request-Id': clientRequestId
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: provider.maxOutputTokens,
        stream: false
      })
    });
    const payload = await response.json().catch(() => ({}));
    const content = contentText(payload?.choices?.[0]?.message?.content || payload?.output_text);
    if (!response.ok || !content) {
      const error = new Error(payload?.error?.message || payload?.message || `Chat request failed with status ${response.status}`);
      error.code = payload?.error?.code || payload?.code || 'CHAT_PROVIDER_FAILED';
      error.status = response.status;
      throw error;
    }
    const usage = normalizeChatUsage(payload?.usage || {});
    if (!(usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)) {
      throw Object.assign(new Error('CHAT_USAGE_UNAVAILABLE'), { code: 'CHAT_USAGE_UNAVAILABLE', status: 502 });
    }
    return {
      content,
      usage,
      model: payload?.model || provider.model,
      upstreamRequestId: response.headers.get('x-request-id') || payload?.id || clientRequestId
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

function normalizeStoredMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    attachments: parseJson(row.attachments_json, []),
    usage: parseJson(row.usage_json, {}),
    chargedCredits: Number(row.charged_credit_centi || 0) / 100,
    createdAt: row.created_at
  };
}

export function getOrCreateChatConversation(userId) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(userId);
  if (existing) return existing;
  const id = randomUUID();
  const createdAt = now();
  db.prepare('INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, 'Pic365 聊天精灵', createdAt, createdAt);
  return db.prepare('SELECT * FROM chat_conversations WHERE id = ?').get(id);
}

export function listChatMessages(userId, limit = 60) {
  const conversation = getOrCreateChatConversation(userId);
  const rows = getDb().prepare(`
    SELECT * FROM chat_messages
    WHERE conversation_id = ? AND user_id = ?
    ORDER BY sequence DESC
    LIMIT ?
  `).all(conversation.id, userId, Math.max(1, Math.min(100, Math.round(Number(limit) || 60))));
  return { conversationId: conversation.id, messages: rows.reverse().map(normalizeStoredMessage) };
}

export function clearChatConversation(userId) {
  const db = getDb();
  const rows = db.prepare('SELECT id FROM chat_conversations WHERE user_id = ?').all(userId);
  db.prepare('DELETE FROM chat_conversations WHERE user_id = ?').run(userId);
  return rows.length;
}

export function deleteChatMessage(userId, messageId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM chat_messages WHERE id = ? AND user_id = ?
  `).get(messageId, userId);
  if (!row) throw Object.assign(new Error('CHAT_MESSAGE_NOT_FOUND'), { code: 'CHAT_MESSAGE_NOT_FOUND' });
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM chat_messages WHERE id = ? AND user_id = ?').run(messageId, userId);
    db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ? AND user_id = ?')
      .run(now(), row.conversation_id, userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return normalizeStoredMessage(row);
}

export function getChatResultByRequestId(userId, clientRequestId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT usage.*, message.content, message.attachments_json, message.usage_json, message.created_at,
      message.conversation_id, message.sequence
    FROM chat_usage_records usage
    JOIN chat_messages message ON message.id = usage.assistant_message_id
    WHERE usage.user_id = ? AND usage.client_request_id = ?
  `).get(userId, clientRequestId);
  if (!row) return null;
  const userMessage = db.prepare(`
    SELECT * FROM chat_messages
    WHERE conversation_id = ? AND user_id = ? AND role = 'user' AND sequence < ?
    ORDER BY sequence DESC
    LIMIT 1
  `).get(row.conversation_id, userId, row.sequence);
  return {
    userMessage: normalizeStoredMessage(userMessage),
    message: normalizeStoredMessage({
      id: row.assistant_message_id,
      role: 'assistant',
      content: row.content,
      attachments_json: row.attachments_json,
      usage_json: row.usage_json,
      charged_credit_centi: row.charged_credit_centi,
      created_at: row.created_at
    }),
    user: getUserProfile(userId)
  };
}

export function buildChatMessages(userId, { text, images = [] }) {
  const { conversationId } = listChatMessages(userId, 1);
  const newestRows = getDb().prepare(`
    SELECT role, content FROM chat_messages
    WHERE conversation_id = ? AND user_id = ?
    ORDER BY sequence DESC
    LIMIT ?
  `).all(conversationId, userId, MAX_HISTORY_MESSAGES);
  const rows = [];
  let historyCharacters = 0;
  for (const row of newestRows) {
    const rowCharacters = String(row.content || '').length;
    if (rows.length && historyCharacters + rowCharacters > MAX_HISTORY_CHARACTERS) break;
    rows.push(row);
    historyCharacters += rowCharacters;
  }
  rows.reverse();
  const currentContent = images.length
    ? [{ type: 'text', text }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))]
    : text;
  return {
    conversationId,
    messages: [
      ...rows.map((row) => ({ role: row.role, content: row.content })),
      { role: 'user', content: currentContent }
    ]
  };
}

export function reserveChatCreditCapacity(userId, { text, imageCount = 0, provider, clientRequestId }) {
  const estimatedInputTokens = Math.max(1, String(text || '').length * 2 + imageCount * 50_000);
  const requiredCenti = calculateChatChargeCenti({
    usage: { input_tokens: estimatedInputTokens, output_tokens: provider.maxOutputTokens },
    pricing: provider.pricing
  });
  const reservation = reserveCreditCenti(userId, {
    amountCenti: Math.max(1, requiredCenti),
    source: 'chat_actual_usage',
    requestKey: `chat:${String(clientRequestId || '').slice(0, 120)}`,
    metadata: {
      providerId: provider.id,
      model: provider.model,
      estimatedInputTokens,
      maxOutputTokens: provider.maxOutputTokens
    }
  });
  if (reservation.duplicate) {
    throw Object.assign(new Error('CHAT_REQUEST_IN_PROGRESS'), { code: 'CHAT_REQUEST_IN_PROGRESS' });
  }
  return reservation;
}

export function commitChatExchange({
  userId,
  conversationId,
  clientRequestId,
  userText,
  attachments = [],
  assistantText,
  provider,
  usage,
  reservationId,
  upstreamRequestId = ''
}) {
  const duplicate = getChatResultByRequestId(userId, clientRequestId);
  if (duplicate) return duplicate;
  const db = getDb();
  const calculatedCenti = calculateChatChargeCenti({ usage, pricing: provider.pricing });
  const effectiveReservationId = reservationId || reserveCreditCenti(userId, {
    amountCenti: Math.max(1, calculatedCenti),
    source: 'chat_actual_usage',
    requestKey: `chat-commit:${String(clientRequestId || '').slice(0, 120)}`,
    metadata: { providerId: provider.id, model: provider.model }
  }).reservationId;
  const createdAt = now();
  const userMessageId = randomUUID();
  const assistantMessageId = randomUUID();
  const usageId = randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    const user = db.prepare('SELECT id, role, credit_balance FROM users WHERE id = ? AND status = ?').get(userId, 'active');
    if (!user) throw Object.assign(new Error('AUTH_REQUIRED'), { code: 'AUTH_REQUIRED' });
    const settledReservation = settleCreditReservationInTransaction(db, effectiveReservationId, calculatedCenti);
    const chargedCenti = settledReservation.billing_scope === 'super_admin' ? 0 : calculatedCenti;
    const nextSequence = Number(db.prepare('SELECT COALESCE(MAX(sequence), 0) AS value FROM chat_messages WHERE conversation_id = ?').get(conversationId)?.value || 0) + 1;
    db.prepare(`
      INSERT INTO chat_messages
        (id, conversation_id, user_id, role, content, attachments_json, usage_json, charged_credit_centi, sequence, created_at)
      VALUES (?, ?, ?, 'user', ?, ?, '{}', 0, ?, ?)
    `).run(userMessageId, conversationId, userId, userText, JSON.stringify(attachments), nextSequence, createdAt);
    db.prepare(`
      INSERT INTO chat_messages
        (id, conversation_id, user_id, role, content, attachments_json, usage_json, charged_credit_centi, sequence, created_at)
      VALUES (?, ?, ?, 'assistant', ?, '[]', ?, ?, ?, ?)
    `).run(assistantMessageId, conversationId, userId, assistantText, JSON.stringify(usage), chargedCenti, nextSequence + 1, createdAt);
    db.prepare(`
      INSERT INTO chat_usage_records
        (id, client_request_id, user_id, conversation_id, assistant_message_id, provider_id, model,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
         calculated_credit_centi, charged_credit_centi, pricing_json, upstream_request_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usageId,
      clientRequestId,
      userId,
      conversationId,
      assistantMessageId,
      provider.id,
      provider.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      calculatedCenti,
      chargedCenti,
      JSON.stringify(provider.pricing),
      clean(upstreamRequestId, 240),
      createdAt
    );
    db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ? AND user_id = ?').run(createdAt, conversationId, userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error?.message || '').includes('UNIQUE constraint failed: chat_usage_records.client_request_id')) {
      return getChatResultByRequestId(userId, clientRequestId);
    }
    throw error;
  }
  return {
    userMessage: normalizeStoredMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(userMessageId)),
    message: normalizeStoredMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(assistantMessageId)),
    user: getUserProfile(userId)
  };
}
