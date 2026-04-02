import { WorkflowManager } from './workflow';
import { State } from './session-state';
import { Icons } from "./utils/icons";
import { Utils } from './utils/dom-utils';
import { DaysGenerator } from './generators/days-schedule';
import { ProductionGenerator } from './generators/fish-production';

const Draggable = {
  init(el: HTMLElement) {
    let isDragging = false,
      startY = 0,
      startTop = 0;
    el.addEventListener("mousedown", (e) => {
      if (
        (e.target as HTMLElement).tagName === "BUTTON" ||
        (e.target as HTMLElement).tagName === "SELECT"
      )
        return;
      isDragging = true;
      startY = e.clientY;
      startTop = el.offsetTop;
      el.style.cursor = "grabbing";
      e.preventDefault();
    });
    globalThis.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.top = `${startTop + (e.clientY - startY)}px`;
      el.style.bottom = "auto";
    });
    globalThis.addEventListener("mouseup", () => {
      isDragging = false;
      el.style.cursor = "move";
    });
  },
};

const isReapPage = () => {
  const h = globalThis.location.href;
  return /mpa\.gov\.br\/manutencao\/[^/]+\/cadastro/.test(h);
};

const UIComponents = {
  createGenderBtn(label: string, value: "MASCULINO" | "FEMININO", activeColor: string, refreshUI: () => void) {
    const b = document.createElement("div");
    b.innerText = label;
    b.style.cssText = "flex: 1; text-align: center; font-size: 11px; padding: 6px 0; border-radius: 4px; cursor: pointer; transition: all 0.2s; font-weight: bold;";
    
    const update = () => {
      if (State.gender === value) {
        b.style.background = activeColor;
        b.style.color = "white";
        b.style.boxShadow = `0 2px 4px ${activeColor}4D`;
      } else {
        b.style.background = "transparent";
        b.style.color = "#666";
        b.style.boxShadow = "none";
      }
    };

    b.onclick = async () => {
      if (!State.isRunning) {
        if (State.gender !== value) {
          State.gender = value;
          State.clearData();
        }
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
      mBtn.innerHTML = `${Icons.play} Continuar`;
      mBtn.style.background = "#28a745";
      mBtn.disabled = false;
    } else {
      mBtn.innerHTML = `${Icons.play} Iniciar`;
      mBtn.style.background = "#007bff";
      mBtn.disabled = (globalThis as any).__sigessTurboRunning === true;
    }
  },

  updateTurboButton() {
    const tBtn = document.getElementById("sigess-reap-turbo-btn") as HTMLButtonElement;
    if (!tBtn) return;
    
    const isTurboRunning = (globalThis as any).__sigessTurboRunning === true;

    if (isTurboRunning) {
      tBtn.innerHTML = State.stopRequested ? "Interrompendo..." : `Interromper`;
      tBtn.style.background = "#dc3545";
      tBtn.disabled = State.stopRequested;
    } else {
      tBtn.innerHTML = `Preenchimento Turbo`;
      tBtn.style.background = "#6f42c1";
      tBtn.disabled = State.isRunning || State.isPaused;
    }
  }
};

function validateReapSettings(settings: any, gender: string): string | null {
  if (!settings.mpaMunicipio) {
    return "Por favor, selecione um MUNICÍPIO no painel de configurações do REAP MPA.";
  }

  const filled = (settings.mpaSpecies || []).filter((s: any) => s?.id);
  if (filled.length < 5) {
    return `Por favor, preencha pelo menos 5 espécies no painel de configurações do REAP MPA.`;
  }
  for (const s of filled) {
    if (!s.kgMin || !s.kgMax || !s.priceMin || !s.priceMax) {
      return `Preencha todos os campos numéricos (KG e VAL Mín/Máx) para todas as espécies configuradas.`;
    }
  }

  const daysPrefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
  if (!settings[`${daysPrefix}Min`] || !settings[`${daysPrefix}Max`]) {
    return `Por favor, preencha os limites (Mín/Máx) de "Dias Trab." para o gênero ${gender} no painel de configurações.`;
  }
  
  const prodPrefix = gender === "MASCULINO" ? "mpaMascProd" : "mpaFemProd";
  if (!settings[`${prodPrefix}Min`] || !settings[`${prodPrefix}Max`]) {
    return `Por favor, preencha as metas (Mín/Máx) de "Produção (R$)" para o gênero ${gender} no painel de configurações.`;
  }
  
  return null;
}

async function executeTurboApi() {
  try {
    const oBtn = document.getElementById("sigess-reap-turbo-btn");
    if (oBtn) { oBtn.innerHTML = "⏳ Aguarde..."; oBtn.style.background = "#5a32a3"; }
    
    const settingsResult = await browser.storage.local.get("sigessSettings");
    const settings = settingsResult.sigessSettings || {};
    
    const errorMsg = validateReapSettings(settings, State.gender);
    if (errorMsg) {
      alert(errorMsg);
      if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
      return;
    }

    const config = buildTurboConfig(settings);
    const response = await browser.runtime.sendMessage({ action: "turboFillReap", config });
    
    if (response?.success) {
      handleTurboSuccess(oBtn);
    } else {
      alert(response?.error || 'Ocorreu um erro no Preenchimento Direto.');
      if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
    }
  } catch (err: any) {
    alert("Erro: " + err.message);
    if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
  }
}

function buildTurboConfig(settings: any) {
  const config: any = {
    startMonth: State.currentMonthIndex + 1,
    areaRealizacao: {
      localPesca: settings.mpaLocalPesca || 6,
      uf: settings.mpaUF || 5,
      municipio: settings.mpaMunicipio, 
      petrechosPesca: [settings.mpaPetrecho || 4],
      ambientePesca: settings.mpaAmbiente || 1
    },
    meses: []
  };
  
  for (let i = 0; i < 12; i++) {
    const especies = State.production.map((fish: any) => {
      const monthlyKg = fish.monthlyKg[i] || 0;
      return monthlyKg > 0 ? { especiePescado: fish.id, unidadeMedida: 1, quantidade: monthlyKg, valorMedioQuilo: fish.price } : null;
    }).filter((f: any) => f !== null);

    if (especies.length === 0) {
      config.meses.push({ mes: i + 1, houvePesca: false, justificativa: 1 });
    } else {
      config.meses.push({ mes: i + 1, houvePesca: true, diasTrabalhados: State.daysMap[i] || 16, especies });
    }
  }
  return config;
}

function handleTurboSuccess(btn: HTMLElement | null) {
  if (btn) {
    btn.innerHTML = "✅ Concluído!";
    btn.style.background = "#28a745";
    setTimeout(() => { 
      btn.innerHTML = "Preenchimento Turbo"; 
      btn.style.background = "#6f42c1"; 
    }, 3000);
  }
}

const injectButton = async () => {
  let container = document.getElementById("sigess-reap-container");
  if (!isReapPage()) {
    if (container) container.style.display = "none";
    return;
  }

  if (container) {
    container.style.display = "flex";
    if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
    return;
  }

  container = document.createElement("div");
  container.id = "sigess-reap-container";
  container.style.cssText = `position: fixed; top: 120px; right: 20px; z-index: 100000; background: white; border: 2px solid #007bff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 8px; padding: 12px; width: 180px; font-family: sans-serif; cursor: move;`;
  
  const title = document.createElement("div");
  title.innerText = "🤖 REAP 2025";
  title.style.cssText = "font-weight: bold; text-align: center; color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 14px;";
  container.appendChild(title);

  const row = document.createElement("div");
  row.style.cssText = "display: flex; flex-direction: column; gap: 4px; margin-top: 4px;";
  const lbl = document.createElement("label");
  lbl.innerText = "Gênero:";
  lbl.style.fontSize = "11px";
  lbl.style.color = "#666";
  
  const segmentContainer = document.createElement("div");
  segmentContainer.style.cssText = "display: flex; background: #f0f0f0; border-radius: 6px; padding: 2px; border: 1px solid #ddd;";

  const refreshUI = () => {
    updateGrid();
    male.update();
    female.update();
    UIComponents.updateMainButton();
    UIComponents.updateTurboButton();
    segmentContainer.style.opacity = (State.isRunning || State.isPaused) ? "0.6" : "1";
    segmentContainer.style.pointerEvents = (State.isRunning || State.isPaused) ? "none" : "auto";
  };
  (globalThis as any).refreshSigessUI = refreshUI;

  const male = UIComponents.createGenderBtn("🧔 Masc", "MASCULINO", "#007bff", refreshUI);
  const female = UIComponents.createGenderBtn("👩 Fem", "FEMININO", "#e91e63", refreshUI);

  (globalThis as any).startTurboApi = executeTurboApi;
  
  (globalThis as any).showTurboOverlay = () => {
      let overlay = document.getElementById("sigess-turbo-overlay");
      if (!overlay) {
          overlay = document.createElement("div");
          overlay.id = "sigess-turbo-overlay";
          overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 99999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);";
          overlay.innerHTML = `<div style="background: white; padding: 20px 40px; border-radius: 12px; font-weight: bold; font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.3); color: #007bff; display: flex; flex-direction: column; align-items: center; gap: 10px;">
              <div style="width: 30px; height: 30px; border: 4px solid #f3f3f3; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <span>Enviando...</span>
          </div>
          <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
          document.body.appendChild(overlay);
      }
      overlay.style.display = "flex";
  };
  (globalThis as any).hideTurboOverlay = () => {
      const overlay = document.getElementById("sigess-turbo-overlay");
      if (overlay) overlay.style.display = "none";
  };

  segmentContainer.appendChild(male.btn);
  segmentContainer.appendChild(female.btn);
  row.appendChild(lbl);
  row.appendChild(segmentContainer);
  container.appendChild(row);

  const grid = document.createElement("div");
  grid.id = "sigess-month-grid";
  grid.style.cssText = "display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #eee;";
  
  function updateGrid() {
    grid.innerHTML = "";
    for (let i = 0; i < 12; i++) {
        grid.appendChild(createMonthItem(i, refreshUI));
    }
  }

  function createMonthItem(i: number, refresh: () => void) {
    const mBtn = document.createElement("div");
    mBtn.innerText = String(i + 1);
    let bgColor = "#f0f0f0";
    let textColor = "#666";
    let border = "1px solid #ccc";
    let opacity = "1";

    if (State.monthlyProgress[i] === "done") {
      bgColor = "#28a745"; textColor = "white"; border = "1px solid #1e7e34";
    } else if (State.monthlyProgress[i] === "skipped") {
      bgColor = "#6c757d"; textColor = "white"; border = "1px solid #545b62"; opacity = "0.5";
    }

    mBtn.style.cssText = `cursor: pointer; text-align: center; font-size: 10px; padding: 4px 0; border-radius: 4px; background: ${bgColor}; color: ${textColor}; border: ${border}; font-weight: bold; transition: all 0.2s; opacity: ${opacity};`;
    
    if (State.currentMonthIndex === i) {
       mBtn.style.boxShadow = "0 0 8px #007bff";
       if (State.monthlyProgress[i] !== "done") mBtn.style.border = "2px solid #007bff";
    }

    mBtn.onclick = () => {
      if (!State.isRunning) {
        State.currentMonthIndex = i;
        refresh();
      }
    };
    return mBtn;
  }

  container.appendChild(grid);

  const btn = document.createElement("button");
  btn.id = "sigess-reap-btn";
  btn.style.cssText = "padding: 8px; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 8px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;";
  btn.onclick = async (e) => {
    e.stopPropagation();
    if (State.isRunning) {
      WorkflowManager.pause();
      refreshUI();
      return;
    }

    if (State.isPaused) {
      WorkflowManager.start();
      refreshUI();
      return;
    }

    const settingsResult = await browser.storage.local.get("sigessSettings");
    const settings = settingsResult.sigessSettings || {};
    
    const errorMsg = validateReapSettings(settings, State.gender);
    if (errorMsg) {
      alert(errorMsg);
      return;
    }
    
    btn.disabled = true;
    btn.innerText = "Validando...";
    const lic = await browser.runtime.sendMessage({ action: "consumeLicense", usageType: "manual" });
    if (!lic.ok) {
      alert(lic.reason === "limit_reached_manual" 
        ? "Limite de 5 usos (Manual) atingido. Entre em contato para renovar." 
        : `Erro de licença: ${lic.reason}`);
      refreshUI();
      btn.disabled = false;
      return;
    }
    
    State.turboMode = false;
    WorkflowManager.start();
    refreshUI();
  };
  container.appendChild(btn);

  const btnTurbo = document.createElement("button");
  btnTurbo.id = "sigess-reap-turbo-btn";
  btnTurbo.style.cssText = "padding: 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 4px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;";
  btnTurbo.innerHTML = `Preenchimento Turbo`;
  btnTurbo.onclick = async (e) => {
    e.stopPropagation();
    if ((globalThis as any).__sigessTurboRunning) {
      State.stopRequested = true;
      btnTurbo.innerHTML = "Interrompendo...";
      return;
    }

    btnTurbo.disabled = true;
    btnTurbo.innerHTML = "Validando...";

    const settingsResult = await browser.storage.local.get("sigessSettings");
    const settings = settingsResult.sigessSettings || {};
    
    const errorMsg = validateReapSettings(settings, State.gender);
    if (errorMsg) {
      alert(errorMsg);
      refreshUI();
      btnTurbo.disabled = false;
      return;
    }

    const lic = await browser.runtime.sendMessage({ action: "checkLicense" });
    if (!lic.ok) {
      alert(`Erro de licença: ${lic.reason}`);
      refreshUI();
      btnTurbo.disabled = false;
      return;
    }
    
    if (!State.daysMap || Object.keys(State.daysMap).length === 0) {
        State.daysMap = DaysGenerator.generate(State.gender, settings);
    }
    if (!State.production || State.production.length === 0) {
      State.production = ProductionGenerator.generate(State.daysMap, State.gender, settings);
    }
    
    State.turboMode = true;
    WorkflowManager.start();
    refreshUI();
  };
  container.appendChild(btnTurbo);

  refreshUI();
  
  const resetBtn = document.createElement("button");
  resetBtn.innerHTML = `${Icons.refresh} Resetar`;
  resetBtn.style.cssText = "padding: 6px; background: #6c757d; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;";
  resetBtn.onclick = (e) => {
    e.stopPropagation();
    State.clearData();
    refreshUI();
  };
  container.appendChild(resetBtn);
  Draggable.init(container);
  document.body.appendChild(container);
};

let filterTimeout: any = null;
export const initUI = () => {
    const handleVisibility = () => {
      injectButton();
    };
  
    const observer = new MutationObserver((mutations) => {
      if (filterTimeout) return;
      const hasExternalMutation = mutations.some((m) => {
        const container = document.getElementById("sigess-reap-container");
        return !(container?.contains(m.target) ?? false);
      });
      if (hasExternalMutation) {
        filterTimeout = setTimeout(() => {
          handleVisibility();
          filterTimeout = null;
        }, 500);
      }
    });
  
    observer.observe(document.body, { childList: true, subtree: true });
    
    globalThis.addEventListener("popstate", handleVisibility);
    globalThis.addEventListener("hashchange", handleVisibility);
    
    handleVisibility();
  };
