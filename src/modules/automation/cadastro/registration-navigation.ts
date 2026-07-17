import { setupSPANavigationObserver } from "../spa-observer";
import { TSE_HOST } from "../tse/routes";

interface NavigationCallbacks {
  onAnyMutation(): void;
  onHistoryNavigation(): void;
  onUrlChanged(url: string): void;
  onTseNavigation(url: string): void;
}

export function setupRegistrationNavigation(callbacks: NavigationCallbacks): void {
  const handleHistoryNavigation = () => {
    if (globalThis.location.hostname === TSE_HOST) {
      callbacks.onTseNavigation(globalThis.location.href);
    }
    callbacks.onHistoryNavigation();
  };
  globalThis.addEventListener("popstate", handleHistoryNavigation);
  globalThis.addEventListener("hashchange", handleHistoryNavigation);

  let lastUrl = globalThis.location.href;
  setupSPANavigationObserver(() => {
    callbacks.onAnyMutation();
    const currentUrl = globalThis.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;
    if (globalThis.location.hostname === TSE_HOST) callbacks.onTseNavigation(currentUrl);
    callbacks.onUrlChanged(currentUrl);
  });
}
