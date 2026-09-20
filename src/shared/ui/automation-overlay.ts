/**
 * Componente Padronizado de Overlay de Automação do SIGESS
 * 
 * Fornece um padrão visual unificado para overlays em abas de automação (REAP, PesqBrasil, etc.):
 * - Backdrop escuro com blur suave
 * - Card moderno com borda esmeralda SIGESS
 * - Loader circular com a logo oficial do SIGESS centralizada dentro do spinner
 * - Título com suporte a pontos dinâmicos animados (. .. ...)
 * - Descrição e nota informativa opcionais
 * - 100% livre de violações de Content Security Policy (construção puramente programática)
 */

export interface SigessOverlayConfig {
  /** ID do elemento DOM (padrão: "sigess-automation-overlay") */
  id?: string;
  /** Título principal (ex: "Enviando" ou "Preenchido!") */
  title: string;
  /** Se deve exibir animação de 3 pontos dinâmicos (. .. ...) após o título (padrão: true) */
  animatedDots?: boolean;
  /** Descrição explicativa opcional */
  description?: string;
  /** Nota de rodapé ou aviso opcional */
  note?: string;
  /** URL customizada para a logo (padrão: browser.runtime.getURL("sigess-logo.png")) */
  logoUrl?: string;
  /** Se deve prevenir fechamento acidental da aba via beforeunload (padrão: false) */
  preventTabClose?: boolean;
  /** Mensagem customizada para o prompt de beforeunload */
  beforeUnloadMessage?: string;
  /** z-index do overlay (padrão: 2147483647) */
  zIndex?: number;
  /** Se deve ocultar o spinner (ex: estado de sucesso/conclusão) */
  hideSpinner?: boolean;
  /** Se o overlay representa um estado de sucesso */
  isSuccess?: boolean;
  /** Botão de ação (ex: { label: "OK", onClick: () => ... }) */
  actionButton?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}

export const SIGESS_OVERLAY_STYLE_ID = "sigess-automation-overlay-style";

/**
 * Retorna o CSS das animações de rotação e pontos dinâmicos.
 */
export function getSigessOverlayKeyframeStyles(): string {
  return `
    @keyframes sigess-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes sigess-dot-fade {
      0%, 20% { opacity: 0; transform: translateY(0); }
      50% { opacity: 1; transform: translateY(-1.5px); }
      80%, 100% { opacity: 0; transform: translateY(0); }
    }
    @keyframes sigess-pop-in {
      0% { opacity: 0; transform: scale(0.85); }
      70% { transform: scale(1.05); }
      100% { opacity: 1; transform: scale(1); }
    }
  `;
}

function stripTrailingDots(str: string): string {
  let end = str.length;
  while (end > 0 && str[end - 1] === '.') {
    end--;
  }
  return str.slice(0, end);
}

function createOverlayLoader(config: SigessOverlayConfig): HTMLElement {
  const loaderWrapper = document.createElement("div");
  loaderWrapper.style.cssText = "position: relative !important; width: 76px !important; height: 76px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin: 4px 0 !important;";

  const ring = document.createElement("div");
  if (config.hideSpinner || config.isSuccess) {
    ring.style.cssText = "position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border: 3.5px solid #10b981 !important; border-radius: 50% !important; box-shadow: 0 0 16px rgba(16, 185, 129, 0.35) !important; animation: sigess-pop-in 0.35s ease-out !important; box-sizing: border-box !important;";
  } else {
    ring.style.cssText = "position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border: 3.5px solid rgba(16, 185, 129, 0.2) !important; border-top: 3.5px solid #059669 !important; border-radius: 50% !important; animation: sigess-spin 0.9s linear infinite !important; box-sizing: border-box !important;";
  }

  const img = document.createElement("img");
  const browserAPI = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
  img.src = config.logoUrl || (browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL("sigess-logo.png") : "sigess-logo.png");
  img.style.cssText = "position: relative !important; width: 44px !important; height: 44px !important; object-fit: contain !important; z-index: 1 !important;";
  img.alt = "SIGESS";

  loaderWrapper.appendChild(ring);
  loaderWrapper.appendChild(img);
  return loaderWrapper;
}

