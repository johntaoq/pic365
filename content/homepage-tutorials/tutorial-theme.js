(() => {
  const allowed = new Set(['light', 'dark', 'black']);
  const queryTheme = new URLSearchParams(window.location.search).get('theme');
  let storedTheme = '';
  try { storedTheme = localStorage.getItem('pic365.site-theme.v1') || ''; } catch { /* best effort */ }
  document.documentElement.dataset.theme = allowed.has(queryTheme) ? queryTheme : allowed.has(storedTheme) ? storedTheme : 'black';
})();
