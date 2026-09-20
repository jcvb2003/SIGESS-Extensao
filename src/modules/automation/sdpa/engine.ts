import { AppSettings, PessoaData } from '../../../shared/types';
import { StorageService } from '../../../background/services/storage';

class SDPAEngine {
  private static instance: SDPAEngine | null = null;
  private settings: AppSettings | null = null;
  private auditData: PessoaData | null = null;
  private auditIntervalId: any = null;
  private isRunning = false;
  private auditStats = { ok: 0, warning: 0, missing: 0, total: 0 };

  private constructor() {
    // Privado para forçar uso do static initialize
  }

  public static async initialize() {
    if (!SDPAEngine.instance) {
      SDPAEngine.instance = new SDPAEngine();

      const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
      browserAPI?.runtime?.onMessage?.addListener((msg: any, _sender: any, sendResponse: (resp: any) => void) => {
        if (msg?.action === "TRIGGER_SDPA_FILL") {
          SDPAEngine.instance?.runFiller()
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err?.message }));
          return true;
        }
        if (msg?.action === "GET_SDPA_STATUS") {
          const isEtapas = SDPAEngine.instance?.isEtapasRoute() || false;
          sendResponse({
            success: true,
            isEtapasRoute: isEtapas,
            data: {
              isEtapasRoute: isEtapas,
              nome: SDPAEngine.instance?.auditData?.nome || "",
              cpf: SDPAEngine.instance?.auditData?.cpf || "",
              dataPrimeiroRegistro: SDPAEngine.instance?.formatDateBR(SDPAEngine.instance?.auditData?.dataPrimeiroRegistro || ""),
              rgp: (SDPAEngine.instance?.auditData as any)?.rgp || "",
              endereco: SDPAEngine.instance?.auditData?.endereco || "",
              numero: SDPAEngine.instance?.auditData?.numero || "",
              bairro: SDPAEngine.instance?.auditData?.bairro || "",
              cidade: SDPAEngine.instance?.auditData?.cidade || "",
              uf: SDPAEngine.instance?.auditData?.uf || "",
              telefone: SDPAEngine.instance?.auditData?.telefone || "",
              email: SDPAEngine.instance?.settings?.sdpaDefaultEmail || (SDPAEngine.instance?.auditData as any)?.email || "",
              auditStats: SDPAEngine.instance?.auditStats || { ok: 0, warning: 0, missing: 0, total: 0 }
            },
          });
          return true;
        }
        if (msg?.action === "HIGHLIGHT_SDPA_ATTACHMENTS") {
          SDPAEngine.instance?.highlightAttachments();
          sendResponse({ success: true });
          return true;
        }
      });

      // Listeners para navegação SPA do Portal MTE (sem necessidade de F5)
      window.addEventListener('hashchange', () => SDPAEngine.instance?.handleRouteChange());
      window.addEventListener('popstate', () => SDPAEngine.instance?.handleRouteChange());
      window.addEventListener('load', () => SDPAEngine.instance?.handleRouteChange());

      // Observador em polling para garantir transições internas do Angular
      setInterval(() => {
        SDPAEngine.instance?.handleRouteChange();
      }, 600);
    }
    await SDPAEngine.instance.handleRouteChange();
  }

  private isEtapasRoute(): boolean {
    const url = window.location.href || "";
    const hash = window.location.hash || "";
    return url.includes('/solicitacao-pescador/etapas') || hash.includes('/solicitacao-pescador/etapas');
  }

  private async handleRouteChange() {
    this.settings = await StorageService.getSettings();
    if (this.settings && this.settings.sdpaEnabled === false) {
      if (this.isRunning) {
        this.stop();
      }
      return;
    }

    const isStepRoute = this.isEtapasRoute();

    if (isStepRoute) {
      this.auditData = this.settings?.pessoaData || this.auditData || null;
      this.injectStyles();
      this.injectUI();

      if (!this.isRunning) {
        this.isRunning = true;
        this.startAuditor();
      }
    } else {
      if (this.isRunning) {
        this.stop();
      }
    }
  }

  private stop() {
    this.isRunning = false;
    if (this.auditIntervalId) {
      clearInterval(this.auditIntervalId);
      this.auditIntervalId = null;
    }
    document.getElementById('sigess-sdpa-pill')?.remove();
    document.getElementById('sigess-sdpa-panel')?.remove();
    document.querySelectorAll('.sigess-suggest-box').forEach(el => el.remove());
    document.querySelectorAll('.sigess-audit-green, .sigess-audit-red, .sigess-audit-orange')
      .forEach(el => el.classList.remove('sigess-audit-green', 'sigess-audit-red', 'sigess-audit-orange'));

    // Notifica a sidebar que saiu da rota de etapas
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
      browserAPI?.runtime?.sendMessage?.({
        action: "SDPA_DATA_BROADCAST",
        data: { isEtapasRoute: false }
      }).catch(() => {});
    } catch {}
  }

  private injectStyles() {
    if (document.getElementById('sigess-sdpa-styles')) return;

    const style = document.createElement('style');
    style.id = 'sigess-sdpa-styles';
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      :root {
        --sigess-teal: #0f766e;
        --sigess-teal-dark: #0d9488;
        --sigess-amber: #f59e0b;
        --sigess-amber-dark: #d97706;
        --sigess-glass: rgba(255, 255, 255, 0.85);
        --sigess-border: rgba(226, 232, 240, 0.8);
      }

      .sigess-audit-green { border: 2px solid #10b981 !important; border-radius: 10px; padding: 3px; background: rgba(16, 185, 129, 0.04); }
      .sigess-audit-red { border: 2px solid #ef4444 !important; border-radius: 10px; padding: 3px; background: rgba(239, 68, 68, 0.04); }
      .sigess-audit-orange { border: 2px solid #f59e0b !important; border-radius: 10px; padding: 3px; background: rgba(245, 158, 11, 0.04); }
      
      .sigess-sdpa-pill {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px 8px 12px;
        background: linear-gradient(135deg, var(--sigess-teal) 0%, #134e4a 100%);
        color: #ffffff;
        border-radius: 9999px;
        box-shadow: 0 4px 14px rgba(15, 118, 110, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.2);
        cursor: pointer;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: -0.01em;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
        animation: sigess-pill-appear 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }

      @keyframes sigess-pill-appear {
        from { transform: translateY(-10px) scale(0.95); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity(1); }
      }

      .sigess-sdpa-pill:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 0 8px 22px rgba(15, 118, 110, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.3);
        filter: brightness(1.08);
      }

      .sigess-sdpa-pill:active {
        transform: translateY(0) scale(0.98);
      }

      .sigess-pill-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: #ffffff;
        border-radius: 50%;
        padding: 2px;
        flex-shrink: 0;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
        overflow: hidden;
      }

      .sigess-pill-logo-img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .sigess-pill-text {
        color: white;
        line-height: 1;
      }

      .sigess-pill-loading {
        pointer-events: none;
        opacity: 0.8;
      }

      .sigess-suggest-box {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 5px;
        font-size: 11px;
        color: #b45309;
        background: rgba(245, 158, 11, 0.08);
        border: 1px dashed rgba(245, 158, 11, 0.45);
        border-radius: 6px;
        padding: 3px 8px;
        line-height: 1.3;
        animation: sigess-suggest-fade 0.2s ease-in;
      }

      @keyframes sigess-suggest-fade {
        from { opacity: 0; transform: translateY(-3px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .sigess-suggest-logo {
        width: 15px;
        height: 15px;
        border-radius: 50%;
        object-fit: contain;
        display: inline-block;
        vertical-align: middle;
        background: #ffffff;
        padding: 1px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.12);
      }

      .sigess-suggest-val {
        font-weight: 600;
        color: #78350f;
      }

      .sigess-suggest-apply-btn {
        margin-left: 6px;
        background: #f59e0b;
        color: #ffffff;
        border: none;
        border-radius: 4px;
        padding: 2px 7px;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .sigess-suggest-apply-btn:hover {
        background: #d97706;
      }
    `;
    document.head.appendChild(style);
  }

  private startAuditor() {
    if (this.auditIntervalId) {
      clearInterval(this.auditIntervalId);
      this.auditIntervalId = null;
    }

    // Executa auditoria imediatamente na primeira chamada
    this.runAudit();

    this.auditIntervalId = setInterval(() => {
      if (this.isEtapasRoute()) {
        if (!document.getElementById('sigess-sdpa-pill')) this.injectUI();
        this.runAudit();
      } else {
        this.stop();
      }
    }, 1000);
  }

  private runAudit() {
    if (!this.auditData && this.settings?.pessoaData) {
      this.auditData = this.settings.pessoaData;
    }

    if (this.auditData) {
      this.auditDateField();
      this.auditGrauInstrucao();

      // 2. Auditoria de Endereço
      const d = this.auditData;
      this.auditTextField('input[name="endereco.cep"]', d.cep || "");
      this.auditTextField('input[name="endereco.logradouro"]', d.endereco || "");
      this.auditTextField('input[name="endereco.numero"]', d.numero || "");
      this.auditTextField('input[name="endereco.bairro"]', d.bairro || "");
      this.auditTextField('input[name="endereco.municipio"]', d.cidade || "");
      this.auditTextField('input[name="endereco.uf"]', d.uf || "");
    }

    // 3. Auditoria de Regras (Atividade, Contribuição, etc) - Roda sempre
    this.auditRadioRule('registroPesca.idAtividadePesqueira', 'Familiar');
    this.auditRadioStatus('registroPesca.realizouContribuicao', 'Sim');
    this.auditRadioStatus('registroPesca.possuiNotasFiscais', 'não');
    this.auditRadioStatus('informarDadosBancarios', 'não');

    this.validateSubmitButton();

    // Contabiliza os campos auditados respeitando as cores e semântica existentes do projeto
    const okCount = document.querySelectorAll('.sigess-audit-green').length;
    const warningCount = document.querySelectorAll('.sigess-audit-orange').length;
    const missingCount = document.querySelectorAll('.sigess-audit-red').length;
    this.auditStats = {
      ok: okCount,
      warning: warningCount,
      missing: missingCount,
      total: okCount + warningCount + missingCount
    };
    this.broadcastSdpaDataToSidebar();
  }

  private applyAuditStyle(el: HTMLElement | null, status: 'green' | 'red' | 'orange' | 'none') {
    if (!el) return;
    el.classList.remove('sigess-audit-green', 'sigess-audit-red', 'sigess-audit-orange');
    if (status !== 'none') {
      el.classList.add(`sigess-audit-${status}`);
    }
  }

  private auditTextField(selector: string, baseValue: string) {
    const input = document.querySelector(selector) as HTMLInputElement;
    if (!input) return;

    const parent = input.closest('.br-input') || input.parentElement;
    if (!parent || !(parent instanceof HTMLElement)) return;

    const pageVal = input.value.trim().toLowerCase();
    const normalizeBase = (baseValue || "").trim().toLowerCase();

    if (pageVal === normalizeBase && pageVal !== "") {
      parent.querySelector('.sigess-suggest-box')?.remove();
      this.applyAuditStyle(parent, 'green');
    } else if (normalizeBase !== "") {
      this.applyAuditStyle(parent, 'orange');

      let suggestEl = parent.querySelector('.sigess-suggest-box') as HTMLElement | null;
      const currentValSpan = suggestEl?.querySelector('.sigess-suggest-val');
      if (!suggestEl || currentValSpan?.textContent !== baseValue) {
        suggestEl?.remove();

        const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
        const logoUrl = browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL('sigess-logo.png') : 'sigess-logo.png';

        suggestEl = document.createElement('div');
        suggestEl.className = 'sigess-suggest-box';
        suggestEl.innerHTML = `
          <img src="${logoUrl}" alt="SIGESS" class="sigess-suggest-logo" />:
          <span class="sigess-suggest-val">${baseValue}</span>
          <button type="button" class="sigess-suggest-apply-btn" title="Aplicar valor cadastrado no SIGESS">Aplicar</button>
        `;

        suggestEl.querySelector('.sigess-suggest-apply-btn')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setInputValue(input, baseValue);
          input.blur();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        });

        parent.appendChild(suggestEl);
      }
    } else {
      parent.querySelector('.sigess-suggest-box')?.remove();
      this.applyAuditStyle(parent, 'none');
    }
  }

  private getCPF(): string {
    // 1. Tenta pegar do SIGESS
    let cpf = this.auditData?.cpf || "";
    if (cpf.replaceAll(/\D/g, "").length === 11) return cpf;

    // 2. Fallback: Tenta capturar do Portal MTE via Label
    const cpfEl = Array.from(document.querySelectorAll('[id^="campo-informacao-"]')).find(el => {
      const label = el.parentElement?.parentElement?.querySelector('div:first-child')?.textContent?.trim();
      return label === "Nome" || label === "CPF"; // CPF costuma estar perto do nome
    });

    if (cpfEl) {
      // Se pegou o elemento do nome por engano, tenta o próximo
      return cpfEl.textContent?.trim() || "";
    }

    return "";
  }

  private auditDateField() {
    const dateInput = document.querySelector('input[placeholder="dd/mm/aaaa"]') as HTMLInputElement;
    if (!dateInput || !this.auditData) return;

    const parent = dateInput.closest('.br-datetimepicker') || dateInput.parentElement;
    if (!parent || !(parent instanceof HTMLElement)) return;

    const pageVal = dateInput.value.trim();
    const baseVal = this.auditData.dataPrimeiroRegistro || "";

    const normalize = (d: string) => {
      const clean = d.replace(/\D/g, "");
      if (clean.length !== 8) return clean;
      if (d.includes('-')) {
        const [y, m, day] = d.split('-');
        return `${day}${m}${y}`;
      }
      return clean;
    };

    const nPage = normalize(pageVal);
    const nBase = normalize(baseVal);

    if (nPage === nBase && nPage !== "") {
      parent.querySelector('.sigess-suggest-box')?.remove();
      this.applyAuditStyle(parent, 'green');
    } else if (baseVal !== "") {
      this.applyAuditStyle(parent, 'orange');

      const formattedDate = this.formatDateBR(baseVal);
      let suggestEl = parent.querySelector('.sigess-suggest-box') as HTMLElement | null;
      const currentValSpan = suggestEl?.querySelector('.sigess-suggest-val');
      if (!suggestEl || currentValSpan?.textContent !== formattedDate) {
        suggestEl?.remove();

        const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
        const logoUrl = browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL('sigess-logo.png') : 'sigess-logo.png';

        suggestEl = document.createElement('div');
        suggestEl.className = 'sigess-suggest-box';
        suggestEl.innerHTML = `
          <img src="${logoUrl}" alt="SIGESS" class="sigess-suggest-logo" />:
          <span class="sigess-suggest-val">${formattedDate}</span>
          <button type="button" class="sigess-suggest-apply-btn" title="Aplicar data do SIGESS">Aplicar</button>
        `;

        suggestEl.querySelector('.sigess-suggest-apply-btn')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((dateInput as any)._flatpickr) {
            (dateInput as any)._flatpickr.setDate(baseVal, true, "d/m/Y");
          } else {
            this.setInputValue(dateInput, formattedDate);
          }
          dateInput.blur();
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        });

        parent.appendChild(suggestEl);
      }
    } else {
      parent.querySelector('.sigess-suggest-box')?.remove();
      this.applyAuditStyle(parent, 'none');
    }
  }

  private auditRadioRule(name: string, expectedLabel: string) {
    const visualInput = document.querySelector(`input[id="${name}"]`) as HTMLInputElement;
    if (visualInput) {
      const parent = visualInput.closest('.br-select');
      if (parent && parent instanceof HTMLElement) {
        if (visualInput.value.includes(expectedLabel)) {
          this.applyAuditStyle(parent, 'green');
        } else {
          this.applyAuditStyle(parent, 'red');
        }
      }
    }
  }

  private auditRadioStatus(name: string, expectedLabel: string) {
    const allRadios = document.querySelectorAll(`input[name="${name}"]`);
    if (allRadios.length === 0) return;

    // Limpa estado anterior de todos os radios do grupo e de seus wrappers
    allRadios.forEach(radio => {
      const wrapper = radio.closest('.br-radio') as HTMLElement | null;
      if (wrapper) {
        this.applyAuditStyle(wrapper, 'none');
        if (wrapper.parentElement) {
          this.applyAuditStyle(wrapper.parentElement, 'none');
        }
      }
    });

    const checked = document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null;
    if (checked) {
      const label = document.querySelector(`label[for="${checked.id}"]`);
      const targetEl = (checked.closest('.br-radio') || checked.parentElement) as HTMLElement | null;
      if (targetEl && label) {
        if (label.textContent?.toLowerCase().includes(expectedLabel.toLowerCase())) {
          this.applyAuditStyle(targetEl, 'green');
        } else {
          this.applyAuditStyle(targetEl, 'red');
        }
      }
    }
  }

  private validateSubmitButton() {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
      const hasRed = document.querySelectorAll('.sigess-audit-red').length > 0;
      const parent = submitBtn.parentElement;
      if (parent) {
        if (hasRed) {
          parent.style.border = "4px solid #ef4444";
          parent.style.borderRadius = "8px";
        } else {
          parent.style.border = "4px solid #10b981";
          parent.style.borderRadius = "8px";
        }
      }
    }
  }

  private resolveGrauInstrucaoMte(escolaridade?: string, alfabetizado?: string): { id: string; label: string } {
    const isAlfabetizado = (alfabetizado || "").trim().toUpperCase();
    if (isAlfabetizado === "NÃO" || isAlfabetizado === "NAO") {
      return { id: "grauInstrucao-item-1", label: "Analfabeto" };
    }

    const esc = (escolaridade || "").trim().toUpperCase();
    if (!esc) {
      return { id: "grauInstrucao-item-1", label: "Analfabeto" };
    }

    if (esc.includes("SUPERIOR") && esc.includes("COMPLETO") && !esc.includes("INCOMPLETO")) {
      return { id: "grauInstrucao-item-9", label: "Ensino Superior Completo" };
    }
    if (esc.includes("SUPERIOR") && esc.includes("INCOMPLETO")) {
      return { id: "grauInstrucao-item-8", label: "Ensino Superior Incompleto" };
    }
    if ((esc.includes("MÉDIO") || esc.includes("MEDIO")) && esc.includes("COMPLETO") && !esc.includes("INCOMPLETO")) {
      return { id: "grauInstrucao-item-7", label: "Ensino Médio Completo" };
    }
    if ((esc.includes("MÉDIO") || esc.includes("MEDIO")) && esc.includes("INCOMPLETO")) {
      return { id: "grauInstrucao-item-6", label: "Ensino Médio Incompleto" };
    }
    if (esc.includes("FUNDAMENTAL II") && esc.includes("INCOMPLETO")) {
      return { id: "grauInstrucao-item-4", label: "6º ao 9º Ano Incompleto" };
    }
    if (esc.includes("FUNDAMENTAL I") && esc.includes("INCOMPLETO")) {
      return { id: "grauInstrucao-item-2", label: "Até 5º Ano Incompleto" };
    }
    if (esc.includes("FUNDAMENTAL") && (esc.includes("I COMPLETO") || esc.includes("II COMPLETO") || esc.includes("COMPLETO"))) {
      return { id: "grauInstrucao-item-3", label: "5º Ano Completo" };
    }
    if (esc.includes("ANALFABETO")) {
      return { id: "grauInstrucao-item-1", label: "Analfabeto" };
    }

    return { id: "grauInstrucao-item-1", label: "Analfabeto" };
  }

  private selectGrauInstrucaoDirect(itemId: string) {
    const radio = document.getElementById(itemId) as HTMLInputElement | null;
    const label = document.querySelector(`label[for="${itemId}"]`) as HTMLElement | null;

    if (label) {
      label.click();
    }
    if (radio) {
      radio.checked = true;
      for (const type of ["click", "input", "change"]) {
        radio.dispatchEvent(new Event(type, { bubbles: true }));
      }
    }

    const selectContainer = (radio || label)?.closest('.br-select');
    if (selectContainer) {
      const visualInput = selectContainer.querySelector('input:not([type="radio"])') as HTMLInputElement | null;
      if (visualInput && label?.textContent) {
        visualInput.value = label.textContent.trim();
        visualInput.dispatchEvent(new Event('input', { bubbles: true }));
        visualInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      selectContainer.querySelectorAll('.br-item').forEach(item => item.classList.remove('selected', 'highlighted'));
      (radio || label)?.closest('.br-item')?.classList.add('selected', 'highlighted');
    }
  }

  private auditGrauInstrucao() {
    if (!this.auditData) return;
    const target = this.resolveGrauInstrucaoMte(this.auditData.escolaridade, (this.auditData as any).alfabetizado);
    if (!target?.id) return;

    const checkedRadio = document.querySelector('input[id^="grauInstrucao-item-"]:checked') as HTMLInputElement | null;
    const selectContainer = document.querySelector('.br-select:has([id^="grauInstrucao"])') ||
                            document.querySelector('[id^="grauInstrucao-item-"]')?.closest('.br-select');

    if (!selectContainer || !(selectContainer instanceof HTMLElement)) return;

    const currentSelectedId = checkedRadio?.id || "";
    const isOk = currentSelectedId === target.id;

    if (isOk) {
      selectContainer.querySelector('.sigess-suggest-box')?.remove();
      this.applyAuditStyle(selectContainer, 'green');
    } else {
      this.applyAuditStyle(selectContainer, 'orange');

      let suggestEl = selectContainer.querySelector('.sigess-suggest-box') as HTMLElement | null;
      const currentValSpan = suggestEl?.querySelector('.sigess-suggest-val');
      if (!suggestEl || currentValSpan?.textContent !== target.label) {
        suggestEl?.remove();

        const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
        const logoUrl = browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL('sigess-logo.png') : 'sigess-logo.png';

        suggestEl = document.createElement('div');
        suggestEl.className = 'sigess-suggest-box';
        suggestEl.innerHTML = `
          <img src="${logoUrl}" alt="SIGESS" class="sigess-suggest-logo" />:
          <span class="sigess-suggest-val">${target.label}</span>
          <button type="button" class="sigess-suggest-apply-btn" title="Aplicar grau de instrução do SIGESS">Aplicar</button>
        `;

        suggestEl.querySelector('.sigess-suggest-apply-btn')?.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.selectGrauInstrucaoDirect(target.id);
          this.auditGrauInstrucao();
        });

        selectContainer.appendChild(suggestEl);
      }
    }
  }

  private formatDateBR(d?: string): string {
    if (!d) return "---";
    const clean = d.replace(/\D/g, "");
    if (clean.length === 8) {
      if (d.includes('-')) {
        const [y, m, day] = d.split('-');
        return `${day}/${m}/${y}`;
      }
      return `${clean.substring(0, 2)}/${clean.substring(2, 4)}/${clean.substring(4)}`;
    }
    return d;
  }

  private broadcastSdpaDataToSidebar() {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
      if (browserAPI?.runtime?.sendMessage) {
        const payload = {
          nome: this.auditData?.nome || "",
          cpf: this.auditData?.cpf || "",
          dataPrimeiroRegistro: this.formatDateBR(this.auditData?.dataPrimeiroRegistro || ""),
          rgp: (this.auditData as any)?.rgp || "",
          endereco: this.auditData?.endereco || "",
          numero: this.auditData?.numero || "",
          bairro: this.auditData?.bairro || "",
          cidade: this.auditData?.cidade || "",
          uf: this.auditData?.uf || "",
          telefone: this.auditData?.telefone || "",
          email: this.settings?.sdpaDefaultEmail || (this.auditData as any)?.email || "",
          auditStats: this.auditStats,
        };

        // Dispara tanto SDPA_DATA_BROADCAST quanto UPDATE_SDPA_STATUS para compatibilidade
        browserAPI.runtime.sendMessage({
          action: "SDPA_DATA_BROADCAST",
          data: payload,
        }).catch(() => {});

        browserAPI.runtime.sendMessage({
          action: "UPDATE_SDPA_STATUS",
          data: payload,
        }).catch(() => {});

        // Armazena no storage local para carregamento síncrono da Sidebar
        browserAPI.storage?.local?.set({ sigess_sdpa_current: payload }).catch(() => {});
      }
    } catch {}
  }

  public highlightAttachments() {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fileInput.style.display = 'block';
      fileInput.style.width = '100%';
      fileInput.style.padding = '20px';
      fileInput.style.border = '2px dashed #f59e0b';
      fileInput.style.marginTop = '10px';
      fileInput.classList.add('sigess-flash-upload');
      fileInput.focus();
    }
  }

  private injectUI() {
    if (document.getElementById('sigess-sdpa-pill')) return;
    document.getElementById('sigess-sdpa-panel')?.remove();

    const browserAPI = typeof browser !== 'undefined' ? browser : (window as any).chrome;
    const logoUrl = browserAPI?.runtime?.getURL ? browserAPI.runtime.getURL('sigess-logo.png') : 'sigess-logo.png';

    const pill = document.createElement('div');
    pill.id = 'sigess-sdpa-pill';
    pill.className = 'sigess-sdpa-pill';
    pill.title = 'Clique para preencher a solicitação SDPA';

    pill.innerHTML = `
      <div class="sigess-pill-logo">
        <img src="${logoUrl}" alt="SIGESS" class="sigess-pill-logo-img" />
      </div>
      <span class="sigess-pill-text" id="sigess-pill-text">Preencher</span>
    `;

    document.body.appendChild(pill);

    pill.addEventListener('click', () => {
      const textEl = document.getElementById('sigess-pill-text');
      if (textEl) textEl.textContent = 'Preenchendo...';
      pill.classList.add('sigess-pill-loading');

      this.runFiller()
        .then(() => {
          if (textEl) textEl.textContent = 'Concluído!';
          setTimeout(() => {
            if (textEl) textEl.textContent = 'Preencher';
            pill.classList.remove('sigess-pill-loading');
          }, 3000);
        })
        .catch(err => {
          console.error("[SIGESS] SDPA Filler Error:", err);
          if (textEl) textEl.textContent = 'Preencher';
          pill.classList.remove('sigess-pill-loading');
        });
    });

    this.broadcastSdpaDataToSidebar();
  }

  private setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(input, "");
      setter.call(input, value);
    } else {
      input.value = value;
    }
    for (const type of ["input", "change", "blur"]) {
      input.dispatchEvent(new Event(type, { bubbles: true }));
    }
    input.blur();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  public async runFiller() {
    if (!this.auditData) {
        alert("Dados de auditoria não encontrados. Abra novamente pelo SIGESS Web.");
        return;
    }

    console.log("[SIGESS] Iniciando preenchimento SDPA...");

    // 1. Contatos
    this.fillInput('input[name="contato.email"]', this.settings?.sdpaDefaultEmail || "");
    this.fillInput('input[name="contato.telefone"]', this.auditData.telefone || this.settings?.sdpaFallbackPhone || "");

    // 2. Grau de Instrução (Escolaridade)
    const grauTarget = this.resolveGrauInstrucaoMte(this.auditData.escolaridade, (this.auditData as any).alfabetizado);
    this.selectGrauInstrucaoDirect(grauTarget.id);

    // 3. RGP / CPF
    const cpfValue = this.getCPF();
    if (cpfValue) {
      const rgpValue = `PAPA${cpfValue.replaceAll(/\D/g, "")}`;
      const rgpInput = Array.from(document.querySelectorAll('input')).find(input => {
        const label = input.closest('.br-input')?.querySelector('label')?.textContent?.trim() ||
          input.parentElement?.querySelector('label')?.textContent?.trim();
        return label?.includes('RGP');
      });
      if (rgpInput && rgpValue !== "PAPA") {
        this.setInputValue(rgpInput, rgpValue);
      }
    }

    // 4. Endereço Completo
    const d = this.auditData;
    this.fillInput('input[name="endereco.cep"]', d.cep || "");
    this.fillInput('input[name="endereco.logradouro"]', d.endereco || "");
    this.fillInput('input[name="endereco.numero"]', d.numero || "");
    this.fillInput('input[name="endereco.complemento"]', ""); // Não temos complemento isolado
    this.fillInput('input[name="endereco.bairro"]', d.bairro || "");
    this.fillInput('input[name="endereco.municipio"]', d.cidade || "");
    this.fillInput('input[name="endereco.uf"]', d.uf || "");

    // 5. Data 1º Registro
    if (this.auditData.dataPrimeiroRegistro) {
      const dateInput = document.querySelector('.br-datetimepicker input');
      if (dateInput && (dateInput as any)._flatpickr) {
        (dateInput as any)._flatpickr.setDate(this.auditData.dataPrimeiroRegistro, true, "d/m/Y");
      }
    }

    // 6. Regras Automáticas
    this.selectInBrSelect('registroPesca.idAtividadePesqueira', 'Familiar');
    this.clickRadio('registroPesca.realizouContribuicao', 'Sim');
    this.clickRadio('registroPesca.possuiNotasFiscais', 'não');
    this.clickRadio('informarDadosBancarios', 'não');

    const checkbox = document.querySelector('input[name="aceiteRegras"]') as HTMLInputElement;
    if (checkbox) checkbox.checked = true;

    // 7. Aguardar Portaria (Se necessário)
    setTimeout(() => {
      this.selectInBrSelect('idDefeso', '48');
    }, 1000);

    // 8. CEP (Último para disparar gatilhos se houver)
    setTimeout(() => {
      this.fillInput('input[name="endereco.cep"]', this.auditData?.cep || "");
      this.finalize();
    }, 2000);
  }

  private fillInput(selector: string, value: string) {
    const el = document.querySelector(selector) as HTMLInputElement;
    if (el) {
      this.setInputValue(el, value);
    }
  }

  private clickRadio(name: string, labelText: string) {
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(r => {
      const label = document.querySelector(`label[for="${r.id}"]`);
      if (label?.textContent?.toLowerCase().includes(labelText.toLowerCase())) {
        (r as HTMLElement).click();
      }
    });
  }

  private selectInBrSelect(id: string, search: string) {
    const selector = `.br-select:has(#${CSS.escape(id)})`;
    const parent = document.querySelector(selector);
    if (parent) {
      const items = parent.querySelectorAll('.br-item label');
      for (const label of Array.from(items)) {
        if (label.textContent?.toUpperCase().includes(search.toUpperCase())) {
          const radioId = (label as HTMLElement).getAttribute('for');
          if (radioId) {
            const radio = document.getElementById(radioId);
            radio?.click();
          }
          break;
        }
      }
    }
  }

  private finalize() {
    // Clipboard
    const name = document.getElementById('sigess-fisherman-name')?.textContent || "";
    if (name) {
      navigator.clipboard.writeText(name).catch(() => { });
    }

    // Upload host visibility
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.style.display = 'block';
      fileInput.style.width = '100%';
      fileInput.style.padding = '20px';
      fileInput.style.border = '2px dashed #f59e0b';
      fileInput.style.marginTop = '10px';
      fileInput.classList.add('sigess-flash-upload');
    }

    // Desfocar qualquer elemento ativo para que o cursor não fique preso no telefone ou CEP
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.querySelectorAll('input, select, textarea').forEach(el => {
      if (el instanceof HTMLElement) el.blur();
    });
  }
}

// Inicializa o motor em qualquer rota do portal MTE para monitorar transições SPA sem F5
(async () => {
  try {
    await SDPAEngine.initialize();
  } catch (err) {
    console.error("[SIGESS] SDPA Factory Error:", err);
  }
})();
