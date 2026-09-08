(function () {
  const storageKey = 'pic365.site-theme.v1';
  const allowedThemes = new Set(['light', 'dark', 'black']);
  const readTheme = () => {
    try {
      const storedTheme = localStorage.getItem(storageKey);
      return allowedThemes.has(storedTheme) ? storedTheme : 'black';
    } catch {
      return 'black';
    }
  };
  const applyTheme = (theme) => {
    const resolvedTheme = allowedThemes.has(theme) ? theme : 'black';
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';
  };
  applyTheme(readTheme());
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) applyTheme(readTheme());
  });
  window.addEventListener('focus', () => applyTheme(readTheme()));
})();
