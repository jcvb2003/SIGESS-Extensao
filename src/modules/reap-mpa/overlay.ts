import { WorkflowManager } from './workflow';
import { State } from './session-state';
import { Icons } from "./utils/icons";
import { Utils } from './utils/dom-utils';
import { DaysGenerator } from './generators/days-schedule';
import { ProductionGenerator } from './generators/fish-production';
import { validateReapSettings, buildTurboConfig } from './turbo-config';
import { LegacyWorkflowManager } from './legacy/workflow';

const Draggable = {
  init(el: HTMLElement) {
    let isDragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    el.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, select, input, [data-sigess-control='true']")) return;
      const rect = el.getBoundingClientRect();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      el.style.left = `${startLeft}px`;
      el.style.right = "auto";
      el.style.cursor = "grabbing";
      e.preventDefault();
    });
    globalThis.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.left = `${startLeft + (e.clientX - startX)}px`;
      el.style.top = `${startTop + (e.clientY - startY)}px`;
    });
    globalThis.addEventListener("mouseup", () => { isDragging = false; el.style.cursor = "move"; });
  },
};

const isReapPage = () => /mpa\.gov\.br\/manutencao\/[^/]+\/v\d+\/cadastro/.test(globalThis.location.href);
// LEGACY: remover quando /v1/ for descontinuado
const isV1Portal = () => /\/v1\//.test(globalThis.location.href);

const UIComponents = {
  createGenderBtn(label: string, value: "MASCULINO" | "FEMININO", activeColor: string, refreshUI: () => void) {
    const b = document.createElement("div");
    b.dataset.sigessControl = "true";
    b.innerText = label;
    b.style.cssText = "flex: 1; text-align: center; font-size: 11px; padding: 5px 0; border-radius: 4px; cursor: pointer; transition: all 0.2s; font-weight: bold;";
    const update = () => {
      if (State.gender === value) {
        b.style.background = activeColor; b.style.color = "white"; b.style.boxShadow = `0 2px 4px ${activeColor}4D`;
      } else {
        b.style.background = "transparent"; b.style.color = "#666"; b.style.boxShadow = "none";
      }
    };
    b.onclick = async () => {
      if (!State.isRunning) {
        if (State.gender !== value) { State.gender = value; State.clearData(); }
        refreshUI();
        await Utils.sleep(50);
      }
    };
    return { btn: b, update };
  },

  updateMainButton() {
    const mBtn = document.getElementById("sigess-reap-btn") as HTMLButtonElement;
    if (!mBtn) return;
    const { isRunning, isPausing, isPaused } = State;
    if (isRunning) {
      mBtn.innerHTML = isPausing ? `${Icons.pause} Pausando...` : `${Icons.pause} Pausar`;
      mBtn.style.background = "#ffc107";
      mBtn.disabled = isPausing;
    } else if (isPaused) {
      mBtn.innerHTML = `${Icons.play} Continuar`; mBtn.style.background = "#28a745"; mBtn.disabled = false;
    } else {
      mBtn.innerHTML = `Modo Rápido`; mBtn.style.background = "#007bff";
      mBtn.disabled = (globalThis as any).__sigessTurboRunning === true;
    }
  },

  updateTurboButton() {
    const tBtn = document.getElementById("sigess-reap-turbo-btn") as HTMLButtonElement;
    if (!tBtn) return;
    const isTurboRunning = (globalThis as any).__sigessTurboRunning === true;
    if (isTurboRunning) {
      tBtn.innerHTML = State.stopRequested ? "Interrompendo..." : `Interromper`;
      tBtn.style.background = "#dc3545"; tBtn.disabled = State.stopRequested;
    } else {
      tBtn.innerHTML = `Modo Turbo`; tBtn.style.background = "#6f42c1";
      tBtn.disabled = State.isRunning || State.isPaused;
    }
  },
};

