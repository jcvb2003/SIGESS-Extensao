/**
 * Observer de navegação SPA com throttle configurável.
 * Monitora mudanças de DOM e popstate para re-avaliar o contexto da página.
 */
export function setupSPANavigationObserver(
  callback: () => void,
  throttleMs = 300
): void {
  globalThis.addEventListener('popstate', callback);

  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (pendingTimeout) return;
    pendingTimeout = setTimeout(() => {
      callback();
      pendingTimeout = null;
    }, throttleMs);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Avaliação inicial
  callback();
}
