export function createTaskPoller({
  load,
  hasActiveTasks,
  document = globalThis.document,
  events = globalThis,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  activeDelay = 1500,
  idleDelay = 15000,
  hiddenDelay = 60000,
  requestTimeout = 30000
}) {
  let stopped = false;
  let timer;
  let pending;
  let controller;
  let failures = 0;

  function schedule() {
    clearTimer(timer);
    if (stopped) return;
    const delay = document?.hidden ? hiddenDelay
      : failures ? Math.min(30000, activeDelay * 2 ** Math.min(failures, 5))
        : hasActiveTasks() ? activeDelay : idleDelay;
    timer = setTimer(() => { void refresh(); }, delay);
  }

  function refresh() {
    if (stopped) return Promise.resolve();
    if (pending) return pending;
    clearTimer(timer);
    controller = new AbortController();
    const timeout = setTimer(() => controller.abort(), requestTimeout);
    pending = Promise.resolve().then(() => load(controller.signal))
      .then((ok) => { failures = ok === false ? failures + 1 : 0; })
      .catch(() => { failures += 1; })
      .finally(() => {
        clearTimer(timeout);
        pending = null;
        schedule();
      });
    return pending;
  }

  function visibilityChanged() {
    if (document?.hidden) schedule();
    else void refresh();
  }
  function online() { void refresh(); }
  document?.addEventListener('visibilitychange', visibilityChanged);
  events?.addEventListener?.('online', online);
  if (document?.hidden) schedule();
  else void refresh();
  return {
    refresh,
    stop() {
      stopped = true;
      clearTimer(timer);
      controller?.abort();
      document?.removeEventListener('visibilitychange', visibilityChanged);
      events?.removeEventListener?.('online', online);
    }
  };
}
