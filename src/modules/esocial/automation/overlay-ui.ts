import {
  ESOCIAL_PROGRESS_OVERLAY_ID,
  ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY,
} from "../utils/esocial-constants";
import type { EsocialOverlayState } from "../types";

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

  let overlay = document.getElementById(ESOCIAL_PROGRESS_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = ESOCIAL_PROGRESS_OVERLAY_ID;
    overlay.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 99999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);";
    document.body.appendChild(overlay);
  }

  const overlayTotal = Math.max(1, state.total || 1);
  const overlayStep = Math.min(
    overlayTotal,
    Math.max(1, state.complete ? overlayTotal : state.step || 1),
  );

  const segments = Array.from({ length: overlayTotal })
    .map((_, index) => {
      const filled = index < overlayStep;
      return `<span style="height: 8px; flex: 1; border-radius: 999px; background: ${
        filled ? "#007bff" : "#d9e2ec"
      }; transition: background 0.2s ease;"></span>`;
    })
    .join("");

  overlay.innerHTML = `<div style="background: white; padding: 24px 28px; border-radius: 14px; width: min(420px, calc(100vw - 32px)); font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.3); color: #0f172a; display: flex; flex-direction: column; align-items: stretch; gap: 14px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width: 30px; height: 30px; border: 4px solid #f3f3f3; border-top: 4px solid ${
          state.complete ? "#16a34a" : "#007bff"
        }; border-radius: 50%; animation: ${
          state.complete ? "none" : "sigessEsocialSpin 1s linear infinite"
        };"></div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <strong style="font-size: 16px; color: #0f172a;">${escapeHtml(state.title)}</strong>
          <span style="font-size: 12px; color: #475569;">${escapeHtml(state.description)}</span>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#475569;">
        <span>Progresso do script</span>
        <span>${overlayStep}/${overlayTotal}</span>
      </div>
      <div style="display:flex; gap:6px;">${segments}</div>
    </div>
    <style>@keyframes sigessEsocialSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
  overlay.style.display = "flex";

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
  const overlay = document.getElementById(ESOCIAL_PROGRESS_OVERLAY_ID);
  if (overlay) {
    overlay.remove();
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
  const overlayState = (extra?.overlayState as EsocialOverlayState | null | undefined) ?? undefined;
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

export function showSuccessModal(title: string = "Boleto Gerado!", onClose?: () => void) {
  if (!document.body) {
    document.addEventListener(
      "DOMContentLoaded",
      () => showSuccessModal(title, onClose),
      { once: true },
    );
    return;
  }

  const modalId = "sigess-success-modal";
  let modal = document.getElementById(modalId);

  if (modal) {
    modal.remove();
  }

  modal = document.createElement("div");
  modal.id = modalId;
  modal.style.cssText =
    "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);";

  const content = document.createElement("div");
  content.style.cssText =
    "background: white; padding: 32px; border-radius: 12px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.3); font-family: sans-serif; max-width: 400px;";

  content.innerHTML = `
    <div style="margin-bottom: 24px;">
      <div style="font-size: 48px; margin-bottom: 16px;">✓</div>
      <h2 style="margin: 0; color: #16a34a; font-size: 24px; font-weight: 600;">${escapeHtml(title)}</h2>
    </div>
    <button id="sigess-modal-ok" style="
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

  const okButton = document.getElementById("sigess-modal-ok");
  if (okButton) {
    okButton.addEventListener("click", () => {
      modal?.remove();
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
