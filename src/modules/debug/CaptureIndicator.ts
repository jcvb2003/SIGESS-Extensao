import { PessoaData } from "../../shared/types";

/**
 * Componente visual discreto que indica o status da coleta em tempo real.
 * Exibe 4 pontos (dots) que acendem conforme os dados são capturados.
 * Ordem: CadÚnico | TSE | PesqBrasil | eSocial
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

    // Label discreto
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

    // Container de pontos
    const dotContainer = document.createElement("div");
    dotContainer.style.cssText = `display: flex; gap: 6px;`;

    const sources = [
      { id: "cadunico", label: "CadÚnico" },
      { id: "tse", label: "TSE" },
      { id: "pesqbrasil", label: "PesqBrasil" },
      { id: "esocial", label: "CEI/CAEPF" }
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
    document.body.appendChild(root);

    updateFromStorage();
  }

  async function updateFromStorage() {
    const result = await chrome.storage.local.get("sigessSettings");
    const settings = result.sigessSettings || {};
    const data = settings.pessoaData as PessoaData;
    if (!data) return;

    updateDots(data);
  }

  function updateDots(data: PessoaData) {
    const f = data.fontes || {};

    const mapping = {
      cadunico: !!(f.cadunico?.capturado || f.cadunico_adv?.capturado || f.ecac_cpf?.capturado),
      tse: !!f.tse?.capturado,
      pesqbrasil: !!f.pesq_brasil?.capturado || !!f.pesqbrasil?.capturado, // suporte a ambas nomenclaturas por enquanto
      esocial: !!(f.caepf?.capturado || f.esocial?.capturado || f.ecac_caepf?.capturado)
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

    // Se tiver nome capturado, mostra um feedback visual no root
    const root = document.getElementById(ID_ROOT);
    if (root && data.nome) {
      root.title = `Capturado: ${data.nome}`;
    }
  }

  // Escuta mudanças no storage em tempo real
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sigessSettings) {
      const settings = changes.sigessSettings.newValue || {};
      if (settings.pessoaData) {
        updateDots(settings.pessoaData as PessoaData);
      }
    }
  });

  // Inicialização
  const init = async () => {
    const result = await chrome.storage.local.get("sigessSettings");
    const settings = result.sigessSettings || {};

    // Se a captura estiver desativada, não inicia o monitor
    if (settings.autoRegistrationEnabled === false) {
      console.log("SIGESS: Monitor de coleta desativado via configurações.");
      return;
    }

    const host = globalThis.location.hostname;
    const isTarget = host.includes(".gov.br") || host.includes("mpa.gov.br") || host.includes("sigess");

    if (isTarget && document.body) {
      createUI();

      // Observer para garantir que o componente permaneça no DOM (Next.js/SPAs)
      new MutationObserver(() => {
        if (!document.getElementById(ID_ROOT)) createUI();
      }).observe(document.body, { childList: true });
    }
  };

  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
