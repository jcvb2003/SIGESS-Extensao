import { CadastroSession, PessoaData } from "../../shared/types";
import { setupSPANavigationObserver } from "../automation/spa-observer";
import { StorageService } from "../../background/services/storage";
import { isCaptureStatusSatisfied, projectCaptureStatuses, type CaptureStatus } from "../automation/cadastro/status-projection";
import { resolvePortalBridge } from "../automation/cadastro/portal-bridges";

/**
 * Componente visual discreto que indica o status da coleta em tempo real.
 */
(function () {
  const ID_ROOT = "sigess-capture-indicator";

  function createUI() {
    if (document.getElementById(ID_ROOT)) return;

    const root = document.createElement("div");
    root.id = ID_ROOT;
    root.style.cssText = `
        position: fixed;
        bottom: 15px;
        left: 15px;
        z-index: 2147483647;
        padding: 6px 10px;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.3s ease;
        pointer-events: auto;
    `;

    const label = document.createElement("span");
    label.style.cssText = `
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 10px;
        font-weight: 700;
        color: #94a3b8;
        letter-spacing: 0.5px;
        margin-right: 2px;
    `;
    label.innerText = "SIGESS";
    root.appendChild(label);

    const dotContainer = document.createElement("div");
    dotContainer.style.cssText = `display: flex; gap: 6px;`;

    const sources = [
      { id: "cadunico",   label: "CadÚnico" },
      { id: "tse",        label: "TSE" },
      { id: "pesqbrasil", label: "PesqBrasil" },
      { id: "esocial",    label: "CEI/CAEPF" },
      { id: "ecac",       label: "e-CAC" }
    ];

    sources.forEach(src => {
      const dot = document.createElement("div");
      dot.id = `sigess-dot-${src.id}`;
      dot.title = src.label;
      dot.style.cssText = `
          width: 8px;
          height: 8px;
          background: #334155;
          border-radius: 50%;
          transition: all 0.3s ease;
      `;
      dotContainer.appendChild(dot);
    });

    root.appendChild(dotContainer);

    const clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.title = "Limpar dados capturados";
    clearButton.setAttribute("aria-label", "Limpar dados capturados");
    clearButton.textContent = "🗑";
    clearButton.style.cssText = `
        border: 0;
        background: transparent;
        color: #f87171;
        cursor: pointer;
        font-size: 13px;
        line-height: 1;
        padding: 0 0 0 2px;
    `;
    clearButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!globalThis.confirm("Deseja realmente limpar todos os dados capturados?")) return;
      await StorageService.clearCapturedPessoaData();
    });
    root.appendChild(clearButton);
    document.body.appendChild(root);

    updateFromStorage();
  }

  function removeUI() {
    const root = document.getElementById(ID_ROOT);
    if (root) root.remove();
  }

  function isTargetPage(): boolean {
    const host = globalThis.location.hostname;
    const isWebRegistration =
      (host.endsWith(".sigess.com.br") ||
        host === "sigess-extensao.vercel.app" ||
        host === "localhost") &&
      globalThis.location.pathname.startsWith("/registration");

    return resolvePortalBridge(host) !== null || isWebRegistration;
  }

  async function syncUI(): Promise<void> {
    if (globalThis.self !== globalThis.top || !isTargetPage()) {
      removeUI();
      return;
    }

    const result = await chrome.storage.local.get(["sigessSettings", "sigessActiveCadastro"]);
    const settings = result.sigessSettings || {};
    if (!settings.autoRegistrationEnabled) {
      removeUI();
      return;
    }

    createUI();
    updateDots(settings.pessoaData as PessoaData, result.sigessActiveCadastro, settings.pessoaData_raw);
  }

  async function updateFromStorage() {
    const result = await chrome.storage.local.get(["sigessSettings", "sigessActiveCadastro"]);
    const settings = result.sigessSettings || {};
    const data = settings.pessoaData as PessoaData;
    updateDots(data, result.sigessActiveCadastro, settings.pessoaData_raw);
  }

  function updateDots(
    data: PessoaData,
    session?: CadastroSession,
    rawSources?: Record<string, Partial<PessoaData>>,
  ) {
    const projected = projectCaptureStatuses(data, session, rawSources);
    const mapping: Record<string, CaptureStatus> = {
      cadunico: projected.cadunico,
      tse: projected.tse,
      pesqbrasil: projected.pesqbrasil,
      esocial: projected.caepf,
      ecac: projected.ecac,
    };

    Object.entries(mapping).forEach(([id, status]) => {
      const dot = document.getElementById(`sigess-dot-${id}`);
      if (dot) {
        const active = isCaptureStatusSatisfied(status);
        dot.dataset.status = status;
        dot.style.background = active ? "#10b981" : "#334155";
        dot.style.boxShadow = active ? "0 0 6px #10b981" : "none";
      }
    });

    const root = document.getElementById(ID_ROOT);
    if (root && data?.nome) {
      root.title = `Capturado: ${data.nome}`;
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sigessSettings) {
      void syncUI();
    }
    if (changes.sigessActiveCadastro && globalThis.self === globalThis.top) {
      void syncUI();
    }
  });

  if (document.readyState !== "loading") {
    setupSPANavigationObserver(() => void syncUI());
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      setupSPANavigationObserver(() => void syncUI());
    });
  }
})();