function createOverlayTitle(config: SigessOverlayConfig): HTMLElement {
  const title = document.createElement("h3");
  title.style.cssText = "margin: 0 !important; font-size: 17px !important; font-weight: 700 !important; color: #065f46 !important; letter-spacing: -0.01em !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;";

  const cleanTitle = config.animatedDots !== false ? stripTrailingDots(config.title) : config.title;
  const titleText = document.createElement("span");
  titleText.textContent = cleanTitle;
  title.appendChild(titleText);

  if (config.animatedDots !== false) {
    const dotsContainer = document.createElement("span");
    dotsContainer.style.cssText = "display: inline-flex !important; width: 18px !important; text-align: left !important; margin-left: 2px !important;";

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.textContent = ".";
      dot.style.cssText = `display: inline-block !important; animation: sigess-dot-fade 1.4s infinite !important; animation-delay: ${i * 0.2}s !important;`;
      dotsContainer.appendChild(dot);
    }
    title.appendChild(dotsContainer);
  }
  return title;
}

function createOverlayActionButton(btnConfig: NonNullable<SigessOverlayConfig["actionButton"]>): HTMLElement {
  const actionBtn = document.createElement("button");
  actionBtn.textContent = btnConfig.label;
  actionBtn.style.cssText = "margin-top: 8px !important; padding: 9px 38px !important; background: linear-gradient(135deg, #059669 0%, #10b981 100%) !important; color: #ffffff !important; border: none !important; border-radius: 10px !important; font-size: 13.5px !important; font-weight: 700 !important; cursor: pointer !important; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4) !important; transition: all 0.2s ease !important; outline: none !important; font-family: inherit !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; letter-spacing: 0.02em !important;";
  actionBtn.onmouseenter = () => {
    actionBtn.style.transform = "translateY(-1.5px) scale(1.02)";
    actionBtn.style.boxShadow = "0 6px 20px rgba(16, 185, 129, 0.55)";
  };
  actionBtn.onmouseleave = () => {
    actionBtn.style.transform = "translateY(0) scale(1)";
    actionBtn.style.boxShadow = "0 4px 14px rgba(16, 185, 129, 0.4)";
  };
  actionBtn.onclick = (e) => {
    e.stopPropagation();
    void btnConfig.onClick();
  };
  return actionBtn;
}

function attachBeforeUnloadProtection(config: SigessOverlayConfig): void {
  if (!config.preventTabClose || config.isSuccess) return;
  try {
    const pWin = (window as any).wrappedJSObject || window;
    pWin.__sigessAutomationActive = true;
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (pWin.__sigessAutomationActive) {
        e.preventDefault();
      }
    };
    pWin.onbeforeunload = beforeUnloadHandler;
    window.onbeforeunload = beforeUnloadHandler;
    window.addEventListener("beforeunload", beforeUnloadHandler);
  } catch {}
}

/**
 * Cria ou recupera o elemento DOM do overlay padronizado.
 */
