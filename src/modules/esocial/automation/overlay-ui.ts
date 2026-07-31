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
      return `<span style="height: 4px; flex: 1; background: ${
        filled ? "#0f766e" : "#d9e2ec"
      }; transition: background 0.2s ease;"></span>`;
    })
    .join("");

  overlay.innerHTML = `<section role="status" aria-live="polite" style="background: #ffffff; padding: 26px 28px; border-left: 3px solid ${
    state.complete ? "#0f766e" : "#176b68"
  }; width: min(420px, calc(100vw - 32px)); font-family: 'Segoe UI', Tahoma, sans-serif; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.22); color: #1f2937; display: flex; flex-direction: column; align-items: stretch; gap: 18px;">
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div aria-hidden="true" style="margin-top:2px; width: 24px; height: 24px; border: 3px solid #dfe8e7; border-top-color: ${
          state.complete ? "#16a34a" : "#176b68"
        }; border-radius: 50%; animation: ${
          state.complete ? "none" : "sigessEsocialSpin 1s linear infinite"
        };"></div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span style="font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#176b68;">SIGESS · eSocial</span>
          <strong style="font-size: 16px; color: #1f2937; line-height:1.35;">${escapeHtml(state.title)}</strong>
          <span style="font-size: 12px; color: #667085; line-height:1.5;">${escapeHtml(state.description)}</span>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:14px; border-top:1px solid #e5eaed; font-size:11px; color:#667085;">
        <span>Andamento da emissão</span>
        <span>Etapa ${overlayStep} de ${overlayTotal}</span>
      </div>
      <div style="display:flex; gap:6px;">${segments}</div>
    </section>
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
