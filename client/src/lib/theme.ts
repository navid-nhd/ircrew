// Class-based theme controller.
//   • mode = 'auto' → follow prefers-color-scheme (default)
//   • mode = 'light' / 'dark' → user override, persisted in localStorage
//
// Tailwind v4 dark variant is wired to `&:where(.dark, .dark *)` in
// index.css, so the only thing the runtime has to do is keep the `dark`
// class on <html> in sync with the resolved mode.

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORE_KEY = 'ircrew.theme.v1';

const mediaQuery = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function systemPrefersDark(): boolean {
  return mediaQuery?.matches ?? false;
}

function apply(mode: ThemeMode): void {
  const dark = mode === 'dark' || (mode === 'auto' && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.setAttribute('data-theme-mode', mode);
}

export const theme = {
  get(): ThemeMode {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
    } catch { /* ignore */ }
    return 'auto';
  },
  set(mode: ThemeMode): void {
    try {
      if (mode === 'auto') localStorage.removeItem(STORE_KEY);
      else localStorage.setItem(STORE_KEY, mode);
    } catch { /* ignore */ }
    apply(mode);
  },
  /** Call once at app boot. Also wires a listener for system theme changes
   *  so 'auto' mode flips with the OS. */
  init(): ThemeMode {
    const mode = theme.get();
    apply(mode);
    if (mediaQuery) {
      const onChange = () => { if (theme.get() === 'auto') apply('auto'); };
      // Modern browsers support addEventListener on MediaQueryList.
      mediaQuery.addEventListener?.('change', onChange);
    }
    return mode;
  },
};
