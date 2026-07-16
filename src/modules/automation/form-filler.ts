import { PessoaData } from "../../shared/types";

/**
 * Preenche formulários do SIGESS com os dados capturados.
 * Funciona com inputs nativos, Radix UI selects e radio buttons.
 */
export async function fillSIGESSForm(): Promise<void> {
  const mode = detectFillMode();
  console.log(`SIGESS: Iniciando preenchimento automático (${mode === 'edit' ? 'Modo EDIÇÃO' : 'Modo CADASTRO'})...`);
  
  try {
    const data = await getCollectedData();
    if (!data) {
      console.warn("SIGESS: Nenhum dado disponível para preenchimento (nome/cpf ausentes).");
      return;
    }

    console.log("SIGESS: Dados recuperados para preenchimento:", data);

    let count = 0;
    
    // Passo 1: Preenche a aba atual (Dados Pessoais)
    count += fillStandardInputs(data);
    count += fillStandardRadios(data);
    count += await fillCustomSelects(data);
    
    // Gatilho de data para gerar código de sócio
    triggerDateBlur(data);

    // Passo 2: Troca para a aba "Documentos" e preenche o restante
    console.log("SIGESS: Navegando para aba Documentos...");
    // Tenta pelo valor interno (documents) ou rótulo visível (Documentos)
    const switched = await switchTab("documents") || await switchTab("Documentos");
    
    if (switched) {
      // Segunda passada para campos que surgiram na nova aba (RG, UF RG, etc)
      count += fillStandardInputs(data);
      count += fillStandardRadios(data);
      count += await fillCustomSelects(data);
    }

    console.log(`SIGESS: Formulário Assistido: ${count} campos preenchidos.`);
    if (count === 0) {
      console.warn("SIGESS: Nenhum campo correspondente encontrado nesta página.");
    }
  } catch (error) {
    console.error("SIGESS: Erro crítico ao preencher formulário:", error);
  }
}

/**
 * Detecta se estamos na página de cadastro novo ou edição de sócio.
 */
function detectFillMode(): 'registration' | 'edit' {
  return globalThis.location.pathname.includes('/members/') ? 'edit' : 'registration';
}

// ── Coleta de dados ──────────────────────────────────────────────────────

async function getCollectedData(): Promise<PessoaData | null> {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  const data = settings.pessoaData as PessoaData;
  return (data?.nome && data?.cpf) ? data : null;
}

// ── Inputs padrão ────────────────────────────────────────────────────────

function fillStandardInputs(data: PessoaData): number {
  let count = 0;

  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val !== 'object') {
      const input = document.querySelector(
        `input[name="${key}"], textarea[name="${key}"], input[id="${key}"], textarea[id="${key}"]`
      ) as HTMLInputElement | null;

      if (input) {
        setReactInput(input, String(val));
        count++;
      }
    }
  }
  return count;
}

// ── Mudança 2: triggerDateBlur com sentinela para modo de edição ──────────

function triggerDateBlur(data: PessoaData): void {
  const dateInput = document.querySelector<HTMLInputElement>(
    'input[name="dataDeNascimento"], input[id="dataDeNascimento"]'
  );
  if (!dateInput || !data.dataDeNascimento) return;

  const mode = detectFillMode();
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value"
  )?.set;

  setTimeout(() => {
    dateInput.focus();
    if (mode === 'edit' && nativeSetter) {
      // Força dirty state no RHF: data temporária -> data real
      nativeSetter.call(dateInput, "1900-01-01");
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
      nativeSetter.call(dateInput, data.dataDeNascimento);
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      dateInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setTimeout(() => {
      dateInput.dispatchEvent(new Event("blur", { bubbles: true }));
    }, 100);
  }, 500);
}

// ── Radio buttons ────────────────────────────────────────────────────────

function fillStandardRadios(data: PessoaData): number {
  let count = 0;
  const radios: Array<{ name: string; value: string | undefined }> = [
    { name: 'sexo', value: data.sexo },
    { name: 'alfabetizado', value: data.alfabetizado }
  ];

  for (const r of radios) {
    if (r.value) {
      const selector = `input[name="${r.name}"][value="${r.value}"], button[role="radio"][value="${r.value}"]`;
      const el = document.querySelector(selector) as HTMLElement | null;

      if (el) {
        el.focus();
        el.click();
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        count++;
      }
    }
  }
  return count;
}

// ── Selects customizados (Radix UI) ─────────────────────────────────────

