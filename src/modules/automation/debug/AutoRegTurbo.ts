import { PessoaData } from "../../../shared/types";

(function () {
  const Draggable = {
    init(el: HTMLElement, handle: HTMLElement) {
      let isDragging = false,
        startX = 0,
        startY = 0,
        startLeft = 0,
        startTop = 0;

      handle.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        el.style.cursor = "grabbing";
        e.preventDefault();
      });

      globalThis.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        el.style.left = `${startLeft + (e.clientX - startX)}px`;
        el.style.top = `${startTop + (e.clientY - startY)}px`;
        el.style.bottom = "auto";
        el.style.right = "auto";
      });

      globalThis.addEventListener("mouseup", () => {
        isDragging = false;
        el.style.cursor = "default";
      });
    },
  };

  function createOverlay() {
    if (document.getElementById("sigess-auto-reg-turbo")) return;

    const root = document.createElement("div");
    root.id = "sigess-auto-reg-turbo";
    root.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 320px;
        z-index: 2147483647;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        color: #f8fafc;
        overflow: hidden;
        user-select: none;
    `;

    const handle = document.createElement("div");
    handle.style.cssText = `
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    `;
    handle.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 8px #22c55e;"></div>
            <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #10b981;">AUTO-REG TURBO</span>
        </div>
        <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">v1.0.0-FLEX</span>
    `;
    root.appendChild(handle);

    const content = document.createElement("div");
    content.style.padding = "12px";
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.gap = "10px";

    // Status das Fontes
    const statusContainer = document.createElement("div");
    statusContainer.style.display = "grid";
    statusContainer.style.gridTemplateColumns = "repeat(2, 1fr)";
    statusContainer.style.gap = "6px";

    const sources = ["MPA", "eSocial", "CadÚnico", "TSE"];
    sources.forEach(src => {
      const box = document.createElement("div");
      box.id = `turbo-status-${src.toLowerCase().replace('ú', 'u')}`;
      box.style.cssText = `
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 6px;
          padding: 6px 8px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 10px;
          font-weight: 600;
      `;
      box.innerHTML = `<span>${src}</span> <span class="indicator" style="color: #64748b;">⏳</span>`;
      statusContainer.appendChild(box);
    });
    content.appendChild(statusContainer);

    // Terminal de Logs
    const terminal = document.createElement("div");
    terminal.id = "turbo-log-terminal";
    terminal.style.cssText = `
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        height: 100px;
        overflow-y: auto;
        padding: 6px;
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
    `;
    content.appendChild(terminal);

    // Preview de Dados
    const preview = document.createElement("div");
    preview.id = "turbo-data-preview";
    preview.style.cssText = `
        font-size: 11px;
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.2);
        border-radius: 8px;
        padding: 8px;
        display: none;
    `;
    content.appendChild(preview);

    root.appendChild(content);
    document.body.appendChild(root);
    Draggable.init(root, handle);

    addLog("Sistema Turbo inicializado.");
    updateFromStorage();
  }

  function addLog(msg: string, type: "info" | "success" | "warn" | "error" = "info") {
    const terminal = document.getElementById("turbo-log-terminal");
    if (!terminal) return;

    const colors = {
      info: "#cbd5e1",
      success: "#10b981",
      warn: "#f59e0b",
      error: "#ef4444"
    };

    const line = document.createElement("div");
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.innerHTML = `<span style="color: #475569;">[${time}]</span> <span style="color: ${colors[type]};">${msg}</span>`;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
  }

  async function updateFromStorage() {
    const result = await chrome.storage.local.get("sigessSettings");
    const settings = result.sigessSettings || {};
    const data = settings.pessoaData as PessoaData;
    if (!data) return;

    updateUIWithData(data);
  }

  function updateUIWithData(data: PessoaData) {
    const fontes = data.fontes || {};
    const sources = {
      mpa: !!fontes.pesqbrasil?.capturado,
      esocial: !!fontes.caepf?.capturado,
      cadunico: !!fontes.cadunico_adv?.capturado || !!fontes.cadunico?.capturado,
      tse: !!fontes.tse?.capturado
    };

    Object.entries(sources).forEach(([src, active]) => {
      const box = document.getElementById(`turbo-status-${src}`);
      if (box) {
        const indicator = box.querySelector(".indicator") as HTMLElement;
        if (active) {
          indicator.innerText = "✅";
          indicator.style.color = "#10b981";
          box.style.background = "rgba(16, 185, 129, 0.05)";
          box.style.borderColor = "rgba(16, 185, 129, 0.2)";
        }
      }
    });

    // Update Preview
    const preview = document.getElementById("turbo-data-preview");
    if (preview && data.nome) {
      preview.style.display = "block";
      preview.innerHTML = `
        <div style="font-weight: 700; color: #10b981; margin-bottom: 4px;">Sócio Capturado:</div>
        <div style="font-size: 12px; font-weight: 600;">${data.nome}</div>
        <div style="color: #94a3b8; font-size: 10px; margin-top: 2px;">CPF: ${data.cpf || '---'} | RGP: ${data.rgp || '---'}</div>
      `;
    }
  }

  // Listeners
  globalThis.addEventListener("message", (event) => {
    const { type } = (event?.data || {}) as { type?: string };
    if (type?.startsWith("SIGESS_")) {
        // Encontra o nome da fonte apenas para debug interno se necessário
    }
  });

  // Escuta logs disparados pelo content script
  globalThis.addEventListener("SIGESS_DEBUG_LOG", (e: any) => {
    const { msg, type } = e.detail;
    addLog(msg, type);
  });

  // Escuta mudanças no storage em tempo real
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.sigessSettings) {
      const settings = changes.sigessSettings.newValue || {};
      if (settings.pessoaData) {
        updateUIWithData(settings.pessoaData as PessoaData);
        addLog("Banco de dados local atualizado.", "success");
      }
    }
  });

  // Inicializa se a página for um site governamental ou SIGESS
  const host = globalThis.location.hostname;
  const isGov = host.includes(".gov.br") || host.includes(".jus.br") || host.includes("mpa.gov.br");
  const isSigess = host.includes("sigess");

  if (isGov || isSigess) {
    console.log("SIGESS: Auto-Reg Turbo script running on " + host);
    
    const initTurbo = () => {
        if (!document.body) {
            // Se o body ainda não existe, tenta novamente em breve
            setTimeout(initTurbo, 100);
            return;
        }
        createOverlay();
        
        // Em SPAs (CadÚnico/eSocial), o DOM pode ser limpo. Monitoramos o body.
        new MutationObserver(() => {
          if (!document.getElementById("sigess-auto-reg-turbo")) {
            createOverlay();
          }
        }).observe(document.body, { childList: true, subtree: false });
    };

    // Tenta iniciar
    if (document.readyState !== "loading") {
      initTurbo();
    } else {
      globalThis.addEventListener("DOMContentLoaded", initTurbo);
    }
  }
})();
