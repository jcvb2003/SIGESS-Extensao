import { Manager } from "./manager";
import { State } from "./state";
import { Icons } from "./utils/icons";
import { DaysGenerator } from "./generators/schedule";
import { ProductionGenerator } from "./generators/fish";
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
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      el.style.top = `${startTop + (e.clientY - startY)}px`;
      el.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
      el.style.cursor = "move";
    });
  },
};
const isReapPage = () => {
  const h = window.location.href;
  return (
    h.includes("mpa.gov.br") &&
    (h.includes("/manutencao/") ||
      h.includes("/reap-simplificada/") ||
      h.includes("cadastro/") ||
      h.includes("informe-mensal"))
  );
};
const injectButton = () => {
  let container = document.getElementById("sigess-reap-container");
  const onReap = isReapPage();
  if (onReap) {
    if (!container) {
      container = document.createElement("div");
      container.id = "sigess-reap-container";
      container.style.cssText = `position: fixed; top: 120px; right: 20px; z-index: 100000; background: white; border: 2px solid #007bff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 8px; padding: 12px; width: 180px; font-family: sans-serif; cursor: move;`;
      const title = document.createElement("div");
      title.innerText = "🤖 REAP 2025";
      title.style.cssText =
        "font-weight: bold; text-align: center; color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 14px;";
      container.appendChild(title);
      const row = document.createElement("div");
      row.style.cssText =
        "display: flex; flex-direction: column; gap: 4px; margin-top: 4px;";
      const lbl = document.createElement("label");
      lbl.innerText = "Gênero:";
      lbl.style.fontSize = "11px";
      lbl.style.color = "#666";
      const segmentContainer = document.createElement("div");
      segmentContainer.style.cssText =
        "display: flex; background: #f0f0f0; border-radius: 6px; padding: 2px; border: 1px solid #ddd;";
      const createGenderBtn = (
        label: string,
        value: "MASCULINO" | "FEMININO",
        activeColor: string,
      ) => {
        const b = document.createElement("div");
        b.innerText = label;
        b.style.cssText =
          "flex: 1; text-align: center; font-size: 11px; padding: 6px 0; border-radius: 4px; cursor: pointer; transition: all 0.2s; font-weight: bold;";
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
        b.onclick = () => {
          if (!State.isRunning) {
            State.gender = value;
            (window as any).refreshSigessUI();
          }
        };
        return { btn: b, update };
      };
      const male = createGenderBtn("🧔 Masc", "MASCULINO", "#007bff");
      const female = createGenderBtn("👩 Fem", "FEMININO", "#e91e63");
      const refreshUI = () => {
        updateGrid();
        male.update();
        female.update();
        if (State.isRunning) {
          btn.innerHTML = `${Icons.pause} Pausar`;
          btn.style.background = "#ffc107";
        } else if (State.isPaused) {
          btn.innerHTML = `${Icons.play} Continuar`;
          btn.style.background = "#28a745";
        } else {
          btn.innerHTML = `${Icons.play} Iniciar`;
          btn.style.background = "#007bff";
        }
        segmentContainer.style.opacity =
          State.isRunning || State.isPaused ? "0.6" : "1";
        segmentContainer.style.pointerEvents =
          State.isRunning || State.isPaused ? "none" : "auto";
      };
      (window as any).refreshSigessUI = refreshUI;
      segmentContainer.appendChild(male.btn);
      segmentContainer.appendChild(female.btn);
      row.appendChild(lbl);
      row.appendChild(segmentContainer);
      container.appendChild(row);
      const grid = document.createElement("div");
      grid.id = "sigess-month-grid";
      grid.style.cssText =
        "display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #eee;";
      function updateGrid() {
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 12; i++) {
          const mBtn = document.createElement("div");
          mBtn.innerText = String(i + 1);
          let bgColor = "#f0f0f0";
          let textColor = "#666";
          let border = "1px solid #ccc";
          if (State.currentMonthIndex === i) {
            bgColor = "#007bff";
            textColor = "white";
            border = "1px solid #0056b3";
          } else if (State.monthlyProgress[i] === "done") {
            bgColor = "#28a745";
            textColor = "white";
            border = "1px solid #1e7e34";
          } else if (State.monthlyProgress[i] === "skipped") {
            bgColor = "#6c757d";
            textColor = "white";
            border = "1px solid #545b62";
            mBtn.style.opacity = "0.5";
          }
          mBtn.style.cssText = `cursor: pointer; text-align: center; font-size: 10px; padding: 4px 0; border-radius: 4px; background: ${bgColor}; color: ${textColor}; border: ${border}; font-weight: bold;`;
          mBtn.onclick = () => {
            if (!State.isRunning && !State.isPaused) {
              State.currentMonthIndex = i;
              refreshUI();
            }
          };
          fragment.appendChild(mBtn);
        }
        grid.innerHTML = "";
        grid.appendChild(fragment);
      }
      container.appendChild(grid);
      const btn = document.createElement("button");
      btn.id = "sigess-reap-btn";
      btn.style.cssText =
        "padding: 8px; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 8px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;";
      btn.onclick = (e) => {
        e.stopPropagation();
        if (!State.isRunning) {
          Manager.start();
        } else {
          Manager.pause();
        }
      };
      container.appendChild(btn);

      const btnTurbo = document.createElement("button");
      btnTurbo.id = "sigess-reap-turbo-btn";
      btnTurbo.style.cssText =
        "padding: 8px; background: #6f42c1; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-top: 4px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;";
      btnTurbo.innerHTML = `⚡ Turbo API`;
      btnTurbo.onclick = async (e) => {
        e.stopPropagation();
        if (State.isRunning) return;
        
        btnTurbo.innerHTML = "⏳ Aguarde...";
        btnTurbo.style.background = "#5a32a3";
        
        try {
          if (!State.daysMap || Object.keys(State.daysMap).length === 0) {
             State.daysMap = DaysGenerator.generate(State.gender);
          }
          if (!State.production || State.production.length === 0) {
             State.production = ProductionGenerator.generate(State.daysMap, State.gender);
          }
          
          const FISH_IDS: Record<string, number> = {
            "Matrinxã ou Jatuarana": 15,
            "Acará": 25,
            "Aracu": 26,
            "Traíra": 21,
            "Mapará": 12
          };
          
          const config: any = {
             areaRealizacao: {
               localPesca: 6, // Rio
               uf: 5,         // PA
               municipio: 4718, // Oeiras do Pará
               petrechosPesca: [4], // Emalhe
               ambientePesca: 1 // Água Doce
             },
             meses: []
          };
          
          for (let i = 0; i < 12; i++) {
             const especies = State.production
                .map((fish: any) => {
                   const monthlyKg = fish.monthlyKg[i] || 0;
                   if (monthlyKg <= 0) return null;
                   return {
                     especiePescado: FISH_IDS[fish.name] || 12,
                     unidadeMedida: 1,
                     quantidade: monthlyKg,
                     valorMedioQuilo: fish.price
                   };
                })
                .filter((f: any) => f !== null);

             if (especies.length === 0) {
                 config.meses.push({
                    mes: i + 1,
                    houvePesca: false,
                    justificativa: 1
                 });
             } else {
                 config.meses.push({
                    mes: i + 1,
                    houvePesca: true,
                    diasTrabalhados: State.daysMap[i] || 16,
                    especies
                 });
             }
          }
          
          const response = await browser.runtime.sendMessage({
            action: "turboFillReap",
            config
          });
          
          if (response?.success) {
            btnTurbo.innerHTML = "✅ Concluído!";
            btnTurbo.style.background = "#28a745";
          } else {
            alert(response?.error || 'Erro desconhecido');
            btnTurbo.innerHTML = `⚡ Turbo API`;
            btnTurbo.style.background = "#6f42c1";
          }
        } catch (err: any) {
          alert("Erro: " + err.message);
          btnTurbo.innerHTML = `⚡ Turbo API`;
          btnTurbo.style.background = "#6f42c1";
        }
      };
      container.appendChild(btnTurbo);

      refreshUI();
      const resetBtn = document.createElement("button");
      resetBtn.innerHTML = `${Icons.refresh} Resetar`;
      resetBtn.style.cssText =
        "padding: 6px; background: #6c757d; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;";
      resetBtn.onclick = (e) => {
        e.stopPropagation();
        State.reset();
        Manager.stop();
      };
      container.appendChild(resetBtn);
      Draggable.init(container);
      document.body.appendChild(container);
    } else if (container.style.display === "none") {
      container.style.display = "flex";
    }
  } else {
    if (container && container.style.display !== "none") {
      container.style.display = "none";
    }
  }
};
let filterTimeout: any = null;
export const initUI = () => {
  const observer = new MutationObserver((mutations) => {
    if (filterTimeout) return;
    const hasExternalMutation = mutations.some((m) => {
      const container = document.getElementById("sigess-reap-container");
      return !container || !container.contains(m.target as Node);
    });
    if (hasExternalMutation) {
      filterTimeout = setTimeout(() => {
        injectButton();
        filterTimeout = null;
      }, 500);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  injectButton();
};
