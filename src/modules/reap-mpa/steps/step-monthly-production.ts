import { State } from '../session-state';
import { DaysGenerator } from '../generators/days-schedule';
import { ProductionGenerator } from '../generators/fish-production';
import { Utils } from '../utils/dom-utils';
import { IWorkflowManager } from "../types";
import { MUNICIPIOS_LIST } from '../../../shared/data/municipios';

const MONTHS_MAP: Record<string, number> = {
  JANEIRO: 0, FEVEREIRO: 1, MARÇO: 2, MARCO: 2, ABRIL: 3, MAIO: 4, JUNHO: 5,
  JULHO: 6, AGOSTO: 7, SETEMBRO: 8, OUTUBRO: 9, NOVEMBRO: 10, DEZEMBRO: 11,
};

export const Page3 = {
  isCurrentPage: () =>
    !!document.querySelector(".br-accordion") &&
    document.querySelectorAll(".br-accordion").length >= 1,

  execute: async (manager: IWorkflowManager) => {
    console.log("REAP: Executando Página 3 (Meses)...");
    State.currentPage = 3;

    await Page3.ensureInitialData();
    const months = document.querySelectorAll(".br-accordion");
    const startIndex = Page3.getStartIndex(months);

    console.log(`Continuando a partir do accordion index ${startIndex}`);
    for (let i = startIndex; i < months.length; i++) {
      const monthAccordion = months[i] as HTMLElement;
      const realMonthIndex = Page3.getRealMonthIndex(monthAccordion);
      if (realMonthIndex === -1) continue;

      State.currentMonthIndex = realMonthIndex;
      await Page3.refreshUI();

      if (State.turboFillMode === "parcial" && !State.turboSelectedMonths.has(realMonthIndex)) {
        continue;
      }

      if (Page3.isMonthUnavailable(monthAccordion)) {
        State.monthlyProgress[realMonthIndex || i] = "skipped";
        continue;
      }

      if (State.stopRequested) break;

      await Page3.processMonth(monthAccordion, realMonthIndex);
      State.monthlyProgress[realMonthIndex] = "done";
      await Page3.refreshUI();
    }

    if (!State.stopRequested) {
      State.currentMonthIndex = -1;
      await Page3.refreshUI();
      alert("Página 3 Preenchida!");
      manager.stop();
    }
  },

  ensureInitialData: async () => {
    const settings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};

    if (!State.daysMap || Object.keys(State.daysMap).length === 0) {
      State.daysMap = DaysGenerator.generate(State.gender, settings);
    }
    if (!State.production || State.production.length === 0) {
      State.production = ProductionGenerator.generate(State.daysMap, State.gender, settings);
    }
  },

  getStartIndex: (months: NodeListOf<Element>) => {
    if (State.turboFillMode === "parcial") return 0;
    if (State.currentMonthIndex === undefined || State.currentMonthIndex <= 0) return 0;

    for (let idx = 0; idx < months.length; idx++) {
      const monthText = months[idx].querySelector("button.header")?.textContent?.trim().toUpperCase() || "";
      let accMonthIndex = idx;
      for (const [key, value] of Object.entries(MONTHS_MAP)) {
        if (monthText.includes(key)) {
          accMonthIndex = value;
          break;
        }
      }
      if (accMonthIndex >= State.currentMonthIndex) return idx;
    }
    return 0;
  },

  getRealMonthIndex: (monthAccordion: HTMLElement) => {
    const monthText = monthAccordion.querySelector("button.header")?.textContent?.trim().toUpperCase() || "";
    for (const [key, value] of Object.entries(MONTHS_MAP)) {
      if (monthText.startsWith(key)) return value;
    }
    for (const [key, value] of Object.entries(MONTHS_MAP)) {
      if (monthText.includes(key)) return value;
    }
    return -1;
  },

  isMonthUnavailable: (monthAccordion: HTMLElement) => {
    const monthText = monthAccordion.querySelector("button.header")?.textContent?.trim().toUpperCase() || "";
    if (monthText.includes("NÃO DISPONÍVEL")) {
      console.log(`REAP: Pulando ${monthText} (Não disponível)`);
      return true;
    }
    return false;
  },

  refreshUI: async () => {
    if ((globalThis as any).refreshSigessUI) {
      (globalThis as any).refreshSigessUI();
      await Utils.sleep(50);
    }
  },

  processMonth: async (monthAccordion: HTMLElement, realMonthIndex: number) => {
    const btn = monthAccordion.querySelector("button.header") as HTMLElement;
    const monthName = btn?.textContent?.trim() || `Mês ${realMonthIndex + 1}`;
    console.log(`REAP: Processando ${monthName} (${realMonthIndex + 1}/12)`);

    monthAccordion.scrollIntoView({ behavior: "smooth", block: "center" });
    await Utils.sleep(500);

    if (btn.getAttribute("aria-expanded") !== "true") {
      btn.click();
      await Utils.waitFor(() => monthAccordion.querySelector(".content") !== null, 5000);
      await Utils.sleep(300);
    }

    const activeContent = monthAccordion.querySelector(".content") as HTMLElement;
    if (!activeContent) return;

    if (realMonthIndex <= 3) {
      await Page3.fillDefeso(activeContent);
    } else {
      await Page3.fillNormalMonth(activeContent, realMonthIndex);
    }
    await Utils.sleep(500);
  },

  fillDefeso: async (activeContent: HTMLElement) => {
    const radioNao = activeContent.querySelector(`input[name*="houvePesca"][value="false"]`) as HTMLInputElement;
    if (radioNao && !radioNao.checked) {
      activeContent.querySelector(`label[for="${radioNao.id}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Utils.sleep(400);
    }
    const checkDefeso = activeContent.querySelector(`input[name*="justificativasNaoDeclaracao"][value="1"]`) as HTMLInputElement;
    if (checkDefeso && !checkDefeso.checked) {
      activeContent.querySelector(`label[for="${checkDefeso.id}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  },

  fillNormalMonth: async (activeContent: HTMLElement, realMonthIndex: number) => {
    const radioSim = activeContent.querySelector(`input[name*="houvePesca"][value="true"]`) as HTMLInputElement;
    if (radioSim && !radioSim.checked) {
      activeContent.querySelector(`label[for="${radioSim.id}"]`)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Utils.sleep(600);
    }

    const diasInput = activeContent.querySelector(`input[name*="diasTrabalhados"]`) as HTMLInputElement;
    if (diasInput) Utils.setReactInput(diasInput, String(State.daysMap[realMonthIndex] || 16));

    await Page3.fillAreaTable(activeContent);
    await Page3.fillProductionTable(activeContent, realMonthIndex);
  },

  fillAreaTable: async (activeContent: HTMLElement) => {
    const areaTable = Array.from(activeContent.querySelectorAll(".table-title"))
      .find(el => el.textContent?.includes("Área"))?.closest(".br-table") as HTMLElement;
    if (!areaTable) return;

    await Utils.selectOption(areaTable.querySelector("td:nth-child(1) .br-select") as HTMLElement, "Rio");
    await Utils.selectOption(areaTable.querySelector("td:nth-child(2) .br-select") as HTMLElement, "PARA");

    const munSelect = areaTable.querySelector("td:nth-child(3) .br-select") as HTMLElement;
    if (munSelect) {
      const settings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
      const municipio = MUNICIPIOS_LIST.find(m => m.id === settings.mpaMunicipio);
      const municipioName = municipio?.nome || "";

      let attempts = 0;
      while (attempts < 10 && !State.stopRequested) {
        if (await Utils.fillAutocomplete(munSelect, municipioName)) break;
        await Utils.sleep(500);
        attempts++;
      }
    }
    await Utils.selectOption(areaTable.querySelector("td:nth-child(5) .br-select") as HTMLElement, "Emalhe");
    await Utils.selectOption(areaTable.querySelector("td:nth-child(6) .br-select") as HTMLElement, "Água Doce");
  },

  fillProductionTable: async (activeContent: HTMLElement, realMonthIndex: number) => {
    const prodTable = Array.from(activeContent.querySelectorAll(".table-title"))
      .find(el => el.textContent?.includes("Resultado"))?.closest(".br-table") as HTMLElement;
    if (!prodTable) return;

    const settings = (await browser.storage.local.get("sigessSettings")).sigessSettings || {};
    const targetSpeciesLabel = settings.mpaEspecieLabel || "";

    for (let fishIdx = 0; fishIdx < State.production.length; fishIdx++) {
      const fish = State.production[fishIdx];
      const monthlyKg = fish.monthlyKg[realMonthIndex] || 0;
      if (monthlyKg === 0) continue;

      await Page3.ensureRowExists(prodTable, fishIdx);
      const row = prodTable.querySelectorAll("tbody tr")[fishIdx] as HTMLElement;
      if (!row) continue;

      await Page3.fillProductionRow(row, fish, monthlyKg, targetSpeciesLabel);
    }
  },

  ensureRowExists: async (prodTable: HTMLElement, fishIdx: number) => {
    const rows = prodTable.querySelectorAll("tbody tr");
    if (rows[fishIdx] || fishIdx === 0) return;

    const addBtn = Array.from(prodTable.querySelectorAll("button")).find(b => b.textContent?.includes("Adicionar")) as HTMLElement;
    if (addBtn) {
      addBtn.click();
      await Utils.waitFor(() => prodTable.querySelectorAll("tbody tr").length > fishIdx, 3000);
    }
  },

  fillProductionRow: async (row: HTMLElement, fish: any, monthlyKg: number, targetSpeciesLabel: string) => {
    const specSelect = row.querySelector("td:nth-child(1) .br-select") as HTMLElement;
    if (specSelect) await Utils.fillAutocomplete(specSelect, targetSpeciesLabel || fish.name);
    await Utils.selectOption(row.querySelector("td:nth-child(2) .br-select") as HTMLElement, "Quilo");

    const qtdInput = row.querySelector("td:nth-child(3) input") as HTMLInputElement;
    if (qtdInput) Utils.setReactInput(qtdInput, String(monthlyKg));

    const valInput = row.querySelector("td:nth-child(4) input") as HTMLInputElement;
    if (valInput) Utils.setReactInput(valInput, fish.price.toFixed(2).replace(".", ","));
    await Utils.sleep(300);
  }
};
