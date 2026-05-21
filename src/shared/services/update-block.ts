export interface UpdateAvailableInfo {
  version?: string;
  url?: string;
}

const OVERLAY_ID = "sigess-update-required-overlay";
const STYLE_ID = "sigess-update-required-style";

function getStorageArea() {
  if (globalThis.browser?.storage?.local) return globalThis.browser.storage.local;
  if ((globalThis as any).chrome?.storage?.local) return (globalThis as any).chrome.storage.local;
  return null;
}

async function waitForBody(): Promise<HTMLElement | null> {
  if (typeof document === "undefined") return null;
  if (document.body) return document.body;

  return new Promise((resolve) => {
    const finish = () => resolve(document.body || null);
    document.addEventListener("DOMContentLoaded", finish, { once: true });
    setTimeout(finish, 3000);
  });
}

function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.76);
      backdrop-filter: blur(4px);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #${OVERLAY_ID} .sigess-update-card {
      width: min(520px, 100%);
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #ffffff;
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
      padding: 28px;
      color: #0f172a;
      text-align: center;
    }

    #${OVERLAY_ID} .sigess-update-chip {
      display: inline-flex;
      padding: 6px 12px;
      border-radius: 999px;
      background: #fef3c7;
      color: #92400e;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    #${OVERLAY_ID} .sigess-update-title {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.1;
      font-weight: 900;
      color: #991b1b;
    }

    #${OVERLAY_ID} .sigess-update-text {
      margin: 0;
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
    }

    #${OVERLAY_ID} .sigess-update-version {
      margin-top: 14px;
      font-size: 13px;
      font-weight: 700;
      color: #0f766e;
    }

    #${OVERLAY_ID} .sigess-update-actions {
      display: flex;
      justify-content: center;
      margin-top: 22px;
    }

    #${OVERLAY_ID} .sigess-update-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 18px;
      border-radius: 12px;
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: #ffffff;
      text-decoration: none;
      font-size: 14px;
      font-weight: 800;
      box-shadow: 0 12px 24px rgba(185, 28, 28, 0.28);
    }
  `;

  document.head?.appendChild(style);
}

export async function getUpdateAvailableInfo(): Promise<UpdateAvailableInfo | null> {
  const storage = getStorageArea();
  if (!storage) return null;

  const result = await storage.get("updateAvailable");
  return result?.updateAvailable || null;
}

export async function ensureUpdateRequiredOverlay(
  info?: UpdateAvailableInfo | null,
): Promise<void> {
  if (typeof document === "undefined") return;

  const resolvedInfo = info ?? (await getUpdateAvailableInfo());
  if (!resolvedInfo) {
    removeUpdateRequiredOverlay();
    return;
  }

  const body = await waitForBody();
  if (!body) return;

  ensureStyles();

  let overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="sigess-update-card" role="alertdialog" aria-modal="true" aria-labelledby="sigess-update-title">
        <div class="sigess-update-chip">Atualização obrigatória</div>
        <h1 id="sigess-update-title" class="sigess-update-title">Nova versão detectada!!!!</h1>
        <p class="sigess-update-text">Atualize a extensão para continuar usando as funções do SIGESS.</p>
        <div class="sigess-update-version"></div>
        <div class="sigess-update-actions"></div>
      </div>
    `;
    body.appendChild(overlay);
  }

  const versionEl = overlay.querySelector(".sigess-update-version");
  if (versionEl) {
    versionEl.textContent = resolvedInfo.version
      ? `Versão disponível: ${resolvedInfo.version}`
      : "";
  }

  const actionsEl = overlay.querySelector(".sigess-update-actions");
  if (actionsEl) {
    actionsEl.innerHTML = resolvedInfo.url
      ? `<a class="sigess-update-button" href="${resolvedInfo.url}" target="_blank" rel="noreferrer">Atualizar extensão</a>`
      : "";
  }
}

export function removeUpdateRequiredOverlay(): void {
  if (typeof document === "undefined") return;
  document.getElementById(OVERLAY_ID)?.remove();
}

export function watchUpdateRequiredOverlay(): void {
  if ((globalThis as any).__sigessUpdateOverlayWatcherLoaded) return;
  (globalThis as any).__sigessUpdateOverlayWatcherLoaded = true;

  void getUpdateAvailableInfo().then((info) => {
    if (info) {
      void ensureUpdateRequiredOverlay(info);
    }
  });

  const storageApi = globalThis.browser?.storage?.onChanged || (globalThis as any).chrome?.storage?.onChanged;
  storageApi?.addListener?.((changes: Record<string, { newValue?: unknown }>) => {
    if (!changes.updateAvailable) return;

    const nextValue = (changes.updateAvailable.newValue as UpdateAvailableInfo | undefined) || null;
    if (nextValue) {
      void ensureUpdateRequiredOverlay(nextValue);
      return;
    }

    removeUpdateRequiredOverlay();
  });
}