async function executeTurboApi() {
  try {
    const oBtn = document.getElementById("sigess-reap-turbo-btn");
    if (oBtn) { oBtn.innerHTML = "Aguarde..."; oBtn.style.background = "#5a32a3"; }

    const storageResult = await browser.storage.local.get(["sigessSettings", "sigessReapPdfCache"]);
    const settings = storageResult.sigessSettings || {};
    const pdfCache = storageResult.sigessReapPdfCache || null;

    const errorMsg = validateReapSettings(settings, State.gender);
    if (errorMsg) {
      alert(errorMsg);
      if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
      return;
    }

    const config = buildTurboConfig(settings, pdfCache);
    const response = await browser.runtime.sendMessage({ action: "turboFillReap", config });

    if (response?.success) {
      if (oBtn) {
        oBtn.innerHTML = "Concluído!"; oBtn.style.background = "#28a745";
        setTimeout(() => { oBtn.innerHTML = "Modo Turbo"; oBtn.style.background = "#6f42c1"; }, 3000);
      }
    } else {
      alert(response?.error || 'Ocorreu um erro no Preenchimento Direto.');
      if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
    }
  } catch (err: any) {
    alert("Erro: " + err.message);
    if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
  }
}

const injectButton = async () => {
  // LEGACY: remover activeManager e usar WorkflowManager diretamente quando /v1/ for descontinuado
  const activeManager = isV1Portal() ? LegacyWorkflowManager : WorkflowManager;

  let container = document.getElementById("sigess-reap-container");
  if (!isReapPage()) { if (container) container.style.display = "none"; return; }
  if (container) {
    container.style.display = "flex";
    if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
    return;
  }

  container = document.createElement("div");
  container.id = "sigess-reap-container";
  container.style.cssText = `position: fixed; top: 120px; right: 20px; z-index: 100000; background: white; border: 2px solid #007bff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 8px; padding: 12px; width: 390px; font-family: sans-serif; cursor: move;`;

  const title = document.createElement("div");
  title.innerText = "REAP";
  title.style.cssText = "font-weight: bold; text-align: center; color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 14px;";
  container.appendChild(title);

  const columns = document.createElement("div");
  columns.style.cssText = "display: grid; grid-template-columns: minmax(155px, 1.15fr) minmax(145px, 0.85fr); gap: 12px; align-items: start;";
  const controlsColumn = document.createElement("div");
  controlsColumn.style.cssText = "display: flex; flex-direction: column; gap: 6px;";
  const monthsColumn = document.createElement("div");
  monthsColumn.style.cssText = "display: flex; flex-direction: column; gap: 4px;";
  columns.append(controlsColumn, monthsColumn);
  container.appendChild(columns);

  // --- Gênero ---
  const genderRow = document.createElement("div");
  genderRow.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 4px;";
  const genderLbl = document.createElement("label");
  genderLbl.innerText = "Gênero:"; genderLbl.style.fontSize = "11px"; genderLbl.style.color = "#666";
  const genderSeg = document.createElement("div");
  genderSeg.style.cssText = "display: flex; background: #f0f0f0; border-radius: 6px; padding: 2px; border: 1px solid #ddd;";

  let modeSeqUpdate = () => {};
  let modeParcialUpdate = () => {};

  const refreshUI = () => {
    updateGrid();
    male.update(); female.update();
    modeSeqUpdate(); modeParcialUpdate();
    UIComponents.updateMainButton();
    UIComponents.updateTurboButton();
    const busy = State.isRunning || State.isPaused;
    genderSeg.style.opacity = busy ? "0.6" : "1";
    genderSeg.style.pointerEvents = busy ? "none" : "auto";
  };
  (globalThis as any).refreshSigessUI = refreshUI;

  const male = UIComponents.createGenderBtn("Masc", "MASCULINO", "#007bff", refreshUI);
  const female = UIComponents.createGenderBtn("Fem", "FEMININO", "#e91e63", refreshUI);
  genderSeg.appendChild(male.btn); genderSeg.appendChild(female.btn);
  genderRow.appendChild(genderLbl); genderRow.appendChild(genderSeg);
  controlsColumn.appendChild(genderRow);

  // --- Modo Sequência / Parcial ---
  const modeRow = document.createElement("div");
  modeRow.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 4px;";
  const modeLbl = document.createElement("label");
  modeLbl.innerText = "Meses:"; modeLbl.style.cssText = "font-size: 11px; color: #666;";
  const modeSeg = document.createElement("div");
  modeSeg.style.cssText = "display: flex; background: #f0f0f0; border-radius: 6px; padding: 2px; border: 1px solid #ddd;";

  const createModeBtn = (label: string, value: "sequencia" | "parcial") => {
    const b = document.createElement("div");
    b.dataset.sigessControl = "true";
    b.innerText = label;
    b.style.cssText = "flex: 1; text-align: center; font-size: 11px; padding: 5px 0; border-radius: 4px; cursor: pointer; transition: all 0.2s; font-weight: bold;";
    const update = () => {
      if (State.turboFillMode === value) { b.style.background = "#6f42c1"; b.style.color = "white"; }
      else { b.style.background = "transparent"; b.style.color = "#666"; }
    };
    b.onclick = () => {
      if (!State.isRunning && State.turboFillMode !== value) {
        State.turboFillMode = value;
        if (value === "parcial") State.turboSelectedMonths = new Set();
        refreshUI();
      }
    };
    return { btn: b, update };
  };

  const modeSeq = createModeBtn("Sequência", "sequencia");
  const modeParcial = createModeBtn("Parcial", "parcial");
  modeSeqUpdate = modeSeq.update; modeParcialUpdate = modeParcial.update;
  modeSeg.appendChild(modeSeq.btn); modeSeg.appendChild(modeParcial.btn);
  modeRow.appendChild(modeLbl); modeRow.appendChild(modeSeg);
  monthsColumn.appendChild(modeRow);

  // --- Grid de meses ---
  const grid = document.createElement("div");
  grid.id = "sigess-month-grid";
  grid.style.cssText = "display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #eee;";

  function updateGrid() {
    grid.innerHTML = "";
    for (let i = 0; i < 12; i++) grid.appendChild(createMonthItem(i, refreshUI));
  }

  function createMonthItem(i: number, refresh: () => void) {
    const mBtn = document.createElement("div");
    mBtn.dataset.sigessControl = "true";
    mBtn.innerText = String(i + 1);
    let bgColor = "#f0f0f0", textColor = "#666", border = "1px solid #ccc", opacity = "1";

    if (State.monthlyProgress[i] === "done") {
      bgColor = "#28a745"; textColor = "white"; border = "1px solid #1e7e34";
    } else if (State.monthlyProgress[i] === "skipped") {
      bgColor = "#6c757d"; textColor = "white"; border = "1px solid #545b62"; opacity = "0.5";
    } else if (State.turboFillMode === "parcial") {
      const sel = State.turboSelectedMonths.has(i);
      bgColor = sel ? "#e8f4fd" : "#f0f0f0"; textColor = sel ? "#0056b3" : "#bbb";
      border = sel ? "1px solid #007bff" : "1px dashed #ccc"; opacity = sel ? "1" : "0.45";
    }

    mBtn.style.cssText = `cursor: pointer; text-align: center; font-size: 10px; padding: 4px 0; border-radius: 4px; background: ${bgColor}; color: ${textColor}; border: ${border}; font-weight: bold; transition: all 0.2s; opacity: ${opacity};`;

    if (State.turboFillMode === "sequencia" && State.currentMonthIndex === i && State.monthlyProgress[i] !== "done") {
      mBtn.style.boxShadow = "0 0 8px #007bff"; mBtn.style.border = "2px solid #007bff";
    }

    mBtn.onclick = () => {
      if (!State.isRunning) {
        if (State.turboFillMode === "parcial") {
          if (State.turboSelectedMonths.has(i)) State.turboSelectedMonths.delete(i);
          else State.turboSelectedMonths.add(i);
        } else {
          State.currentMonthIndex = i;
        }
        refresh();
      }
    };
    return mBtn;
  }
  monthsColumn.appendChild(grid);

  // --- Botão Iniciar ---
  (globalThis as any).startTurboApi = executeTurboApi;
  (globalThis as any).showTurboOverlay = () => {
    let overlay = document.getElementById("sigess-turbo-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "sigess-turbo-overlay";
      overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 99999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);";
      overlay.innerHTML = `<div style="background: white; padding: 20px 40px; border-radius: 12px; font-weight: bold; font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.3); color: #007bff; display: flex; flex-direction: column; align-items: center; gap: 10px;"><div style="width: 30px; height: 30px; border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div><span>Enviando...</span></div><style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
  };
  (globalThis as any).hideTurboOverlay = () => {
    const overlay = document.getElementById("sigess-turbo-overlay");
    if (overlay) overlay.style.display = "none";
  };

  const btn = document.createElement("button");
  btn.id = "sigess-reap-btn";
  btn.style.cssText = "padding: 5px 0; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; margin-top: 8px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;";
  btn.onclick = async (e) => {
    e.stopPropagation();
    if (State.isRunning) { activeManager.pause(); refreshUI(); return; }
    if (State.isPaused) { activeManager.start(); refreshUI(); return; }

    const settings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const errorMsg = validateReapSettings(settings, State.gender);
    if (errorMsg) { alert(errorMsg); return; }

    btn.disabled = true; btn.innerText = "Validando...";
    const lic = await browser.runtime.sendMessage({ action: "checkLicense" });
    if (!lic.ok) {
      alert(lic.reason === "limit_reached_manual"
        ? "Limite de 5 usos (Manual) atingido. Entre em contato para renovar."
        : `Erro de licença: ${lic.reason}`);
      refreshUI(); btn.disabled = false; return;
    }

    State.turboMode = false;
    activeManager.start();
    refreshUI();
  };
  controlsColumn.appendChild(btn);

  // --- Botão Turbo ---
  const btnTurbo = document.createElement("button");
  btnTurbo.id = "sigess-reap-turbo-btn";
  btnTurbo.style.cssText = "padding: 5px 0; background: #6f42c1; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; margin-top: 4px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;";
  btnTurbo.innerHTML = `Modo Turbo`;
  btnTurbo.onclick = async (e) => {
    e.stopPropagation();
    if ((globalThis as any).__sigessTurboRunning) {
      State.stopRequested = true; btnTurbo.innerHTML = "Interrompendo..."; return;
    }

    btnTurbo.disabled = true; btnTurbo.innerHTML = "Validando...";
    const settings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const errorMsg = validateReapSettings(settings, State.gender);
    if (errorMsg) { alert(errorMsg); refreshUI(); btnTurbo.disabled = false; return; }

    const lic = await browser.runtime.sendMessage({ action: "checkLicense" });
    if (!lic.ok) { alert(`Erro de licença: ${lic.reason}`); refreshUI(); btnTurbo.disabled = false; return; }

    try {
      // v1 always regenerates — no mid-run resume, and stale maps from prior v2 runs must not leak in
      if (isV1Portal() || !State.daysMap || Object.keys(State.daysMap).length === 0)
        State.daysMap = DaysGenerator.generate(State.gender, settings);
      if (isV1Portal() || !State.production || State.production.length === 0)
        State.production = ProductionGenerator.generate(State.daysMap, State.gender, settings);
    } catch (err: any) {
      alert(err.message);
      refreshUI(); btnTurbo.disabled = false; return;
    }

    State.turboMode = true;
    activeManager.start();
    refreshUI();
  };
  controlsColumn.appendChild(btnTurbo);

  refreshUI();

  // --- Botão Resetar ---
  const resetBtn = document.createElement("button");
  resetBtn.innerHTML = "Resetar";
  resetBtn.style.cssText = "padding: 5px 0; background: #6c757d; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;";
  resetBtn.onclick = (e) => { e.stopPropagation(); State.clearData(); refreshUI(); };
  controlsColumn.appendChild(resetBtn);

  Draggable.init(container);
  document.body.appendChild(container);
};

let filterTimeout: any = null;
export const initUI = () => {
  const handleVisibility = () => injectButton();
  const observer = new MutationObserver((mutations) => {
    if (filterTimeout) return;
    const hasExternalMutation = mutations.some((m) => {
      const container = document.getElementById("sigess-reap-container");
      return !(container?.contains(m.target) ?? false);
    });
    if (hasExternalMutation) {
      filterTimeout = setTimeout(() => { handleVisibility(); filterTimeout = null; }, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  globalThis.addEventListener("popstate", handleVisibility);
  globalThis.addEventListener("hashchange", handleVisibility);
  handleVisibility();
};
