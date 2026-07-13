import { Utils } from "../../shared/utils/dom-helpers";
import { DaysGenerator } from '../reap-mpa/generators/days-schedule';
import { ProductionGenerator } from '../reap-mpa/generators/fish-production';
import type { FishProduction } from '../reap-mpa/types';

const MONTH_NAMES: Record<number, string> = {
  0: "Janeiro", 1: "Fevereiro", 2: "Março", 3: "Abril",
  4: "Maio", 5: "Junho", 6: "Julho", 7: "Agosto",
  8: "Setembro", 9: "Outubro", 10: "Novembro", 11: "Dezembro"
};

const getStorageSettings = async (): Promise<any> => {
  try {
    const api =
      typeof browser === "undefined"
        ? (globalThis as any).chrome
        : browser;
    if (!api?.storage?.local) {
      console.warn("SIGESS: API de Storage não disponível.");
      return {};
    }
    return new Promise((resolve) => {
      api.storage.local.get(["sigessSettings"], (result: any) => {
        resolve(result?.sigessSettings || {});
      });
    });
  } catch (e) {
    console.error("SIGESS: Falha crítica ao acessar storage:", e);
    return {};
  }
};

export const AgroManager = {
  async clickLabelByText(text: string) {
    await Utils.waitFor(() =>
      [...document.querySelectorAll("label")].some(
        (l) => l.textContent?.trim() === text,
      ),
    );
    const label = [...document.querySelectorAll("label")].find(
      (l) => l.textContent?.trim() === text,
    ) as HTMLElement;
    if (!label) throw new Error(`Label not found: ${text}`);
    label.click();
    await Utils.sleep(300);
  },

  async selectBrSelect(input: HTMLInputElement, optionText: string) {
    const container = input.closest(".br-select");
    if (!container) throw new Error("br-select container not found");
    const button = container.querySelector("button");
    await Utils.waitFor(() => button !== null && !button.disabled);
    const selected = await Utils.selectOption(container as HTMLElement, optionText);
    if (!selected) throw new Error(`Option not found: ${optionText}`);
    input.blur();
    button?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.click();
    await Utils.sleep(400);
  },

  validateAgroSettings(settings: any): string | null {
    if (!settings.mpaMunicipio) {
      return "Configure um município no painel REAP MPA.";
    }
    const filled = (settings.mpaSpecies || []).filter((s: any) => s?.id);
    if (filled.length < 5) {
      return "Configure pelo menos 5 espécies no painel REAP MPA.";
    }
    for (const s of filled) {
      if (!s.kgMin || !s.kgMax || !s.priceMin || !s.priceMax) {
        return "Preencha todos os campos numéricos das espécies no painel REAP MPA.";
      }
    }
    if (!settings.mpaMascDaysMin || !settings.mpaMascDaysMax) {
      return "Configure os limites de dias trabalhados para MASCULINO no painel REAP MPA.";
    }
    if (!settings.mpaMascProdMin || !settings.mpaMascProdMax) {
      return "Configure as metas de produção para MASCULINO no painel REAP MPA.";
    }
    return null;
  },

  async executarAutomacao() {
    const btn = document.querySelector(
      'button[data-sigess-reap="iniciar"]',
    ) as HTMLButtonElement;

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Validando Licença...";
      }

      const lic = await this.validateLicense();
      if (!lic?.ok) {
        this.handleLicenseError(lic, btn);
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = "Executando...";
      }

      const settings = await getStorageSettings();

      const validationError = this.validateAgroSettings(settings);
      if (validationError) {
        alert(validationError);
        return;
      }

      const gender: "MASCULINO" | "FEMININO" = "MASCULINO";
      const daysMap = DaysGenerator.generate(gender, settings);
      const production: FishProduction[] = ProductionGenerator.generate(daysMap, gender, settings);

      await this.runFormAutomation(production, daysMap);
      await this.applyProduction(production);
      alert("✅ Automação REAP Agro concluída com sucesso!");
    } catch (error: any) {
      console.error("Erro na automação Agro:", error);
      alert("Erro na automação: " + error.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Iniciar Automação REAP";
      }
    }
  },

  async validateLicense(): Promise<any> {
    const browserAPI = typeof browser === "undefined" ? (globalThis as any).chrome : browser;
    return new Promise<any>((resolve) => {
      browserAPI.runtime.sendMessage({ action: "checkLicense" }, (response: any) => {
        resolve(response);
      });
    });
  },

  handleLicenseError(lic: any, btn: HTMLButtonElement | null) {
    const reasonMap: Record<string, string> = {
      expired: "Sua licença expirou.",
      wrong_device: "Licença vinculada a outro dispositivo.",
      invalid_key: "Chave de licença inválida.",
    };
    const msg = reasonMap[lic?.reason] || `Erro de licença: ${lic?.reason || 'Sem Resposta'}`;
    alert(`${msg}\n\nEntre em contato para renovar: (91) 99319-3461`);
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Iniciar Automação REAP";
    }
  },

  async runFormAutomation(production: FishProduction[], daysMap: Record<number, number>) {
    await this.clickLabelByText("Artesanal");
    await this.clickLabelByText("Sim");
    await this.clickLabelByText("Rio");
    await this.clickLabelByText("PA");

    await this.fillMunicipality();

    await this.clickLabelByText("Emalhe");
    await this.clickLabelByText("Água doce");

    await this.addSpeciesInputs(production.length);
    await this.fillUnits(production.length);

    await this.clickLabelByText("Desembarcado");
    await this.clickLabelByText("Economia familiar");

    await this.handleCommercialization();
    await this.fillFishSpeciesInputs(production);
    await this.fillCalendarDays(daysMap);
  },

  async fillMunicipality() {
    const settings = await getStorageSettings();
    const municipioId = settings.mpaMunicipio;

    const { MUNICIPIOS_LIST } = await import("../../shared/data/municipios");
    const municipioName = MUNICIPIOS_LIST.find((m: any) => m.id === Number(municipioId))?.nome || "Oeiras do Pará";

    const inputs = document.querySelectorAll("input");
    const municipioInput = Array.from(inputs).find((i) =>
      i.placeholder?.includes("Município"),
    ) as HTMLInputElement;

    if (municipioInput) {
      try {
        await this.selectBrSelect(municipioInput, municipioName);
      } catch (e) {
        console.warn("Município falhou:", e);
      }
    }
  },

  async addSpeciesInputs(count: number) {
    await Utils.waitFor(
      () =>
        Array.from(document.querySelectorAll("button")).some((b) =>
          b.textContent?.includes("Adicionar espécie"),
        ),
      5000,
    );
    const addBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Adicionar espécie"),
    ) as HTMLElement;
    if (addBtn) {
      for (let i = 0; i < count - 1; i++) {
        addBtn.click();
        await Utils.sleep(400);
      }
    }
  },

  async fillUnits(count: number) {
    await Utils.waitFor(
      () => document.querySelectorAll(".br-select").length >= count + 1,
      5000,
    );
    const selects = document.querySelectorAll(".br-select");
    const unidadeInputs = Array.from(selects)
      .filter((sel) => sel.textContent?.includes("Unidade"))
      .map((sel) => sel.querySelector("input")) as HTMLInputElement[];
    await Promise.all(
      unidadeInputs.map(async (input) => {
        if (input) {
          try {
            await this.selectBrSelect(input, "Kg");
          } catch (e) {
            console.warn("Unidade Kg falhou", e);
          }
        }
      }),
    );
  },

  async handleCommercialization() {
    try {
      const radioSim = document.querySelector(
        "input[type='radio'][name='houveComercializacao'][value='Sim']",
      ) as HTMLInputElement;
      if (radioSim?.checked === false) {
        radioSim.click();
      }
    } catch { /* Ignora */ }
    await Utils.sleep(500);
    try {
      await this.clickLabelByText("Venda direta ao consumidor");
    } catch { /* Ignora */ }

    const inputs = document.querySelectorAll("input");
    const estadoComercInput = Array.from(inputs).find(
      (i) => i.previousElementSibling?.textContent?.includes("Estado de comercialização"),
    ) as HTMLInputElement;
    if (estadoComercInput) {
      try {
        await this.selectBrSelect(estadoComercInput, "PA");
      } catch { /* Ignora */ }
    }

    try {
      const peixeLabel = Array.from(document.querySelectorAll("label")).find(
        (l) => l.textContent?.trim().toLowerCase() === "peixes",
      );
      if (peixeLabel) {
        const input = peixeLabel.querySelector("input");
        if (input?.checked === false) {
          input.click();
        }
      }
    } catch { /* Ignora */ }
  },

  async fillFishSpeciesInputs(production: FishProduction[]) {
    const especies = production.map(p => p.name);
    await Utils.waitFor(
      () => document.querySelectorAll('input[placeholder*="Selecione a espécie"]').length >= especies.length,
      5000,
    );
    const rawInputs = document.querySelectorAll("input");
    const inputs = Array.from(rawInputs).filter(
      (i) => i.placeholder?.includes("Selecione a espécie"),
    );
    await Promise.all(
      especies.map(async (espc, idx) => {
        if (inputs[idx]) {
          try {
            await this.selectBrSelect(inputs[idx], espc);
          } catch (e) {
            console.warn(`Espécie ${espc} falhou`, e);
          }
        }
      }),
    );
  },

  async fillCalendarDays(daysMap: Record<number, number>) {
    const entries: [string, number][] = Object.keys(MONTH_NAMES).map(idx => {
      const i = Number(idx);
      return [MONTH_NAMES[i], daysMap[i] || 0];
    });
    await Promise.all(
      entries.map(async ([mes, valor]) => {
        try {
          const input = document.querySelector(`input[id^="dias-${mes}"]`) as HTMLInputElement;
          if (input) await this.selectBrSelect(input, String(valor));
        } catch (e) {
          console.warn(`Mês ${mes} falhou`, e);
        }
      }),
    );
  },

  async applyProduction(production: FishProduction[]) {
    for (let i = 0; i < production.length; i++) {
      // Fallback: tenta ambos os padrões de seletor
      let qtdInput = document.querySelector(
        `input[name="resultadosPesca.${i}.quantidade"]`,
      ) as HTMLInputElement;
      let precoInput = document.querySelector(
        `input[name="resultadosPesca.${i}.preco"]`,
      ) as HTMLInputElement;

      qtdInput ??= document.querySelector(
        `input[name="resultadosOperacaoPesca.${i}.totalPescado"]`,
      ) as HTMLInputElement || document.querySelectorAll(
        'input[name^="resultadosOperacaoPesca"][name$=".totalPescado"]'
      )[i] as HTMLInputElement;
      precoInput ??= document.querySelector(
        `input[name="resultadosOperacaoPesca.${i}.precoQuilo"]`,
      ) as HTMLInputElement || document.querySelectorAll(
        'input[name^="resultadosOperacaoPesca"][name$=".precoQuilo"]'
      )[i] as HTMLInputElement;

      if (qtdInput) Utils.setReactInput(qtdInput, String(production[i].totalKg));
      if (precoInput) Utils.setReactInput(precoInput, production[i].price.toFixed(2).replace('.', ','));
      await Utils.sleep(200);
    }
  },
};

export const initAgroUI = () => {
  const handleVisibility = () => {
    const isReapPage = /agro\.gov\.br\/reap-simplificada\//.test(globalThis.location.href);
    const btnIniciar = document.querySelector('button[data-sigess-reap="iniciar"]') as HTMLElement;

    if (isReapPage) {
      if (btnIniciar === null) {
        const btnStyle = `
          position: fixed;
          bottom: 20px;
          left: 20px;
          padding: 10px 20px;
          font-size: 16px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
          z-index: 999999;
          font-family: sans-serif;
          font-weight: bold;
        `;
        const ni = document.createElement("button");
        ni.textContent = "Iniciar Automação REAP";
        ni.dataset.sigessReap = "iniciar";
        ni.style.cssText = btnStyle;
        ni.onclick = () => AgroManager.executarAutomacao();
        document.body.appendChild(ni);
      } else {
        btnIniciar.style.display = "block";
      }
    } else {
      if (btnIniciar) btnIniciar.style.display = "none";
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleVisibility);
  } else {
    handleVisibility();
  }

  const observer = new MutationObserver(() => {
    handleVisibility();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  globalThis.addEventListener("popstate", handleVisibility);
  globalThis.addEventListener("hashchange", handleVisibility);
};
