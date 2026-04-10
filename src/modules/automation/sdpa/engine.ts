import { AppSettings, PessoaData } from '../../../shared/types';
import { StorageService } from '../../../background/services/storage';

class SDPAEngine {
  private static instance: SDPAEngine | null = null;
  private settings: AppSettings | null = null;
  private auditData: PessoaData | null = null;
  private auditIntervalId: any = null;

  private constructor() {
    // Privado para forçar uso do static initialize
  }

  public static async initialize() {
    if (!SDPAEngine.instance) {
      SDPAEngine.instance = new SDPAEngine();

      // Listeners para navegação SPA do Portal MTE
      window.addEventListener('hashchange', () => SDPAEngine.instance?.handleRouteChange());
      window.addEventListener('popstate', () => SDPAEngine.instance?.handleRouteChange());
      window.addEventListener('load', () => SDPAEngine.instance?.handleRouteChange());
    }
    await SDPAEngine.instance.handleRouteChange();
  }

  private async handleRouteChange() {
    this.settings = await StorageService.getSettings();
    if (!this.settings?.sdpaEnabled) {
      this.stop();
      return;
    }

    const isStepRoute = window.location.hash.includes('/solicitacao-pescador/etapas');

    if (isStepRoute) {
      this.auditData = this.settings.pessoaData || null;
      this.injectStyles();
      this.injectUI();
      this.startAuditor();
    } else {
      this.stop();
    }
  }

  private stop() {
    if (this.auditIntervalId) {
      clearInterval(this.auditIntervalId);
      this.auditIntervalId = null;
    }
    document.getElementById('sigess-sdpa-panel')?.remove();
  }