export function createSigessOverlayElement(config: SigessOverlayConfig): HTMLElement {
  const overlayId = config.id || "sigess-automation-overlay";
  const existing = document.getElementById(overlayId);
  if (existing) return existing;

  // Injeta estilos globais de keyframes se não existirem no documento
  if (!document.getElementById(SIGESS_OVERLAY_STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = SIGESS_OVERLAY_STYLE_ID;
    styleEl.textContent = getSigessOverlayKeyframeStyles();
    (document.head || document.documentElement || document.body)?.appendChild(styleEl);
  }

  // Backdrop em tela cheia
  const overlay = document.createElement("div");
  overlay.id = overlayId;
  const zIndex = config.zIndex ?? 2147483647;
  overlay.style.cssText = `position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(15, 23, 42, 0.75) !important; z-index: ${zIndex} !important; display: flex !important; align-items: center !important; justify-content: center !important; backdrop-filter: blur(4px) !important; pointer-events: auto !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;`;

  // Card central
  const box = document.createElement("div");
  box.style.cssText = "background: #ffffff !important; padding: 30px 40px !important; border-radius: 20px !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35) !important; border: 2px solid rgba(16, 185, 129, 0.4) !important; display: flex !important; flex-direction: column !important; align-items: center !important; gap: 14px !important; min-width: 300px !important; max-width: 420px !important; text-align: center !important; box-sizing: border-box !important;";

  box.appendChild(createOverlayLoader(config));
  box.appendChild(createOverlayTitle(config));

  // Descrição opcional
  if (config.description) {
    const desc = document.createElement("p");
    desc.textContent = config.description;
    desc.style.cssText = "margin: 4px 0 0 !important; font-size: 12.5px !important; color: #4b5563 !important; line-height: 1.5 !important;";
    box.appendChild(desc);
  }

  // Nota de rodapé opcional
  if (config.note) {
    const note = document.createElement("div");
    note.textContent = config.note;
    note.style.cssText = "background: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; border-radius: 8px !important; padding: 8px 14px !important; font-size: 11.5px !important; color: #166534 !important; line-height: 1.4 !important; margin-top: 4px !important;";
    box.appendChild(note);
  }

  // Botão de ação opcional (ex: "OK")
  if (config.actionButton) {
    box.appendChild(createOverlayActionButton(config.actionButton));
  }

  overlay.appendChild(box);

  // Proteção opcional contra fechamento de aba
  attachBeforeUnloadProtection(config);

  return overlay;
}

/**
 * Exibe o overlay padronizado do SIGESS na página atual.
 * Se já existir um overlay ativo, substitui para atualizar o estado de forma reativa.
 */
export function showSigessOverlay(config: SigessOverlayConfig): HTMLElement {
  const overlayId = config.id || "sigess-automation-overlay";
  const existing = document.getElementById(overlayId);
  if (existing) {
    existing.remove();
  }

  const overlay = createSigessOverlayElement(config);
  const target = document.documentElement || document.body;
  target?.appendChild(overlay);

  return overlay;
}

/**
 * Oculta e remove o overlay padronizado do SIGESS na página atual.
 */
export function hideSigessOverlay(id = "sigess-automation-overlay"): void {
  const overlay = document.getElementById(id);
  if (overlay) {
    overlay.remove();
  }
  try {
    const pWin = (window as any).wrappedJSObject || window;
    pWin.__sigessAutomationActive = false;
    window.onbeforeunload = null;
    pWin.onbeforeunload = null;
  } catch {}
}

/**
 * Gera o script serializado para injeção remota via browser.tabs.executeScript.
 * Garante compatibilidade total mesmo em páginas com CSP estrito (como portais governamentais Next.js).
 */
export function generateSigessOverlayInjectionScript(config: SigessOverlayConfig): string {
  const browserAPI = typeof browser !== "undefined" ? browser : (globalThis as any).chrome;
  const logoUrl = config.logoUrl || (browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL("sigess-logo.png") : "sigess-logo.png");
  const overlayId = config.id || "sigess-automation-overlay";
  const cleanTitle = config.animatedDots !== false ? stripTrailingDots(config.title) : config.title;
  const animatedDots = config.animatedDots !== false;
  const zIndex = config.zIndex ?? 2147483647;
  const preventTabClose = Boolean(config.preventTabClose);
  const beforeUnloadMsg = config.beforeUnloadMessage || "Uma automação do SIGESS está em andamento. Fechar esta aba irá interromper o processo.";

  return `
    (() => {
      try {
        ${preventTabClose ? `
        const pWin = window.wrappedJSObject || window;
        pWin.__sigessAutomationActive = true;
        const beforeUnloadHandler = function(e) {
          if (pWin.__sigessAutomationActive) {
            const msg = ${JSON.stringify(beforeUnloadMsg)};
            e.preventDefault();
            return msg;
          }
        };
        pWin.onbeforeunload = beforeUnloadHandler;
        window.onbeforeunload = beforeUnloadHandler;
        window.addEventListener("beforeunload", beforeUnloadHandler);
        ` : ""}
      } catch (e) {}

      if (document.getElementById(${JSON.stringify(overlayId)})) return;

      const overlay = document.createElement("div");
      overlay.id = ${JSON.stringify(overlayId)};
      overlay.style.cssText = "position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(15, 23, 42, 0.75) !important; z-index: ${zIndex} !important; display: flex !important; align-items: center !important; justify-content: center !important; backdrop-filter: blur(4px) !important; pointer-events: auto !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;";

      const box = document.createElement("div");
      box.style.cssText = "background: #ffffff !important; padding: 30px 40px !important; border-radius: 20px !important; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35) !important; border: 2px solid rgba(16, 185, 129, 0.4) !important; display: flex !important; flex-direction: column !important; align-items: center !important; gap: 14px !important; min-width: 300px !important; max-width: 420px !important; text-align: center !important; box-sizing: border-box !important;";

      const loaderWrapper = document.createElement("div");
      loaderWrapper.style.cssText = "position: relative !important; width: 76px !important; height: 76px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin: 4px 0 !important;";

      const spinner = document.createElement("div");
      spinner.style.cssText = "position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border: 3.5px solid rgba(16, 185, 129, 0.2) !important; border-top: 3.5px solid #059669 !important; border-radius: 50% !important; animation: sigess-spin 0.9s linear infinite !important; box-sizing: border-box !important;";

      const img = document.createElement("img");
      img.src = ${JSON.stringify(logoUrl)};
      img.style.cssText = "position: relative !important; width: 44px !important; height: 44px !important; object-fit: contain !important; z-index: 1 !important;";
      img.alt = "SIGESS";

      loaderWrapper.appendChild(spinner);
      loaderWrapper.appendChild(img);

      const title = document.createElement("h3");
      title.style.cssText = "margin: 0 !important; font-size: 16px !important; font-weight: 700 !important; color: #065f46 !important; letter-spacing: -0.01em !important; display: inline-flex !important; align-items: center !important; justify-content: center !important;";

      const titleText = document.createElement("span");
      titleText.textContent = ${JSON.stringify(cleanTitle)};
      title.appendChild(titleText);

      ${animatedDots ? `
      const dotsContainer = document.createElement("span");
      dotsContainer.style.cssText = "display: inline-flex !important; width: 18px !important; text-align: left !important; margin-left: 2px !important;";

      for (let i = 0; i < 3; i++) {
        const dot = document.createElement("span");
        dot.textContent = ".";
        dot.style.cssText = "display: inline-block !important; animation: sigess-dot-fade 1.4s infinite !important; animation-delay: " + (i * 0.2) + "s !important;";
        dotsContainer.appendChild(dot);
      }
      title.appendChild(dotsContainer);
      ` : ""}

      ${config.description ? `
      const desc = document.createElement("p");
      desc.textContent = ${JSON.stringify(config.description)};
      desc.style.cssText = "margin: 4px 0 0 !important; font-size: 12.5px !important; color: #4b5563 !important; line-height: 1.5 !important;";
      ` : ""}

      ${config.note ? `
      const note = document.createElement("div");
      note.textContent = ${JSON.stringify(config.note)};
      note.style.cssText = "background: #f0fdf4 !important; border: 1px solid #bbf7d0 !important; border-radius: 8px !important; padding: 8px 14px !important; font-size: 11.5px !important; color: #166534 !important; line-height: 1.4 !important; margin-top: 4px !important;";
      ` : ""}

      const style = document.createElement("style");
      style.textContent = ${JSON.stringify(getSigessOverlayKeyframeStyles())};

      box.appendChild(loaderWrapper);
      box.appendChild(title);
      ${config.description ? `box.appendChild(desc);` : ""}
      ${config.note ? `box.appendChild(note);` : ""}
      overlay.appendChild(box);
      overlay.appendChild(style);

      (document.documentElement || document.body).appendChild(overlay);
    })();
  `;
}
