import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import {
  calculateChatChargeCenti,
  normalizeChatUsage,
  parseTieredPricingExpression
} from '../shared/chat-billing.js';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pic365-chat-billing-'));
process.env.APP_DB_PATH = path.join(tempDirectory, 'app.sqlite');
process.env.LOCAL_STORAGE_ROOT = path.join(tempDirectory, 'storage');
process.env.PROVIDER_CONFIG_SECRET = 'chat-billing-test-secret';
process.env.AI_API_KEY = 'sk-chat-test';
process.env.AI_BASE_URL = 'https://provider.example.invalid';
process.env.CHAT_PROVIDER_API_KEY = 'sk-chat-test';
process.env.CHAT_PROVIDER_BASE_URL = 'https://provider.example.invalid';
delete process.env.AZURE_STORAGE_CONNECTION_STRING;

const [db, chat] = await Promise.all([
  import('../api/_lib/local-db.js'),
  import('../api/_lib/chat-engine.js')
]);

after(() => {
  db.getDb().close();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('chat usage separates uncached input, output, cache read and cache write', () => {
  const usage = normalizeChatUsage({
    prompt_tokens: 1000,
    completion_tokens: 200,
    total_tokens: 1200,
    prompt_tokens_details: {
      cached_tokens: 300,
      cache_creation_tokens: 100
    }
  });
  assert.deepEqual(usage, {
    inputTokens: 600,
    outputTokens: 200,
    cacheReadTokens: 300,
    cacheWriteTokens: 100,
    totalTokens: 1200
  });
  assert.equal(calculateChatChargeCenti({
    usage,
    pricing: { input: 7, output: 42, cacheRead: 0.7, cacheWrite: 8.75 }
  }), 137);
  assert.equal(calculateChatChargeCenti({
    usage: { input_tokens: 1 },
    pricing: { input: 7, output: 42, cacheRead: 0.7, cacheWrite: 8.75 }
  }), 1);
});

test('tiered pricing sync reads the short-context four-part price', () => {
  assert.deepEqual(parseTieredPricingExpression(
    'len <= 272000 ? tier("standard", p * 1 + c * 6 + cr * 0.1 + cc * 1.25) : tier("long_context", p * 2 + c * 9 + cr * 0.2 + cc * 2.5)'
  ), { input: 1, output: 6, cacheRead: 0.1, cacheWrite: 1.25 });
});

test('chat provider defaults to gpt-5.6-luna and actual usage is charged once to 0.01 credits', () => {
  const user = db.createUser({
    email: 'chat-billing@example.com',
    password: 'testing-1234',
    fullName: 'Chat Billing',
    initialCredits: 100
  });
  const provider = chat.ensureDefaultChatProviderConfig();
  assert.equal(provider.name, '5.6-luna');
  assert.equal(provider.model, 'gpt-5.6-luna');
  const secretProvider = chat.getChatProviderConfig();
  assert.equal(secretProvider.apiKey, 'sk-chat-test');

  const conversation = chat.getOrCreateChatConversation(user.id);
  const usage = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const first = chat.commitChatExchange({
    userId: user.id,
    conversationId: conversation.id,
    clientRequestId: 'chat-request-once',
    userText: '你好',
    assistantText: '你好，我是小猫精灵。',
    provider: secretProvider,
    usage,
    upstreamRequestId: 'upstream-test'
  });
  assert.equal(first.message.chargedCredits, 0.28);
  assert.equal(first.userMessage.content, '你好');
  assert.equal(first.user.creditBalance, 99.72);

  const duplicate = chat.commitChatExchange({
    userId: user.id,
    conversationId: conversation.id,
    clientRequestId: 'chat-request-once',
    userText: '不会重复保存',
    assistantText: '不会重复扣费',
    provider: secretProvider,
    usage,
    upstreamRequestId: 'upstream-test-2'
  });
  assert.equal(duplicate.userMessage.content, '你好');
  assert.equal(duplicate.user.creditBalance, 99.72);
  assert.equal(chat.listChatMessages(user.id).messages.length, 2);
  assert.equal(db.getDb().prepare("SELECT COUNT(*) AS count FROM credit_ledger WHERE user_id = ? AND source = 'chat_actual_usage'").get(user.id).count, 1);

  const savedMessages = chat.listChatMessages(user.id).messages;
  const deletedUserMessage = chat.deleteChatMessage(user.id, savedMessages[0].id);
  assert.equal(deletedUserMessage.role, 'user');
  assert.equal(chat.listChatMessages(user.id).messages.length, 1);
  assert.equal(db.getUserProfile(user.id).creditBalance, 99.72);
  assert.throws(() => chat.deleteChatMessage(user.id, savedMessages[0].id), /CHAT_MESSAGE_NOT_FOUND/);

  chat.clearChatConversation(user.id);
  assert.equal(chat.listChatMessages(user.id).messages.length, 0);

  const freshConversation = chat.getOrCreateChatConversation(user.id);
  const insertMessage = db.getDb().prepare(`
    INSERT INTO chat_messages
      (id, conversation_id, user_id, role, content, attachments_json, usage_json, charged_credit_centi, sequence, created_at)
    VALUES (?, ?, ?, ?, ?, '[]', '{}', 0, ?, ?)
  `);
  for (let index = 1; index <= 30; index += 1) {
    insertMessage.run(`history-${index}`, freshConversation.id, user.id, index % 2 ? 'user' : 'assistant', `消息 ${index}`, index, new Date().toISOString());
  }
  const bounded = chat.buildChatMessages(user.id, { text: '新的问题' });
  assert.equal(bounded.messages.length, 25);
  assert.equal(bounded.messages[0].content, '消息 7');
});

test('multimodal chat request sends image content and requires actual usage', async () => {
  let requestBody;
  const result = await chat.requestChatCompletion({
    provider: {
      apiKey: 'sk-test',
      baseUrl: 'https://provider.example.invalid',
      model: 'gpt-5.6-luna',
      maxOutputTokens: 1024
    },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: '这是什么？' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }
      ]
    }],
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'req-test' },
        json: async () => ({
          model: 'gpt-5.6-luna',
          choices: [{ message: { content: '这是一张测试图片。' } }],
          usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
        })
      };
    }
  });
  assert.equal(requestBody.messages[0].content[1].type, 'image_url');
  assert.equal(result.content, '这是一张测试图片。');
  assert.equal(result.usage.inputTokens, 20);
});
