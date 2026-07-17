import { CadastroSession, PessoaData } from "../../shared/types";

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
      const result = await chrome.storage.local.get("sigessSettings");
      const settings = result.sigessSettings || {};
      await chrome.storage.local.set({
        sigessSettings: {
          ...settings,
          pessoaData: {},
          pessoaData_raw: {},
          pessoaData_snapshots: {},
          pessoaData_sensitive: {},
        },
      });
    });
    root.appendChild(clearButton);
    document.body.appendChild(root);

    updateFromStorage();
  }

  function removeUI() {
    const root = document.getElementById(ID_ROOT);
    if (root) root.remove();
  }

  async function updateFromStorage() {
    const result = await chrome.storage.local.get(["sigessSettings", "sigessActiveCadastro"]);
    const settings = result.sigessSettings || {};
    const data = settings.pessoaData as PessoaData;
    updateDots(data, result.sigessActiveCadastro);
  }

  function updateDots(data: PessoaData, session?: CadastroSession) {
    const f = data?.fontes || {};
    const cadunicoCapturado = !!(f.cadunico?.capturado || f.cadunico_adv?.capturado);
    const tseDispensado =
      cadunicoCapturado &&
      session?.sessionState === "active" &&
      session.portais?.tse?.status === "dispensado";

    const mapping: Record<string, boolean> = {
      cadunico:   cadunicoCapturado,
      tse:        !!f.tse?.capturado || tseDispensado,
      pesqbrasil: !!(f.pesqbrasil?.capturado || f.pesq_brasil?.capturado),
      esocial:    !!(f.ecac_caepf?.capturado || f.caepf?.capturado || f.esocial?.capturado),
      ecac:       !!(f.ecac_cpf?.capturado || f.ecac_caepf?.capturado)
    };

    Object.entries(mapping).forEach(([id, active]) => {
      const dot = document.getElementById(`sigess-dot-${id}`);
      if (dot) {
        if (active) {
          dot.style.background = "#10b981";
          dot.style.boxShadow = "0 0 6px #10b981";
        } else {
          dot.style.background = "#334155";
          dot.style.boxShadow = "none";
        }
      }
    });

    const root = document.getElementById(ID_ROOT);
    if (root && data?.nome) {
      root.title = `Capturado: ${data.nome}`;
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sigessSettings) {
      const settings = changes.sigessSettings.newValue || {};
      
      if (!settings.autoRegistrationEnabled) {
        removeUI();
      } else if (globalThis.self === globalThis.top) {
        createUI();
        void updateFromStorage();
      }
    }
    if (changes.sigessActiveCadastro && globalThis.self === globalThis.top) {
      const session = changes.sigessActiveCadastro.newValue as CadastroSession | undefined;
      if (session?.sessionState === "active") createUI();
      void updateFromStorage();
    }
  });

  const init = async () => {
    const result = await chrome.storage.local.get(["sigessSettings", "sigessActiveCadastro"]);
    const settings = result.sigessSettings || {};
    const session = result.sigessActiveCadastro as CadastroSession | undefined;

    if (!settings.autoRegistrationEnabled && session?.sessionState !== "active") return;

    const host = globalThis.location.hostname;
    const isTarget =
      host.includes(".gov.br") ||
      host.includes("mpa.gov.br") ||
      host.includes("sigess") ||
      host === "localhost";

    if (isTarget && document.body && globalThis.self === globalThis.top) {
      createUI();
      let _reinjTimeout: ReturnType<typeof setTimeout> | null = null;
      new MutationObserver(() => {
        if (_reinjTimeout) return;
        _reinjTimeout = setTimeout(() => {
          _reinjTimeout = null;
          if (!document.getElementById(ID_ROOT)) {
            chrome.storage.local.get("sigessSettings").then(r => {
              if (r.sigessSettings?.autoRegistrationEnabled) createUI();
            });
          }
        }, 300);
      }).observe(document.body, { childList: true });
    }
  };

  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
