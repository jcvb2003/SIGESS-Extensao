const Utils = {
  sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  
  simulateClick: function(element: HTMLElement) {
    const events = ["mousedown", "mouseup", "click"];
    events.forEach((evt) => {
      const mouseEvt = new MouseEvent(evt, { bubbles: true, cancelable: true, view: window, detail: 1 });
      element.dispatchEvent(mouseEvt);
    });
  },

  waitFor: async function(cond: () => boolean, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (cond()) return true;
      await this.sleep(200);
    }
    return false;
  },

  waitForElement: async function(selector: string, timeout: number = 10000, context: HTMLElement | Document = document, mustBeVisible: boolean = true): Promise<HTMLElement | null> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = context.querySelector(selector);
      if (el) {
        if (!mustBeVisible || (el as HTMLElement).clientHeight > 0) return el as HTMLElement;
      }
      await this.sleep(200);
    }
    return null;
  },

  setReactInput: function(input: HTMLInputElement, value: string) {
    const tracker = (input as any)._valueTracker;
    if (tracker) tracker.setValue(value);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) nativeInputValueSetter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }
};
import { AppSettings } from "../../shared/types";
function processarConfiguracoes(settings: AppSettings, force: boolean = false) {
  const canRedirect = (key: string, value: string) => {
    if (force) return true;
    return sessionStorage.getItem(key) !== value;
  };
  if (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  ) {
    if (settings.consultarGuias) {
      const yearStr = settings.selectedYear || "current";
      if (canRedirect("sigess_last_redir_guias", yearStr)) {
        sessionStorage.setItem("sigess_last_redir_guias", yearStr);
        window.location.href =
          "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";
      }
    } else if (settings.gerarGps) {
      const anoAtual = new Date().getFullYear();
      const mes = settings.selectedMonth || "08";
      const competencia = `${anoAtual}${mes}`;
      if (canRedirect("sigess_last_redir_gps", competencia)) {
        sessionStorage.setItem("sigess_last_redir_gps", competencia);
        const urlGPS = `https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`;
        window.location.href = urlGPS;
      }
    }
  }
}
async function automatizarCompetencias(settings: AppSettings) {
  if (window.location.href.includes("FolhaPagamento/Listagem/Competencias")) {
    if (!settings.consultarGuias || settings.selectedYear === "current") {
      return;
    }
    const select = (await Utils.waitForElement(
      "#AnoFiltrado",
      15000,
      document,
      false,
    )) as HTMLSelectElement;
    if (select && select.value !== settings.selectedYear) {
      select.value = settings.selectedYear;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const btn = await Utils.waitForElement(
        "#btnFiltro",
        5000,
        document,
        false,
      );
      if (btn) {
        Utils.simulateClick(btn as HTMLElement);
      }
    }
  }
}
async function automatizarGPS(settings: AppSettings) {
  if (
    window.location.href.includes("ListarPagamentos") &&
    window.location.href.includes("competencia=")
  ) {
    if (!settings.gerarGps) {
      return;
    }
    const selectors = [
      "span.expandir-comercializacao a",
      'a[onclick*="ExpandirDivComercializacao"]',
      ".expandir-comercializacao",
    ];
    let botaoExpandir: HTMLElement | null = null;
    for (const s of selectors) {
      botaoExpandir = await Utils.waitForElement(s, 2000, document, false);
      if (botaoExpandir) break;
    }
    if (botaoExpandir) {
      Utils.simulateClick(botaoExpandir);
      await Utils.sleep(1000);
      const campoValor = document.querySelector(
        "#ValorTotalComercializado",
      ) as HTMLInputElement;
      if (campoValor) {
        Utils.setReactInput(campoValor, settings.valorComercializado);
      }
      const linkComercializacao = await Utils.waitForElement(
        'a[onclick*="AbrirDialogTipoComercializacao"]',
        5000,
        document,
        false,
      );
      if (linkComercializacao) {
        Utils.simulateClick(linkComercializacao as HTMLElement);
        await Utils.sleep(1000);
        const campoValorVisivel = (await Utils.waitForElement(
          "#ValorTotalComercializado",
          5000,
          document,
          false,
        )) as HTMLInputElement;
        if (campoValorVisivel) {
          Utils.setReactInput(campoValorVisivel, settings.valorComercializado);
        }
      }
    }
  }
}
function start(settings: AppSettings, force: boolean = false) {
  processarConfiguracoes(settings, force);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      automatizarCompetencias(settings);
      automatizarGPS(settings);
    });
  } else {
    automatizarCompetencias(settings);
    automatizarGPS(settings);
  }
}
const browserAPI =
  typeof browser !== "undefined" ? browser : (window as any).chrome;
browserAPI.storage.local.get(["sigessSettings"], (result: any) => {
  const settings = result.sigessSettings as AppSettings;
  if (settings) {
    start(settings, false);
  }
});
browserAPI.runtime.onMessage.addListener((message: any) => {
  if (message.action === "updateESocialSettings") {
    const settings = message.settings as AppSettings;
    start(settings, true);
  }
});