async function fillCustomSelects(data: PessoaData): Promise<number> {
  let count = 0;

  const ESCOLARIDADE_NORM: Record<string, string> = {
    "ENSINO FUNDAMENTAL INCOMPLETO": "FUNDAMENTAL INCOMPLETO",
    "ENSINO FUNDAMENTAL COMPLETO":   "FUNDAMENTAL COMPLETO",
    "ENSINO MÉDIO INCOMPLETO":       "MÉDIO INCOMPLETO",
    "ENSINO MÉDIO COMPLETO":         "MÉDIO COMPLETO",
    "ENSINO SUPERIOR INCOMPLETO":    "SUPERIOR INCOMPLETO",
    "ENSINO SUPERIOR COMPLETO":      "SUPERIOR COMPLETO",
  };

  const selectFields: Array<[string, string | undefined]> = [
    ['Escolaridade',     data.escolaridade
                           ? (ESCOLARIDADE_NORM[data.escolaridade] ?? data.escolaridade)
                           : undefined],
    ['Estado Civil',     data.estadoCivil],
    ['UF de Nascimento', data.ufNaturalidade],  // era 'UF Naturalidade'
    ['UF RG',            data.ufRg],            // era 'UF do RG'
    ['Estado (UF)',      data.uf],              // novo
    ['UF RGP',           data.ufRgp],           // era 'UF do RGP'
    ['Tipo de RGP',      data.tipoRgp],         // era 'Tipo'
    ['Data Emissão RGP', data.emissaoRgp || data.dataPrimeiroRegistro],
  ];

  for (const [labelText, value] of selectFields) {
    if (value) {
      const ok = await fillRadixSelect(labelText, value);
      if (ok) count++;
    }
  }
  return count;
}

async function fillRadixSelect(labelText: string, value: string): Promise<boolean> {
  if (!value) return false;

  const allLabels = Array.from(document.querySelectorAll('label'));
  const label = allLabels.find(l =>
    l.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())
  );

  let trigger: Element | null = null;

  if (label) {
    const container = label.closest('div, fieldset, section') || label.parentElement;
    if (container) {
      trigger = container.querySelector('[role="combobox"]');
    }
  }

  trigger ??= document.querySelector(`[role="combobox"][aria-label*="${labelText}"]`);

  if (!trigger) return false;

  (trigger as HTMLElement).click();
  await sleep(350);

  const options = Array.from(document.querySelectorAll('[role="option"]'));
  const normalizeSelectText = (text: string) => text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  const valueNorm = normalizeSelectText(value);

  const match = options.find(o => normalizeSelectText(o.textContent || "") === valueNorm)
    || options.find(o => normalizeSelectText(o.textContent || "").includes(valueNorm))
    || options.find(o => valueNorm.includes(normalizeSelectText(o.textContent || "___")));

  if (match) {
    (match as HTMLElement).click();
    return true;
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return false;
}

/**
 * Navega entre abas do SIGESS (Radix UI).
 */
async function switchTab(tabValueOrLabel: string): Promise<boolean> {
  const tabs = Array.from(document.querySelectorAll('[role="tab"], button[data-value], button[data-state]'));
  
  // Log de diagnóstico para o console (F12) do usuário
  console.log(`SIGESS: Procurando "${tabValueOrLabel}" entre ${tabs.length} abas:`, 
    tabs.map(t => `[${t.getAttribute('data-value') || 'no-val'}] "${t.textContent?.trim()}"`)
  );

  const targetTab = tabs.find(t => {
    const val = t.getAttribute('data-value') || t.getAttribute('value');
    if (val === tabValueOrLabel) return true;
    
    const aria = t.getAttribute('aria-label')?.toLowerCase() || "";
    if (aria.includes(tabValueOrLabel.toLowerCase())) return true;

    // Busca flexível por texto
    const text = t.textContent?.trim().toLowerCase() || "";
    return text.includes(tabValueOrLabel.toLowerCase());
  });

  if (targetTab) {
    console.log("SIGESS: Aba localizada. Clicando...");
    (targetTab as HTMLElement).focus();
    (targetTab as HTMLElement).click();
    await sleep(800); // Aumentado para garantir estabilidade
    return true;
  }

  return false;
}

// ── Utilitários ─────────────────────────────────────────────────────────

function setReactInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  if (!el) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    globalThis.HTMLInputElement.prototype, "value",
  )?.set || Object.getOwnPropertyDescriptor(
    globalThis.HTMLTextAreaElement.prototype, "value",
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
