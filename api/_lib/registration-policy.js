import { domainToASCII } from 'node:url';
import { getDb, normalizeEmail } from './local-db.js';

export const REGISTRATION_EMAIL_POLICY_SETTING_KEY = 'registration_email_domain_policy';

function parseJson(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function splitRules(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(/[\s,;]+/);
}

function normalizeRule(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
  const wildcard = raw.startsWith('*.');
  const domain = domainToASCII(wildcard ? raw.slice(2) : raw).toLowerCase();
  if (!domain || domain.length > 253 || !domain.includes('.') || !/^[a-z0-9.-]+$/.test(domain)) return '';
  if (domain.split('.').some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return '';
  return wildcard ? `*.${domain}` : domain;
}

export function normalizeEmailDomainRules(value) {
  return [...new Set(splitRules(value).map(normalizeRule).filter(Boolean))].sort();
}

export function normalizeRegistrationEmailPolicy(value = {}) {
  return {
    enabled: value.enabled !== false && value.enabled !== 0 && value.enabled !== '0',
    allowlist: normalizeEmailDomainRules(value.allowlist),
    denylist: normalizeEmailDomainRules(value.denylist),
    updatedAt: value.updatedAt || null
  };
}

export function getRegistrationEmailPolicy() {
  const row = getDb().prepare('SELECT value_json, updated_at FROM app_settings WHERE setting_key = ?')
    .get(REGISTRATION_EMAIL_POLICY_SETTING_KEY);
  return normalizeRegistrationEmailPolicy({
    ...parseJson(row?.value_json),
    updatedAt: row?.updated_at || null
  });
}

function domainMatches(domain, rule) {
  if (rule.startsWith('*.')) {
    const root = rule.slice(2);
    return domain !== root && domain.endsWith(`.${root}`);
  }
  return domain === rule;
}

export function evaluateRegistrationEmailDomain(emailValue, policyValue = getRegistrationEmailPolicy()) {
  const email = normalizeEmail(emailValue);
  const at = email.lastIndexOf('@');
  const domain = at > 0 ? domainToASCII(email.slice(at + 1)).toLowerCase() : '';
  const policy = normalizeRegistrationEmailPolicy(policyValue);
  if (!domain) return { allowed: false, code: 'INVALID_EMAIL', domain };
  if (!policy.enabled) return { allowed: true, code: '', domain };
  if (policy.denylist.some((rule) => domainMatches(domain, rule))) {
    return { allowed: false, code: 'EMAIL_DOMAIN_BLOCKED', domain };
  }
  if (policy.allowlist.length && !policy.allowlist.some((rule) => domainMatches(domain, rule))) {
    return { allowed: false, code: 'EMAIL_DOMAIN_NOT_ALLOWED', domain };
  }
  return { allowed: true, code: '', domain };
}

export function assertRegistrationEmailDomain(emailValue) {
  const result = evaluateRegistrationEmailDomain(emailValue);
  if (result.allowed) return result;
  const error = new Error(result.code);
  error.code = result.code;
  error.domain = result.domain;
  throw error;
}