  private injectStyles() {
    const style = document.createElement('style');
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
      
      .sigess-sdpa-panel {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 180px;
        background: var(--sigess-glass);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        border-radius: 12px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        z-index: 10000;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        overflow: hidden;
        border: 1px solid var(--sigess-border);
        animation: sigess-slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        color: #1e293b;
      }

      @keyframes sigess-slide-in {
        from { transform: translateX(100%) opacity(0); }
        to { transform: translateX(0) opacity(1); }
      }
      
      .sigess-panel-header {
        background: linear-gradient(135deg, var(--sigess-teal) 0%, #134e4a 100%);
        padding: 8px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .sigess-header-title {
        color: white;
        font-weight: 700;
        font-size: 11px;
        letter-spacing: -0.01em;
      }
      
      .sigess-panel-body { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
      
      .sigess-data-card {
        background: rgba(255,255,255,0.4);
        border: 1px solid rgba(226, 232, 240, 0.3);
        border-radius: 6px;
        padding: 4px 6px;
        display: flex;
        flex-direction: column;
        gap: 1px;
        transition: all 0.2s ease;
      }

      .sigess-data-card:hover {
        background: white;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      }

      .sigess-label {
        font-size: 8px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .sigess-value {
        font-size: 10px;
        font-weight: 600;
        color: #1e293b;
        line-height: 1.2;
      }

      .sigess-btn-fill {
        width: 100%;
        padding: 8px;
        background: linear-gradient(135deg, var(--sigess-teal) 0%, var(--sigess-teal-dark) 100%);
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: 700;
        font-size: 10px;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(15, 118, 110, 0.25);
      }

      .sigess-btn-fill:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(15, 118, 110, 0.35);
        filter: brightness(1.1);
      }

      .sigess-btn-fill:active {
        transform: translateY(0);
      }

      .sigess-icon-circle {
        background: rgba(15, 118, 110, 0.1);
        border-radius: 6px;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `;
    document.head.appendChild(style);
  }

  private startAuditor() {
    if (this.auditIntervalId) clearInterval(this.auditIntervalId);
    this.auditIntervalId = setInterval(() => {
      // Re-injeta se sumiu mas ainda estamos na rota
      if (window.location.hash.includes('/solicitacao-pescador/etapas')) {
        if (!document.getElementById('sigess-sdpa-panel')) this.injectUI();

        if (document.querySelector('.card-content') || document.querySelector('.br-card')) {
          this.runAudit();
        }
      } else {
        this.stop();
      }
    }, 1500);
  }

  private runAudit() {
    if (!this.auditData) return;

    // Limpeza global de estilos de auditoria antes de começar
    document.querySelectorAll('.sigess-audit-green, .sigess-audit-red, .sigess-audit-orange')
      .forEach(el => el.classList.remove('sigess-audit-green', 'sigess-audit-red', 'sigess-audit-orange'));

    this.auditDateField();

    // 2. Auditoria de Endereço
    const d = this.auditData;
    this.auditTextField('input[name="endereco.cep"]', d.cep || "");
    this.auditTextField('input[name="endereco.logradouro"]', d.endereco || "");
    this.auditTextField('input[name="endereco.numero"]', d.numero || "");
    this.auditTextField('input[name="endereco.bairro"]', d.bairro || "");
    this.auditTextField('input[name="endereco.municipio"]', d.cidade || "");
    this.auditTextField('input[name="endereco.uf"]', d.uf || "");

    // 3. Auditoria de Regras (Atividade, Contribuição, etc)
    this.auditRadioRule('registroPesca.idAtividadePesqueira', 'Familiar');
    this.auditRadioStatus('registroPesca.realizouContribuicao', 'Sim');
    this.auditRadioStatus('registroPesca.possuiNotasFiscais', 'não');
    this.auditRadioStatus('informarDadosBancarios', 'não');

    this.validateSubmitButton();
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
      this.applyAuditStyle(parent, 'green');
    } else if (normalizeBase !== "") {
      this.applyAuditStyle(parent, 'orange');
    } else {
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
      this.applyAuditStyle(parent, 'green');
    } else if (baseVal !== "") {
      this.applyAuditStyle(parent, 'orange');
    } else {
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
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    if (checked) {
      const label = document.querySelector(`label[for="${checked.id}"]`);
      // Foca estritamente no grupo de rádio
      const parent = checked.closest('.br-radio')?.parentElement;
      if (parent && parent instanceof HTMLElement && label) {
        if (label.textContent?.toLowerCase().includes(expectedLabel.toLowerCase())) {
          this.applyAuditStyle(parent, 'green');
        } else {
          this.applyAuditStyle(parent, 'red');
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

  private mapEducationLevel(level: string): string {
    const l = level.toUpperCase().trim();
    const map: Record<string, string> = {
      'FUNDAMENTAL INCOMPLETO': 'FUNDAMENTAL INCOMPL.',
      'FUNDAMENTAL COMPLETO': 'FUNDAMENTAL COMPLETO',
      'MÉDIO INCOMPLETO': 'ENS. MEDIO INCOMPL',
      'MEDIO INCOMPLETO': 'ENS. MEDIO INCOMPL',
      'MÉDIO COMPLETO': 'ENS. MEDIO COMPLETO',
      'MEDIO COMPLETO': 'ENS. MEDIO COMPLETO',
      'SUPERIOR INCOMPLETO': 'SUPERIOR INCOMPLETO',
      'SUPERIOR COMPLETO': 'SUPERIOR COMPLETO'
    };
    return map[l] || level;
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

  private injectUI() {
    if (document.getElementById('sigess-sdpa-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'sigess-sdpa-panel';
    panel.className = 'sigess-sdpa-panel';

    const firstReg = this.formatDateBR(this.auditData?.dataPrimeiroRegistro);
    const address = this.auditData ?
      (`${this.auditData.endereco || ""}, ${this.auditData.numero || "S/N"} - ${this.auditData.bairro || ""} (${this.auditData.cidade || ""}/${this.auditData.uf || ""})`).trim()
      : "---";

    panel.innerHTML = `
      <div class="sigess-panel-header">
        <div class="sigess-icon-circle" style="background: rgba(255,255,255,0.1)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"></path><rect width="16" height="12" x="4" y="8" rx="2"></rect><path d="M2 14h2"></path><path d="M20 14h2"></path><path d="M15 13v2"></path><path d="M9 13v2"></path></svg>
        </div>
        <span class="sigess-header-title">Solicitação SDPA</span>
      </div>
      <div class="sigess-panel-body">
        <div class="sigess-data-card">
            <label class="sigess-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                Nome (Portal MTE)
            </label>
            <div id="sigess-fisherman-name" class="sigess-value">Extraindo nome...</div>
        </div>
        
        <div class="sigess-data-card">
            <label class="sigess-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Data 1º Reg (SIGESS)
            </label>
            <div class="sigess-value">${firstReg}</div>
        </div>

        <div class="sigess-data-card">
            <label class="sigess-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                Endereço (SIGESS)
            </label>
            <div class="sigess-value" style="font-size: 11px;">${address}</div>
        </div>

        <button class="sigess-btn-fill" id="sigess-btn-fill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            PREENCHER SDPA
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    // Atualiza nome extraído da página
    setTimeout(() => {
      const nameEl = Array.from(document.querySelectorAll('[id^="campo-informacao-"]')).find(el => {
        const label = el.parentElement?.parentElement?.querySelector('div:first-child')?.textContent?.trim();
        return label === "Nome";
      });

      if (nameEl) {
        const nameTarget = document.getElementById('sigess-fisherman-name');
        if (nameTarget) nameTarget.textContent = nameEl.textContent?.trim() || "---";
      }
    }, 2000);

    document.getElementById('sigess-btn-fill')?.addEventListener('click', () => {
      this.runFiller().catch(err => console.error("[SIGESS] SDPA Filler Error:", err));
    });
  }

  private async runFiller() {
    if (!this.auditData) {
        alert("Dados de auditoria não encontrados. Abra novamente pelo SIGESS Web.");
        return;
    }

    console.log("[SIGESS] Iniciando preenchimento SDPA...");

    // 1. Contatos
    this.fillInput('input[name="contato.email"]', this.settings?.sdpaDefaultEmail || "");
    this.fillInput('input[name="contato.telefone"]', this.auditData.telefone || this.settings?.sdpaFallbackPhone || "");

    // 2. Escolaridade com Mapeamento MTE
    const escolaridadeMTE = this.mapEducationLevel(this.auditData.escolaridade || "");
    this.selectInBrSelect('grauInstrucao', escolaridadeMTE);

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
        rgpInput.value = rgpValue;
        rgpInput.dispatchEvent(new Event('input', { bubbles: true }));
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
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
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

    alert(`Preenchimento Concluído!\n\nNome copiado para o clipboard: ${name}\n\nO campo de upload agora está visível em destaque.`);
  }
}

// Inicializa o motor apenas na página específica de etapas
if (document.location.href.includes('/solicitacao-pescador/etapas')) {
  (async () => {
    try {
      await SDPAEngine.initialize();
    } catch (err) {
      console.error("[SIGESS] SDPA Factory Error:", err);
    }
  })();
}
