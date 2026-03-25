import { State } from "../state";
import { DaysGenerator } from "../generators/schedule";
import { ProductionGenerator } from "../generators/fish";
import { Utils } from "../utils";
import { IWorkflowManager } from "../types";
import { MUNICIPIOS_LIST } from "../data/municipios";
const MONTHS_MAP: {
  [key: string]: number;
} = {
  JANEIRO: 0,
  FEVEREIRO: 1,
  MARÇO: 2,
  MARCO: 2,
  ABRIL: 3,
  MAIO: 4,
  JUNHO: 5,
  JULHO: 6,
  AGOSTO: 7,
  SETEMBRO: 8,
  OUTUBRO: 9,
  NOVEMBRO: 10,
  DEZEMBRO: 11,
};
export const Page3 = {
  isCurrentPage: () =>
    !!document.querySelector(".br-accordion") &&
    document.querySelectorAll(".br-accordion").length >= 1,
  execute: async (manager: IWorkflowManager) => {
    console.log("REAP: Executando Página 3 (Meses)...");
    State.currentPage = 3;
    const months = document.querySelectorAll(".br-accordion");
    if (!State.daysMap || Object.keys(State.daysMap).length === 0) {
      State.daysMap = DaysGenerator.generate(State.gender);
    }
    if (!State.production || State.production.length === 0) {
      State.production = ProductionGenerator.generate(
        State.daysMap,
        State.gender,
      );
    }
    let startIndex = 0;
    if (State.currentMonthIndex !== undefined && State.currentMonthIndex > 0) {
      for (let idx = 0; idx < months.length; idx++) {
        const btn = months[idx].querySelector("button.header") as HTMLElement;
        const monthText = btn?.textContent?.trim().toUpperCase() || "";
        let accMonthIndex = idx;
        for (const [key, value] of Object.entries(MONTHS_MAP)) {
          if (monthText.includes(key)) {
            accMonthIndex = value;
            break;
          }
        }
        if (accMonthIndex >= State.currentMonthIndex) {
          startIndex = idx;
          break;
        }
      }
    }
    console.log(`Continuando a partir do accordion index ${startIndex}`);
    for (let i = startIndex; i < months.length; i++) {
      const monthAccordion = months[i] as HTMLElement;
      const btn = monthAccordion.querySelector("button.header") as HTMLElement;
      const monthText = btn?.textContent?.trim().toUpperCase() || "";
      const isUnavailable = monthText.includes("NÃO DISPONÍVEL");
      let realMonthIndex = -1;
      for (const [key, value] of Object.entries(MONTHS_MAP)) {
        if (monthText.startsWith(key)) {
          realMonthIndex = value;
          break;
        }
      }
      if (realMonthIndex === -1) {
        for (const [key, value] of Object.entries(MONTHS_MAP)) {
          if (monthText.includes(key)) {
            realMonthIndex = value;
            break;
          }
        }
      }
      if (realMonthIndex === -1) continue;
      State.currentMonthIndex = realMonthIndex;
      if ((window as any).refreshSigessUI)
        (window as any).refreshSigessUI();
      if (isUnavailable) {
        console.log(`REAP: Pulando ${monthText} (Não disponível)`);
        State.monthlyProgress[realMonthIndex || i] = "skipped";
        continue;
      }
      if (State.stopRequested) {
        break;
      }
      const monthName = btn?.textContent?.trim() || `Mês ${realMonthIndex + 1}`;
      console.log(`REAP: Processando ${monthName} (${realMonthIndex + 1}/12)`);
      monthAccordion.scrollIntoView({ behavior: "smooth", block: "center" });
      await Utils.sleep(500);
      if (btn.getAttribute("aria-expanded") !== "true") {
        btn.click();
        await Utils.waitFor(
          () => monthAccordion.querySelector(".content") !== null,
          5000,
        );
        await Utils.sleep(300);
      }
      const activeContent = monthAccordion.querySelector(
        ".content",
      ) as HTMLElement;
      if (!activeContent) {
        console.warn(
          `REAP: Falha ao abrir conteúdo de ${monthName}. Pode estar travado pelo site.`,
        );
        continue;
      }
      const isDefeso = realMonthIndex <= 3;
      if (isDefeso) {
        const radioNao = activeContent.querySelector(
          `input[name*="houvePesca"][value="false"]`,
        ) as HTMLInputElement;
        if (radioNao && !radioNao.checked) {
          activeContent
            .querySelector(`label[for="${radioNao.id}"]`)
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await Utils.sleep(400);
        }
        const checkDefeso = activeContent.querySelector(
          `input[name*="justificativasNaoDeclaracao"][value="1"]`,
        ) as HTMLInputElement;
        if (checkDefeso && !checkDefeso.checked) {
          activeContent
            .querySelector(`label[for="${checkDefeso.id}"]`)
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      } else {
        const radioSim = activeContent.querySelector(
          `input[name*="houvePesca"][value="true"]`,
        ) as HTMLInputElement;
        if (radioSim && !radioSim.checked) {
          activeContent
            .querySelector(`label[for="${radioSim.id}"]`)
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          await Utils.sleep(600);
        }
        const diasInput = activeContent.querySelector(
          `input[name*="diasTrabalhados"]`,
        ) as HTMLInputElement;
        if (diasInput)
          Utils.setReactInput(
            diasInput,
            String(State.daysMap[realMonthIndex] || 16),
          );
        const areaTable = Array.from(
          activeContent.querySelectorAll(".table-title"),
        )
          .find((el) => el.textContent?.includes("Área"))
          ?.closest(".br-table") as HTMLElement;
        if (areaTable) {
          await Utils.selectOption(
            areaTable.querySelector(
              "td:nth-child(1) .br-select",
            ) as HTMLElement,
            "Rio",
          );
          await Utils.selectOption(
            areaTable.querySelector(
              "td:nth-child(2) .br-select",
            ) as HTMLElement,
            "PARA",
          );
          const munSelect = areaTable.querySelector(
            "td:nth-child(3) .br-select",
          ) as HTMLElement;
          const settings = (await browser.storage.local.get("settings")).settings || {};
          if (munSelect) {
            let attempts = 0;
            let filled = false;
            const targetMunicipio = settings.mpaMunicipioLabel || MUNICIPIOS_LIST[0].nome;
            while (attempts < 10 && !filled && !State.stopRequested) {
              filled = await Utils.fillAutocomplete(
                munSelect,
                targetMunicipio,
              );
              if (!filled) await Utils.sleep(500);
              attempts++;
            }
          }
          await Utils.selectOption(
            areaTable.querySelector(
              "td:nth-child(5) .br-select",
            ) as HTMLElement,
            "Emalhe",
          );
          await Utils.selectOption(
            areaTable.querySelector(
              "td:nth-child(6) .br-select",
            ) as HTMLElement,
            "Água Doce",
          );
        }
        const prodTable = Array.from(
          activeContent.querySelectorAll(".table-title"),
        )
          .find((el) => el.textContent?.includes("Resultado"))
          ?.closest(".br-table") as HTMLElement;
        if (prodTable) {
          const settings = (await browser.storage.local.get("settings")).settings || {};
          const targetSpeciesLabel = settings.mpaEspecieLabel || "";
          
          for (let fishIdx = 0; fishIdx < State.production.length; fishIdx++) {
            const fish = State.production[fishIdx];
            const monthlyKg = fish.monthlyKg[realMonthIndex] || 0;
            if (monthlyKg === 0) continue;
            let rows = prodTable.querySelectorAll("tbody tr");
            let row = rows[fishIdx] as HTMLElement;
            if (!row && fishIdx > 0) {
              const addBtn = Array.from(
                prodTable.querySelectorAll("button"),
              ).find((b) =>
                b.textContent?.includes("Adicionar"),
              ) as HTMLElement;
              if (addBtn) {
                addBtn.click();
                await Utils.waitFor(
                  () =>
                    prodTable.querySelectorAll("tbody tr").length > rows.length,
                  3000,
                );
                row = prodTable.querySelectorAll("tbody tr")[
                  fishIdx
                ] as HTMLElement;
              }
            }
            if (!row) continue;
            const specSelect = row.querySelector(
              "td:nth-child(1) .br-select",
            ) as HTMLElement;
            if (specSelect) await Utils.fillAutocomplete(specSelect, targetSpeciesLabel || fish.name);
            await Utils.selectOption(
              row.querySelector("td:nth-child(2) .br-select") as HTMLElement,
              "Quilo",
            );
            const qtdInput = row.querySelector(
              "td:nth-child(3) input",
            ) as HTMLInputElement;
            if (qtdInput) Utils.setReactInput(qtdInput, String(monthlyKg));
            const valInput = row.querySelector(
              "td:nth-child(4) input",
            ) as HTMLInputElement;
            if (valInput)
              Utils.setReactInput(
                valInput,
                fish.price.toFixed(2).replace(".", ","),
              );
            await Utils.sleep(300);
          }
        }
      }
      await Utils.sleep(500);
      State.monthlyProgress[realMonthIndex] = "done";
      if ((window as any).refreshSigessUI)
        (window as any).refreshSigessUI();
    }
    if (!State.stopRequested) {
      State.currentMonthIndex = 0;
      alert("Página 3 Preenchida!");
      manager.stop();
    }
  },
};
