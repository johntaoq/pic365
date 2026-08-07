const listeners = new Set();

function notify(event, session) {
  for (const listener of listeners) listener(event, session);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || 'AUTH_FAILED');
    error.code = payload.error || 'AUTH_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

export const isAuthConfigured = true;

export const authClient = {
  async getSession() {
    const payload = await request('/api/auth/session', { method: 'GET', headers: {} });
    return payload.session || null;
  },

  onAuthStateChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  async signIn(email, password) {
    const payload = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const session = { user: payload.user };
    notify('SIGNED_IN', session);
    return session;
  },

  async signUp(email, password, fullName) {
    const payload = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName })
    });
    const session = { user: payload.user };
    notify('SIGNED_IN', session);
    return session;
  },

  async signOut() {
    await request('/api/auth/logout', { method: 'POST', body: '{}' });
    notify('SIGNED_OUT', null);
  }
};
