import {
  ESOCIAL_PROGRESS_OVERLAY_ID,
  ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY,
} from "../utils/esocial-constants";
import type { EsocialOverlayState } from "../types";
import type { StatusMessage } from "../utils/status-messages";
import { hideSigessOverlay, showSigessOverlay } from "../../../shared/ui/automation-overlay";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEsocialProgressOverlay(state: EsocialOverlayState) {
  persistEsocialProgressOverlay(state);

  if (!document.body) {
    document.addEventListener(
      "DOMContentLoaded",
      () => renderEsocialProgressOverlay(state),
      { once: true },
    );
    return;
  }

  const content = document.createElement("div");
  content.style.cssText =
    "width:100%; display:flex; flex-direction:column; gap:10px; text-align:left;";

  const summary = document.createElement("div");
  summary.textContent = `Andamento da emissão · ${state.competencias?.length || state.total || 1} competência(s)`;
  summary.style.cssText =
    "font-size:11px; color:#667085; border-top:1px solid #e5eaed; padding-top:12px;";
  content.appendChild(summary);

  const list = document.createElement("div");
  list.setAttribute("role", "list");
  list.style.cssText =
    "display:flex; flex-direction:column; gap:8px; max-height:380px; overflow-y:auto; padding-right:4px;";

  const results = [...(state.competencias || [])].sort((left, right) =>
    left.competencia.localeCompare(right.competencia),
  );
  const stages = ["preparacao", "rascunho", "eventos", "fechamento", "download"] as const;

  for (const result of results) {
    const row = document.createElement("div");
    row.setAttribute("role", "listitem");
    row.style.cssText =
      "display:flex; flex-direction:column; gap:4px; padding:7px 8px; border:1px solid #e5e7eb; border-radius:9px; background:#f8fafc;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:8px;";
    const label = document.createElement("strong");
    label.textContent = formatCompetencia(result.competencia);
    label.style.cssText = "font-size:12px; color:#1f2937;";
    header.appendChild(label);

    if (result.reabertura) {
      const badge = document.createElement("span");
      badge.textContent = "REABERTURA";
      badge.style.cssText =
        "font-size:9px; font-weight:700; letter-spacing:.06em; color:#9a3412; background:#ffedd5; border:1px solid #fed7aa; border-radius:999px; padding:2px 6px;";
      header.appendChild(badge);
    }
    row.appendChild(header);

    const bars = document.createElement("div");
    bars.style.cssText = "display:flex; gap:4px; width:100%;";
    const activeIndex = Math.max(0, (result.etapaIndice || 0) - 1);
    stages.forEach((stage, index) => {
      const bar = document.createElement("span");
      const completed = result.status === "concluido" ||
        (result.status === "ja_existente" && stage === "download") ||
        (result.status === "processando" && index < activeIndex);
      const active = result.status === "processando" && index === activeIndex;
      const errored = result.status === "erro" && index === activeIndex;
      bar.title = stage;
      bar.style.cssText = `height:6px; flex:1; border-radius:999px; background:${
        errored ? "#dc2626" : completed ? "#10b981" : active ? "#34d399" : "#dbe4ea"
      }; transition:background .2s ease;${active ? " animation:sigess-esocial-stage-pulse 1.1s ease-in-out infinite;" : ""}`;
      bars.appendChild(bar);
    });
    row.appendChild(bars);

    const description = document.createElement("span");
    description.textContent = result.lastError || result.etapaDescricao || statusLabel(result.status);
    description.style.cssText = `font-size:10px; color:${result.status === "erro" ? "#b91c1c" : "#667085"};`;
    row.appendChild(description);
    list.appendChild(row);
  }
  content.appendChild(list);

  showSigessOverlay({
    id: ESOCIAL_PROGRESS_OVERLAY_ID,
    title: state.title,
    description: state.description,
    content,
    maxWidth: "520px",
    animatedDots: !state.complete,
    isSuccess: state.complete,
    hideSpinner: state.complete,
  });

  const style = document.createElement("style");
  style.textContent = `
    @keyframes sigess-esocial-stage-pulse { 0%, 100% { opacity: .55; transform: scaleX(.96); } 50% { opacity: 1; transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) { [style*="sigess-esocial-stage-pulse"] { animation: none !important; } }
  `;
  document.head?.appendChild(style);

  if (state.hideAt && state.hideAt > Date.now()) {
    window.setTimeout(() => {
      const stored = readEsocialProgressOverlay();
      if (stored?.hideAt === state.hideAt) {
        clearEsocialProgressOverlay();
      }
    }, state.hideAt - Date.now());
  }
}

