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
const getStorageSettings = (): Promise<any> => {
  return new Promise((resolve) => {
    try {
      const api =
        typeof browser !== "undefined" && browser.storage
          ? browser
          : (window as any).chrome;
      if (!api || !api.storage || !api.storage.local) {
        console.warn("SIGESS: API de Storage não disponível.");
        return resolve({});
      }
      api.storage.local.get(["sigessSettings"], (result: any) => {
        resolve(result?.sigessSettings || {});
      });
    } catch (e) {
      console.error("SIGESS: Falha crítica ao acessar storage:", e);
      resolve({});
    }
  });
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
    button?.click();
    await Utils.waitFor(() =>
      [...container.querySelectorAll("label")].some(
        (l) => l.textContent?.includes(optionText) === true,
      ),
    );
    const opt = [...container.querySelectorAll("label")].find(
      (l) => l.textContent?.includes(optionText) === true,
    ) as HTMLElement;
    if (!opt) throw new Error(`Option not found: ${optionText}`);
    opt.click();
    await Utils.sleep(400);
  },
  async preencherQuantidadePreco() {
    const settings = await getStorageSettings();
    const reapData = settings.reapData || {};
    return new Promise<any[] | null>((resolve) => {
      const modal = document.createElement("div");
      modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; z-index: 100000;`;
      const box = document.createElement("div");
      box.style.cssText = `background-color: white; padding: 25px; border-radius: 12px; width: 450px; max-width: 90%; text-align: center; font-family: sans-serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5);`;
      const title = document.createElement("h3");
      title.textContent = "Preenchimento Automático REAP";
      title.style.cssText = `margin-top: 0; margin-bottom: 20px; color: #008080;`;
      const yearOptions = document.createElement("div");
      yearOptions.style.marginBottom = "25px";
      const labelArea = document.createElement("p");
      labelArea.textContent = "Selecione o ano dos dados salvos:";
      labelArea.style.cssText = `font-size: 14px; color: #4b5563; margin-bottom: 12px; font-weight: bold; text-align: left;`;
      yearOptions.appendChild(labelArea);
      ["2021", "2022", "2023", "2024"].forEach((year) => {
        const data = reapData[year];
        const hasData = typeof data === "string" && data.trim().length > 0;
        const btn = document.createElement("button");
        btn.textContent = hasData
          ? `Usar dados de ${year}`
          : `Ano ${year} (Vazio)`;
        btn.style.cssText = `
                    display: block; width: 100%; margin: 6px 0; padding: 12px; 
                    background-color: ${hasData ? "#008080" : "#e5e7eb"}; 
                    color: ${hasData ? "white" : "#9ca3af"}; 
                    border: none; border-radius: 6px; 
                    cursor: ${hasData ? "pointer" : "not-allowed"}; 
                    font-weight: bold; font-size: 15px;
                    transition: all 0.2s;
                `;
        if (hasData) {
          btn.onmouseover = () => (btn.style.backgroundColor = "#006666");
          btn.onmouseout = () => (btn.style.backgroundColor = "#008080");
          btn.onclick = () => {
            const lines = data
              .split("\n")
              .map((l: string) => l.trim().split("\t"))
              .filter((l: string[]) => l.length === 2);
            if (modal.parentNode) document.body.removeChild(modal);
            resolve(lines);
          };
        } else {
          btn.disabled = true;
        }
        yearOptions.appendChild(btn);
      });
      const manualDivider = document.createElement("div");
      manualDivider.style.cssText = `height: 1px; background-color: #e5e7eb; margin: 20px 0; position: relative;`;
      const dividerText = document.createElement("span");
      dividerText.textContent = "OU COLOQUE MANUALMENTE";
      dividerText.style.cssText = `position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: white; padding: 0 10px; font-size: 10px; color: #9ca3af; font-weight: bold;`;
      manualDivider.appendChild(dividerText);
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.style.cssText = `width: 100%; font-family: monospace; font-size: 12px; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; resize: vertical;`;
      textarea.placeholder = "Qtd\tPreço\n20\t10.50\n15\t8.00...";
      const footer = document.createElement("div");
      footer.style.cssText = `display: flex; gap: 10px; margin-top: 20px;`;
      const btnApply = document.createElement("button");
      btnApply.textContent = "Aplicar Manual";
      btnApply.style.cssText = `flex: 1.5; padding: 12px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 6px; font-weight: bold;`;
      btnApply.onclick = () => {
        const val = textarea.value.trim();
        if (!val) return;
        const lines = val.split("\n").map((l: string) => l.trim().split("\t"));
        if (lines.some((l: string[]) => l.length !== 2)) {
          alert("Formato inválido. Use Quantidade [TAB] Preço.");
          return;
        }
        if (modal.parentNode) document.body.removeChild(modal);
        resolve(lines);
      };
      const btnCancel = document.createElement("button");
      btnCancel.textContent = "Cancelar";
      btnCancel.style.cssText = `flex: 1; padding: 12px; cursor: pointer; background-color: #6b7280; color: white; border: none; border-radius: 6px; font-weight: bold;`;
      btnCancel.onclick = () => {
        if (modal.parentNode) document.body.removeChild(modal);
        resolve(null);
      };
      footer.appendChild(btnApply);
      footer.appendChild(btnCancel);
      box.appendChild(title);
      box.appendChild(yearOptions);
      box.appendChild(manualDivider);
      box.appendChild(textarea);
      box.appendChild(footer);
      modal.appendChild(box);
      document.body.appendChild(modal);
    }).then(async (dados) => {
      if (!dados) return;
      for (let i = 0; i < dados.length; i++) {
        const [qtd, preco] = dados[i];
        let inputQtd = document.querySelector(
          `input[name="resultadosPesca.${i}.quantidade"]`,
        ) as HTMLInputElement;
        let inputPreco = document.querySelector(
          `input[name="resultadosPesca.${i}.preco"]`,
        ) as HTMLInputElement;
        if (!inputQtd) {
          const allQtds = document.querySelectorAll(
            'input[name^="resultadosOperacaoPesca"][name$=".totalPescado"]',
          );
          if (allQtds[i]) inputQtd = allQtds[i] as HTMLInputElement;
        }
        if (!inputPreco) {
          const allPrecos = document.querySelectorAll(
            'input[name^="resultadosOperacaoPesca"][name$=".precoQuilo"]',
          );
          if (allPrecos[i]) inputPreco = allPrecos[i] as HTMLInputElement;
        }
        if (inputQtd) Utils.setReactInput(inputQtd, qtd);
        if (inputPreco) Utils.setReactInput(inputPreco, preco);
        await Utils.sleep(200);
      }
    });
  },
  async executarAutomacao() {
    const btn = document.querySelector(
      'button[data-sigess-reap="iniciar"]',
    ) as HTMLButtonElement;
    
    // Verificação de Licença (Consome uso se trial)
    const browserAPI = typeof browser !== "undefined" ? browser : (window as any).chrome;
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Validando Licença...";
      }
      
      const lic = await new Promise<any>((resolve) => {
        browserAPI.runtime.sendMessage({ action: "consumeLicense" }, (response: any) => {
          resolve(response);
        });
      });

      if (!lic?.ok) {
        const reasonMap: Record<string, string> = {
          trial_expired: "Seu período de teste (Trial) expirou.",
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
        return;
      }
    } catch (e) {
      console.error("Erro ao validar licença:", e);
      alert("Erro ao validar licença. Verifique sua conexão.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Iniciar Automação REAP";
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Executando...";
    }
    try {
      await this.clickLabelByText("Artesanal");
      await this.clickLabelByText("Sim");
      await this.clickLabelByText("Rio");
      await this.clickLabelByText("PA");
      const municipioInput = [...document.querySelectorAll("input")].find((i) =>
        (i as HTMLInputElement).placeholder?.includes("Município"),
      ) as HTMLInputElement;
      if (municipioInput) {
        try {
          await this.selectBrSelect(municipioInput, "Oeiras do Pará");
        } catch (e) {
          console.warn("Município falhou:", e);
        }
      }
      await this.clickLabelByText("Emalhe");
      await this.clickLabelByText("Água doce");
      await Utils.waitFor(
        () =>
          !![...document.querySelectorAll("button")].find((b) =>
            b.textContent?.includes("Adicionar espécie"),
          ),
        5000,
      );
      const addBtn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Adicionar espécie"),
      ) as HTMLElement;
      if (addBtn) {
        for (let i = 0; i < 4; i++) {
          addBtn.click();
          await Utils.sleep(400);
        }
      }
      await Utils.waitFor(
        () => document.querySelectorAll(".br-select").length >= 5,
        5000,
      );
      const unidadeInputs = [...document.querySelectorAll(".br-select")]
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
      await this.clickLabelByText("Desembarcado");
      await this.clickLabelByText("Economia familiar");
      try {
        const radioSim = document.querySelector(
          "input[type='radio'][name='houveComercializacao'][value='Sim']",
        ) as HTMLElement;
        if (radioSim && !(radioSim as any).checked) radioSim.click();
      } catch (e) {}
      await Utils.sleep(500);
      try {
        await this.clickLabelByText("Venda direta ao consumidor");
      } catch (e) {}
      const estadoComercInput = [...document.querySelectorAll("input")].find(
        (i) =>
          (i as HTMLElement).previousElementSibling?.textContent?.includes(
            "Estado de comercialização",
          ),
      ) as HTMLInputElement;
      if (estadoComercInput) {
        try {
          await this.selectBrSelect(estadoComercInput, "PA");
        } catch (e) {}
      }
      try {
        const peixeLabel = [...document.querySelectorAll("label")].find(
          (l) => l.textContent?.trim().toLowerCase() === "peixes",
        );
        if (peixeLabel) {
          const input = peixeLabel.querySelector("input");
          if (input && !input.checked) input.click();
        }
      } catch (e) {}
      const especies = ["Matrinxã", "Acará", "Aracu", "Traíra", "Mapará"];
      await Utils.waitFor(
        () =>
          document.querySelectorAll('input[placeholder*="Selecione a espécie"]')
            .length >= 5,
        5000,
      );
      const especieInputs = [...document.querySelectorAll("input")].filter(
        (i) =>
          (i as HTMLInputElement).placeholder?.includes("Selecione a espécie"),
      ) as HTMLInputElement[];
      await Promise.all(
        especies.map(async (espc, idx) => {
          if (especieInputs[idx]) {
            try {
              await this.selectBrSelect(especieInputs[idx], espc);
            } catch (e) {
              console.warn(`Espécie ${espc} falhou`, e);
            }
          }
        }),
      );
      const meses: any = {
        Janeiro: 0,
        Fevereiro: 0,
        Março: 0,
        Abril: 0,
        Maio: 20,
        Junho: 18,
        Julho: 15,
        Agosto: 12,
        Setembro: 12,
        Outubro: 15,
        Novembro: 18,
        Dezembro: 20,
      };
      await Promise.all(
        Object.entries(meses).map(async ([mes, valor]) => {
          try {
            const input = document.querySelector(
              `input[id^="dias-${mes}"]`,
            ) as HTMLInputElement;
            if (input) await this.selectBrSelect(input, String(valor));
          } catch (e) {
            console.warn(`Mês ${mes} falhou`, e);
          }
        }),
      );
      await this.preencherQuantidadePreco();
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
};
export const initAgroUI = () => {
  const handleVisibility = () => {
    const isReapPage = window.location.href.includes("/reap-simplificada/");
    let btnIniciar = document.querySelector(
      'button[data-sigess-reap="iniciar"]',
    ) as HTMLElement;
    let btnPrompt = document.querySelector(
      'button[data-sigess-reap="prompt"]',
    ) as HTMLElement;
    if (isReapPage) {
      if (!btnIniciar) {
        const btnStyle = (bottom: string, color: string) => `
                    position: fixed;
                    bottom: ${bottom};
                    left: 20px;
                    padding: 10px 20px;
                    font-size: 16px;
                    background-color: ${color};
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
        btnIniciar = document.createElement("button");
        btnIniciar.textContent = "Iniciar Automação REAP";
        btnIniciar.setAttribute("data-sigess-reap", "iniciar");
        btnIniciar.style.cssText = btnStyle("20px", "#4CAF50");
        btnIniciar.onclick = () => AgroManager.executarAutomacao();
        document.body.appendChild(btnIniciar);
        btnPrompt = document.createElement("button");
        btnPrompt.textContent = "Abrir Prompt Qtd/Preço";
        btnPrompt.setAttribute("data-sigess-reap", "prompt");
        btnPrompt.style.cssText = btnStyle("70px", "#FF9800");
        btnPrompt.onclick = () => AgroManager.preencherQuantidadePreco();
        document.body.appendChild(btnPrompt);
      } else {
        btnIniciar.style.display = "block";
        btnPrompt.style.display = "block";
      }
    } else {
      if (btnIniciar) btnIniciar.style.display = "none";
      if (btnPrompt) btnPrompt.style.display = "none";
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
  window.addEventListener("popstate", handleVisibility);
  window.addEventListener("hashchange", handleVisibility);
};