export function clearEsocialProgressOverlay() {
  sessionStorage.removeItem(ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY);
  hideSigessOverlay(ESOCIAL_PROGRESS_OVERLAY_ID);
}

function formatCompetencia(competencia: string): string {
  return /^\d{6}$/.test(competencia)
    ? `${competencia.slice(4, 6)}/${competencia.slice(0, 4)}`
    : competencia;
}

type OverlayCompetenciaStatus = NonNullable<EsocialOverlayState["competencias"]>[number]["status"];

function statusLabel(status: OverlayCompetenciaStatus): string {
  switch (status) {
    case "concluido": return "Concluído";
    case "ja_existente": return "Guia existente baixada";
    case "erro": return "Erro";
    case "processando": return "Processando...";
    case "ignorado": return "Ignorado";
    default: return "Aguardando...";
  }
}

function persistEsocialProgressOverlay(state: EsocialOverlayState) {
  sessionStorage.setItem(ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY, JSON.stringify(state));
}

function readEsocialProgressOverlay(): EsocialOverlayState | null {
  try {
    const raw = sessionStorage.getItem(ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EsocialOverlayState) : null;
  } catch {
    return null;
  }
}

export function hydrateEsocialProgressOverlay() {
  const state = readEsocialProgressOverlay();
  if (!state) return;

  if (state.hideAt && state.hideAt <= Date.now()) {
    clearEsocialProgressOverlay();
    return;
  }

  renderEsocialProgressOverlay(state);
}

export function reportBatchStatus(
  status: string,
  statusTitle: string,
  statusDescription: string,
  extra?: Record<string, unknown>,
) {
  const overlayState = extra && Object.prototype.hasOwnProperty.call(extra, "overlayState")
    ? (extra.overlayState as EsocialOverlayState | null)
    : undefined;
  const payloadExtra = { ...(extra || {}) };
  delete payloadExtra.overlayState;

  try {
    const browserAPI =
      typeof browser !== "undefined" ? browser : (window as any).chrome;
    browserAPI.runtime?.sendMessage?.({
      action: "updateGovBatchStatus",
      status,
      statusTitle,
      statusDescription,
      ...payloadExtra,
    });
  } catch (error) {
    console.debug("[SIGESS] Falha ao reportar status do lote:", error);
  }

  if (overlayState === null) {
    clearEsocialProgressOverlay();
  } else if (overlayState) {
    renderEsocialProgressOverlay(overlayState);
  }
}

export function reportStatusMessage(
  message: StatusMessage,
  extra?: Record<string, unknown>,
) {
  reportBatchStatus(message.status, message.title, message.description, {
    progressFlow: message.progressFlow,
    progressStage: message.progressStage,
    ...(extra || {}),
  });
}

export function showSuccessModal(title: string = "Boleto Gerado!", onClose?: () => void) {
  if (!document.body) {
    document.addEventListener(
      "DOMContentLoaded",
      () => showSuccessModal(title, onClose),
      { once: true },
    );
    return;
  }

  clearEsocialProgressOverlay();

  const modalId = "sigess-success-modal";
  let modal = document.getElementById(modalId);

  if (modal) {
    modal.remove();
  }

  modal = document.createElement("div");
  modal.id = modalId;
  modal.style.cssText =
    "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); pointer-events: auto;";

  const content = document.createElement("div");
  content.style.cssText =
    "background: white; padding: 32px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3); font-family: sans-serif; max-width: 400px;";

  content.innerHTML = `
    <div style="margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
      <h2 style="margin: 0; color: #16a34a; font-size: 24px; font-weight: 600;">${escapeHtml(title)}</h2>
    </div>
    <button id="sigess-modal-ok" type="button" style="
      background: #007bff;
      color: white;
      border: none;
      padding: 10px 32px;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s ease;
    ">OK</button>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  const okButton = content.querySelector("#sigess-modal-ok") as HTMLButtonElement | null;
  if (okButton) {
    okButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      modal?.remove();
      clearEsocialProgressOverlay();
      onClose?.();
    });

    okButton.addEventListener("mouseover", () => {
      okButton.style.background = "#0056b3";
    });

    okButton.addEventListener("mouseout", () => {
      okButton.style.background = "#007bff";
    });
  }
}
