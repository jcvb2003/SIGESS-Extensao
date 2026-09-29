import { setupSPANavigationObserver } from "../spa-observer";
import { sleep, waitFor } from "../../../shared/utils/dom-helpers";
import { MUNICIPIOS_LIST } from "../../../shared/data/municipios";
import { FISHING_LOCATION_OPTIONS } from "../../../popup/components/panels/reap-mpa-settings/constants";
import type {
  PesqBrasilCadastroConfig,
  PesqBrasilCadastroContext,
  PesqBrasilCadastroMemberData,
} from "./contracts";

const PILL_ID = "sigess-pesqbrasil-cadastro-pill";
const PANEL_ID = "sigess-pesqbrasil-cadastro-config";
const STATUS_ID = "sigess-pesqbrasil-cadastro-status";
const STYLE_ID = "sigess-pesqbrasil-cadastro-styles";
const ADDRESS_BANNER_ID = "sigess-pesqbrasil-web-address";

const GROUP_OPTIONS = [
  "Algas",
  "Moluscos",
  "Mariscos",
  "Peixes",
  "Quelônios (Tartarugas de água doce)",
  "Répteis (jacarés e outros)",
  "Crustáceos (camarão, lagosta, caranguejo, entre outros)",
];

const ENVIRONMENT_OPTIONS = ["Água Doce", "Água Salgada"];
const CATEGORY_OPTIONS = ["Artesanal", "Industrial"] as const;

const UF_LABELS: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const UF_CODE_BY_LABEL = Object.fromEntries(
  Object.entries(UF_LABELS).map(([code, label]) => [normalizeText(label), code]),
) as Record<string, string>;

const UF_OPTIONS = Array.from(new Set(
  MUNICIPIOS_LIST.map((municipio) => municipio.camposAdicionais.siglaUf.toUpperCase()),
)).sort();

type PageKind = "personal" | "activity" | "socioeconomic" | null;

function browserApi(): any {
  return (globalThis.browser || (globalThis as any).chrome) as any;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeUfCode(value: unknown): string {
  const normalized = normalizeText(value);
  if (UF_OPTIONS.includes(normalized)) return normalized;
  return UF_CODE_BY_LABEL[normalized] || "";
}

function portalUfLabel(value: unknown): string {
  const code = normalizeUfCode(value);
  return normalizeText(UF_LABELS[code] || value || "");
}

function renderMunicipalityOptions(uf: string, selected: string): string {
  const normalizedUf = normalizeUfCode(uf);
  const municipalities = MUNICIPIOS_LIST
    .filter((municipio) => !normalizedUf || municipio.camposAdicionais.siglaUf.toUpperCase() === normalizedUf)
    .sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"));
  const selectedValue = selected.trim();
  const selectedExists = municipalities.some((municipio) => normalizeText(municipio.nome) === normalizeText(selectedValue));
  const options = municipalities.map((municipio) =>
    `<option value="${escapeHtml(municipio.nome)}" ${normalizeText(municipio.nome) === normalizeText(selectedValue) ? "selected" : ""}>${escapeHtml(municipio.nome)}</option>`,
  ).join("");
  return `<option value="">Selecione o município</option>${selectedExists ? "" : selectedValue ? `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>` : ""}${options}`;
}

function pageKind(): PageKind {
  const path = globalThis.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/cadastro/dados-pessoais")) return "personal";
  if (path.endsWith("/cadastro/dados-da-atividade")) return "activity";
  if (path.endsWith("/cadastro/questionario-socioeconomico")) return "socioeconomic";
  return null;
}

function isPesqBrasilHost(): boolean {
  const host = globalThis.location.hostname;
  return host === "pesqbrasil-pescadorprofissional.mpa.gov.br"
    || host === "pesqbrasil-pescadorprofissional.agro.gov.br";
}

function findTextElement(text: string): HTMLElement | null {
  const expected = normalizeText(text);
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    "label, .form-label, .section-label, .input-label > div, .section-description",
  ));
  return candidates.find((candidate) => {
    const actual = normalizeText(candidate.textContent);
    return actual === expected || actual.includes(expected);
  }) || null;
}

function findFieldContainer(labelText: string): HTMLElement | null {
  const element = findTextElement(labelText);
  if (!element) return null;
  return element.closest<HTMLElement>(".br-select")
    || element.closest<HTMLElement>(
      ".br-input, .input-label, .radio-group, .checkbox-group, .form-group, .row",
    )
    || element.parentElement;
}

function readContainerValue(container: HTMLElement | null): string {
  if (!container) return "";
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea",
  );
  if (input) return input.value.trim();

  const nativeSelect = container.querySelector<HTMLSelectElement>("select");
  if (nativeSelect) return nativeSelect.selectedOptions[0]?.textContent?.trim() || "";

  const combobox = container.querySelector<HTMLElement>("[role=combobox]");
  if (combobox) {
    return (combobox.getAttribute("aria-label") || combobox.textContent || "")
      .replace(/Campo obrigatório/giu, "")
      .replace(/Selecione/giu, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const trigger = container.querySelector<HTMLElement>("button[data-trigger]");
  if (trigger) return trigger.textContent?.trim() || "";
  return "";
}

function readFieldValue(labelText: string, selectors: string[] = []): string {
  for (const selector of selectors) {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
    if (el && "value" in el && el.value.trim()) return el.value.trim();
  }
  return readContainerValue(findFieldContainer(labelText));
}


function clickLabel(text: string): boolean {
  const expected = normalizeText(text);
  const elements = Array.from(document.querySelectorAll<HTMLElement>(
    "label, .br-checkbox, .br-radio, [role=checkbox], [role=radio], .form-check",
  ));
  // 1. Prioridade absoluta: correspondência EXATA
  let target = elements.find((element) => normalizeText(element.textContent) === expected);
  // 2. Se não encontrar exata, buscar onde o texto começa ou contém com limite de palavra
  if (!target) {
    target = elements.find((element) => {
      const norm = normalizeText(element.textContent);
      return norm.startsWith(expected) || norm.endsWith(expected) || norm.includes(` ${expected} `);
    });
  }
  // 3. Fallback
  if (!target) {
    target = elements.find((element) => normalizeText(element.textContent).includes(expected));
  }
  if (!target) return false;

  const input = target.querySelector<HTMLInputElement>("input[type=checkbox], input[type=radio]")
    || (target instanceof HTMLLabelElement && target.htmlFor ? document.getElementById(target.htmlFor) as HTMLInputElement | null : null)
    || (target instanceof HTMLInputElement ? target : null);

  if (input?.checked) return true;

  if (input) {
    input.click();
    if (input.checked) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  const innerLabel = target.querySelector<HTMLElement>("label");
  if (innerLabel) {
    innerLabel.click();
    if (input?.checked) {
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  target.click();
  if (input && !input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (!input) return false;

  const target = ((input as any).wrappedJSObject || input) as any;
  const tracker = target._valueTracker || (input as any)._valueTracker;
  if (tracker && typeof tracker.setValue === "function") {
    try {
      tracker.setValue(input.value);
    } catch {}
  }

  const win = (input.ownerDocument?.defaultView || globalThis.window || globalThis) as any;
  const winProto = win?.wrappedJSObject || win;
  const isTextArea = typeof HTMLTextAreaElement !== "undefined" && input instanceof (winProto.HTMLTextAreaElement || HTMLTextAreaElement);
  const proto = isTextArea
    ? (winProto.HTMLTextAreaElement?.prototype || HTMLTextAreaElement.prototype)
    : (winProto.HTMLInputElement?.prototype || HTMLInputElement.prototype);

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set
    || Object.getOwnPropertyDescriptor(
      isTextArea ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  return true;
}

async function fillLabeledInput(
  labelText: string,
  value: unknown,
  selectors: string[] = [],
): Promise<boolean> {
  if (value === undefined || value === null || String(value).trim() === "") return false;
  const val = String(value).trim();

  for (const selector of selectors) {
    const directInput = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (directInput && !directInput.disabled) {
      return setInputValue(directInput, val);
    }
  }

  const container = findFieldContainer(labelText);
  if (container) {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      "input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea",
    );
    if (input && !input.disabled) {
      return setInputValue(input, val);
    }
  }

  const normalizedLabel = normalizeText(labelText);
  const candidates = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea",
  ));
  const byPlaceholder = candidates.find((cand) => {
    if (cand.disabled) return false;
    const ph = normalizeText(cand.placeholder);
    return ph.includes(normalizedLabel) || normalizedLabel.includes(ph);
  });
  if (byPlaceholder) {
    return setInputValue(byPlaceholder, val);
  }

  return false;
}

async function selectLabeledOption(labelText: string, value: string): Promise<boolean> {
  if (!value) return false;
  const container = findFieldContainer(labelText);
  if (!container) return false;

  const native = container.querySelector<HTMLSelectElement>("select");
  if (native) {
    const option = Array.from(native.options).find((item) =>
      normalizeText(item.textContent) === normalizeText(value)
      || normalizeText(item.textContent).includes(normalizeText(value)),
    );
    if (!option) return false;
    native.value = option.value;
    native.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return selectContainerOption(container, value);
}

function findDropdownTrigger(container: HTMLElement): HTMLElement | null {
  const scope = container.closest<HTMLElement>("[role=combobox], .br-select") || container;
  return scope.querySelector<HTMLElement>(
    "button[data-trigger], button[aria-haspopup='listbox'], button:not([disabled]), [role=combobox]",
  );
}

function findVisibleDropdownOption(value: string): HTMLElement | null {
  const expected = normalizeText(value);
  return Array.from(document.querySelectorAll<HTMLElement>(
    "[role=listbox] [role=option], [role=listbox] .br-item, [role=listbox] label, [role=listbox] [role=radio], .br-list [role=option], .br-list .br-item, .br-list label, .br-list [role=radio]",
  )).find((item) => {
    if (item.getClientRects().length === 0) return false;
    const actual = normalizeText(item.textContent);
    const ariaLabel = normalizeText(item.getAttribute("aria-label"));
    return actual === expected || ariaLabel === expected;
  }) || null;
}

async function selectContainerOption(container: HTMLElement, value: string): Promise<boolean> {
  if (!value) return false;

  const expected = normalizeText(value);
  const radios = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const radioEntries = radios.map((radio) => ({
    radio,
    label: Array.from(container.querySelectorAll<HTMLLabelElement>("label"))
      .find((label) => label.htmlFor === radio.id),
  }));
  const matchingEntry = radioEntries.find(({ label }) => normalizeText(label?.textContent) === expected)
    || radioEntries.find(({ label }) => normalizeText(label?.textContent).includes(expected));
  if (matchingEntry) {
    if (!matchingEntry.radio.checked) {
      matchingEntry.radio.click();
      if (!matchingEntry.radio.checked) matchingEntry.label?.click();
    }
    await waitFor(() => matchingEntry.radio.checked, 1000);
    return matchingEntry.radio.checked;
  }

  const alreadyOpen = findVisibleDropdownOption(value);
  if (alreadyOpen) {
    alreadyOpen.click();
    await sleep(250);
    return true;
  }

  const trigger = findDropdownTrigger(container);
  if (!trigger) return false;
  trigger.click();
  await sleep(250);
  const option = findVisibleDropdownOption(value);
  if (!option) return false;
  option.click();
  await sleep(250);
  return true;
}

function formatDateForPortal(value?: string): string {
  if (!value) return "";
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function toBooleanLabel(value: unknown): string {
  const normalized = normalizeText(value);
  if (["SIM", "S", "TRUE", "1"].includes(normalized)) return "Completamente alfabetizado";
  if (["NAO", "N", "FALSE", "0", "NÃO"].includes(normalized)) return "Não alfabetizado";
  return String(value ?? "");
}

function mapEscolaridadeForPesqBrasil(value?: string): string {
  const normalized = normalizeText(value);
  const map: Record<string, string> = {
    "ANALFABETO(A)": "Sem escolaridade",
    "FUNDAMENTAL I INCOMPLETO": "1ª a 4ª Série incompleta/Ensino Fundamental",
    "FUNDAMENTAL I COMPLETO": "1ª a 4ª Série completa/Ensino Fundamental",
    "FUNDAMENTAL II INCOMPLETO": "5ª a 9ª Série incompleta/Ensino Fundamental",
    "FUNDAMENTAL II COMPLETO": "5ª a 9ª Série completa/Ensino Fundamental",
    "MEDIO INCOMPLETO": "2º Grau incompleto/Ensino Médio",
    "MEDIO COMPLETO": "2º Grau completo/Ensino Médio",
    "SUPERIOR INCOMPLETO": "Ensino superior incompleto",
    "SUPERIOR COMPLETO": "Ensino superior completo",
    "OUTRO": "Ensino técnico completo",
  };
  return map[normalized] || String(value || "");
}

export function formatMemberAddress(member?: PesqBrasilCadastroMemberData | null): string {
  if (!member) return "";
  const parts: string[] = [];

  const logradouro = member.endereco?.trim();
  const numero = member.numero?.trim();
  const complemento = member.complemento?.trim();
  const bairro = member.bairro?.trim();
  const cidade = member.cidade?.trim();
  const uf = member.uf?.trim();
  const cep = member.cep?.trim();

  let logradouroNumero = logradouro || "";
  if (numero) {
    logradouroNumero = logradouroNumero ? `${logradouroNumero}, nº ${numero}` : `Nº ${numero}`;
  }
  if (logradouroNumero) parts.push(logradouroNumero);

  if (complemento) parts.push(complemento);
  if (bairro) parts.push(`Bairro: ${bairro}`);

  if (cidade && uf) {
    parts.push(`${cidade}-${uf}`);
  } else if (cidade) {
    parts.push(cidade);
  } else if (uf) {
    parts.push(uf);
  }

  if (cep) parts.push(`CEP: ${cep}`);

  return parts.join(", ");
}

export class PesqBrasilCadastroRuntime {
  private started = false;
  private currentRoute = "";
  private context: PesqBrasilCadastroContext | null = null;
  private config: PesqBrasilCadastroConfig | null = null;
  private busy = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    globalThis.addEventListener("popstate", () => void this.syncRoute());
    globalThis.addEventListener("hashchange", () => void this.syncRoute());
    setupSPANavigationObserver(() => void this.syncRoute(), 450);
    void this.syncRoute();
  }

  private async syncRoute(): Promise<void> {
    if (!isPesqBrasilHost()) {
      this.removeUi();
      return;
    }

    const kind = pageKind();
    if (!kind) {
      this.removeUi();
      return;
    }

    const route = `${kind}:${globalThis.location.pathname}`;
    if (route === this.currentRoute && document.getElementById(PILL_ID)) {
      if (kind === "personal") this.renderWebAddressBanner();
      return;
    }
    this.currentRoute = route;
    await this.refreshState();
    this.injectStyles();
    this.injectUi();
    if (kind === "personal") {
      this.renderWebAddressBanner();
    } else {
      this.removeWebAddressBanner();
    }
  }

  private async refreshState(): Promise<void> {
    const api = browserApi();
    const [contextResponse, configResponse] = await Promise.all([
      api.runtime.sendMessage({ action: "getPesqBrasilCadastroContext" }).catch(() => null),
      api.runtime.sendMessage({ action: "getPesqBrasilCadastroConfig" }).catch(() => null),
    ]);
    this.context = contextResponse?.data || null;
    this.config = configResponse?.data || null;
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PILL_ID} { position:fixed; top:18px; right:18px; z-index:2147483647; display:inline-flex; align-items:center; gap:6px; padding:7px 8px 7px 11px; color:#fff; background:linear-gradient(135deg,#176b68,#0d514f); border:1px solid rgba(255,255,255,.28); border-radius:999px; box-shadow:0 5px 18px rgba(13,81,79,.34); font:700 12px/1.1 system-ui,sans-serif; user-select:none; animation:sigess-pesqbrasil-pill-in .25s ease-out; }
      #${PILL_ID}:hover { filter:brightness(1.07); transform:translateY(-1px); }
      #${PILL_ID}[data-busy="true"] { opacity:.74; pointer-events:none; }
      #${PILL_ID} .sigess-pesqbrasil-logo { width:22px; height:22px; padding:2px; border-radius:50%; background:#fff; object-fit:contain; }
      #${PILL_ID} .sigess-pesqbrasil-fill { border:0; padding:0 3px; color:#fff; background:transparent; font:inherit; cursor:pointer; }
      #${PILL_ID} .sigess-pesqbrasil-settings { display:inline-grid; place-items:center; width:25px; height:25px; border:0; border-left:1px solid rgba(255,255,255,.3); color:#d8f5f2; background:transparent; cursor:pointer; }
      #${PILL_ID} svg { width:14px; height:14px; }
      #${PANEL_ID} { position:fixed; top:58px; right:18px; z-index:2147483647; width:min(420px,calc(100vw - 36px)); max-height:calc(100vh - 80px); overflow:auto; padding:16px; color:#203134; background:#f8fbfb; border:1px solid #cfe0df; border-radius:14px; box-shadow:0 16px 44px rgba(18,55,57,.22); font:12px/1.4 system-ui,sans-serif; }
      #${PANEL_ID} h3 { margin:0 0 3px; font-size:15px; color:#0d514f; }
      #${PANEL_ID} p { margin:0 0 12px; color:#627477; }
      #${PANEL_ID} .sigess-pbr-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
      #${PANEL_ID} .sigess-pbr-field { display:flex; flex-direction:column; gap:4px; margin-top:9px; }
      #${PANEL_ID} .sigess-pbr-field.full { grid-column:1/-1; }
      #${PANEL_ID} label { font-weight:700; color:#355154; }
      #${PANEL_ID} input, #${PANEL_ID} select { width:100%; min-height:32px; padding:6px 8px; border:1px solid #c7d7d6; border-radius:7px; color:#203134; background:#fff; font:inherit; }
      #${PANEL_ID} .sigess-pbr-checks { display:flex; flex-wrap:wrap; gap:6px 10px; }
      #${PANEL_ID} .sigess-pbr-check { display:inline-flex; align-items:flex-start; gap:5px; font-weight:500; }
      #${PANEL_ID} .sigess-pbr-check input { width:auto; min-height:0; margin-top:3px; }
      #${PANEL_ID} .sigess-pbr-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:14px; }
      #${PANEL_ID} button { min-height:32px; padding:6px 12px; border:1px solid #9bc1be; border-radius:8px; color:#0d514f; background:#fff; font:700 12px system-ui,sans-serif; cursor:pointer; }
      #${PANEL_ID} button.primary { color:#fff; background:#176b68; border-color:#176b68; }
      #${STATUS_ID} { position:fixed; top:64px; right:18px; z-index:2147483646; width:min(430px,calc(100vw - 36px)); padding:10px 12px; border:1px solid #cfe0df; border-radius:10px; color:#274347; background:#f7fbfb; box-shadow:0 10px 28px rgba(18,55,57,.18); font:12px/1.4 system-ui,sans-serif; }
      #${STATUS_ID}.error { border-color:#f0b6b0; color:#8a2d27; background:#fff7f6; }
      #${STATUS_ID}.success { border-color:#b6dfc6; color:#17613a; background:#f3fbf5; }
      #${STATUS_ID} strong { display:block; margin-bottom:4px; }
      #${STATUS_ID} ul { margin:5px 0 0 18px; padding:0; }
      #${ADDRESS_BANNER_ID} { display:flex; align-items:center; gap:8px; margin-top:14px; margin-bottom:12px; padding:8px 14px; background:#eef7f6; border:1px solid #b3d7d4; border-radius:6px; color:#134e4a; font-family:system-ui,-apple-system,sans-serif; font-size:13px; line-height:1.4; box-sizing:border-box; }
      #${ADDRESS_BANNER_ID} .sigess-pbr-address-icon { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; color:#0f766e; flex-shrink:0; }
      #${ADDRESS_BANNER_ID} .sigess-pbr-address-title { color:#0d514f; font-weight:600; white-space:nowrap; flex-shrink:0; }
      #${ADDRESS_BANNER_ID} .sigess-pbr-address-text { color:#203134; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500; flex-grow:1; }
      #${ADDRESS_BANNER_ID} .sigess-pbr-address-copy { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border:1px solid #b3d7d4; border-radius:4px; background:#fff; color:#0f766e; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; flex-shrink:0; transition:all .15s ease; }
      #${ADDRESS_BANNER_ID} .sigess-pbr-address-copy:hover { background:#0f766e; color:#fff; border-color:#0f766e; }
      @keyframes sigess-pesqbrasil-pill-in { from { opacity:0; transform:translateY(-7px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
    `;
    document.head.appendChild(style);
  }

  private injectUi(): void {
    if (document.getElementById(PILL_ID)) return;
    const api = browserApi();
    const pill = document.createElement("div");
    pill.id = PILL_ID;
    pill.title = "Preencher cadastro PesqBrasil";
    const logo = api.runtime?.getURL ? api.runtime.getURL("sigess-logo.png") : "sigess-logo.png";
    pill.innerHTML = `<img class="sigess-pesqbrasil-logo" src="${logo}" alt="SIGESS"><button class="sigess-pesqbrasil-fill" type="button">Preencher</button><button class="sigess-pesqbrasil-settings" type="button" aria-label="Configurar cadastro PesqBrasil" title="Configurar">⚙</button>`;
    document.body.appendChild(pill);
    pill.querySelector<HTMLButtonElement>(".sigess-pesqbrasil-fill")?.addEventListener("click", () => void this.fillCurrentPage());
    pill.querySelector<HTMLButtonElement>(".sigess-pesqbrasil-settings")?.addEventListener("click", () => this.toggleSettings());
  }

  private removeUi(): void {
    document.getElementById(PILL_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(STATUS_ID)?.remove();
    this.removeWebAddressBanner();
  }

  private renderWebAddressBanner(): void {
    if (pageKind() !== "personal") {
      this.removeWebAddressBanner();
      return;
    }

    const member = this.context?.payload?.member;
    const addressText = formatMemberAddress(member);
    if (!addressText) {
      this.removeWebAddressBanner();
      return;
    }

    let banner = document.getElementById(ADDRESS_BANNER_ID);
    if (banner) {
      const textEl = banner.querySelector<HTMLElement>(".sigess-pbr-address-text");
      if (textEl && textEl.textContent !== addressText) {
        textEl.textContent = addressText;
        textEl.setAttribute("title", addressText);
      }
      return;
    }

    const anchor = document.querySelector("input[name='bairro']")?.closest<HTMLElement>(".row")
      || document.querySelector("input[name='complemento']")?.closest<HTMLElement>(".row")
      || document.querySelector("input[name='endereco']")?.closest<HTMLElement>(".row")
      || document.querySelector<HTMLElement>(".form-footer")
      || document.querySelector<HTMLElement>(".buttons-container")?.parentElement;

    if (!anchor) {
      window.setTimeout(() => {
        if (pageKind() === "personal" && !document.getElementById(ADDRESS_BANNER_ID)) {
          this.renderWebAddressBanner();
        }
      }, 500);
      return;
    }

    banner = document.createElement("div");
    banner.id = ADDRESS_BANNER_ID;
    banner.innerHTML = `
      <span class="sigess-pbr-address-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </span>
      <strong class="sigess-pbr-address-title">Endereço no SIGESS:</strong>
      <span class="sigess-pbr-address-text" title="${escapeHtml(addressText)}">${escapeHtml(addressText)}</span>
      <button class="sigess-pbr-address-copy" type="button" title="Copiar endereço completo">Copiar</button>
    `;

    const copyBtn = banner.querySelector<HTMLButtonElement>(".sigess-pbr-address-copy");
    copyBtn?.addEventListener("click", () => {
      void (async () => {
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(addressText);
          } else {
            const input = document.createElement("input");
            input.value = addressText;
            document.body.appendChild(input);
            input.select();
            document.execCommand("copy");
            input.remove();
          }
          copyBtn.textContent = "Copiado!";
          window.setTimeout(() => {
            copyBtn.textContent = "Copiar";
          }, 2000);
        } catch {
          copyBtn.textContent = "Erro ao copiar";
        }
      })();
    });

    if (anchor.classList.contains("form-footer")) {
      anchor.insertAdjacentElement("beforebegin", banner);
    } else {
      anchor.insertAdjacentElement("afterend", banner);
    }
  }

  private removeWebAddressBanner(): void {
    document.getElementById(ADDRESS_BANNER_ID)?.remove();
  }

  private toggleSettings(): void {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.remove();
      return;
    }
    void this.refreshState().then(() => this.renderSettings());
  }

  private renderSettings(): void {
    document.getElementById(PANEL_ID)?.remove();
    const config = this.config;
    if (!config) return;
    const configuredUf = normalizeUfCode(config.areaPesca.uf);
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <p>Configurações globais</p>
      <div class="sigess-pbr-field full"><label>Grupo alvo de pesca</label><div class="sigess-pbr-checks">${GROUP_OPTIONS.map((option) => `<label class="sigess-pbr-check"><input type="checkbox" data-pbr-group value="${escapeHtml(option)}" ${config.gruposAlvo.includes(option) ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}</div></div>
      <div class="sigess-pbr-field full"><label>Ambiente de pesca</label><div class="sigess-pbr-checks">${ENVIRONMENT_OPTIONS.map((option) => `<label class="sigess-pbr-check"><input type="checkbox" data-pbr-environment value="${escapeHtml(option)}" ${config.ambientesPesca.includes(option) ? "checked" : ""}>${escapeHtml(option)}</label>`).join("")}</div></div>
      <div class="sigess-pbr-grid">
        <div class="sigess-pbr-field"><label>Local da pesca</label><select data-pbr-field="localPesca"><option value="">Selecione o local</option>${FISHING_LOCATION_OPTIONS.map((option) => `<option value="${escapeHtml(option.label)}" ${normalizeText(config.areaPesca.localPesca) === normalizeText(option.label) ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></div>
        <div class="sigess-pbr-field"><label>UF</label><select data-pbr-field="uf"><option value="">Selecione a UF</option>${UF_OPTIONS.map((uf) => `<option value="${uf}" ${configuredUf === uf ? "selected" : ""}>${uf} - ${escapeHtml(UF_LABELS[uf] || uf)}</option>`).join("")}</select></div>
        <div class="sigess-pbr-field"><label>Município</label><select data-pbr-field="municipio">${renderMunicipalityOptions(configuredUf, config.areaPesca.municipio)}</select></div>
        <div class="sigess-pbr-field"><label>Nome do local</label><input data-pbr-field="nomeLocal" value="${escapeHtml(config.areaPesca.nomeLocal || "")}"></div>
        <div class="sigess-pbr-field"><label>Categoria</label><select data-pbr-field="categoria"><option value="">Selecione a categoria</option>${CATEGORY_OPTIONS.map((option) => `<option value="${option}" ${normalizeText(config.categoria) === normalizeText(option) ? "selected" : ""}>${option}</option>`).join("")}</select></div>
        <div class="sigess-pbr-field"><label>Forma de atuação</label><select data-pbr-field="formaAtuacao"><option value="">Selecione</option><option value="DESEMBARCADO" ${config.formaAtuacao === "DESEMBARCADO" ? "selected" : ""}>Desembarcado</option><option value="EMBARCADO" ${config.formaAtuacao === "EMBARCADO" ? "selected" : ""}>Embarcado</option></select></div>
        <div class="sigess-pbr-field"><label>CNPJ da entidade</label><input data-pbr-field="cnpj" value="${escapeHtml(config.filiacao.cnpj)}"></div>
        <div class="sigess-pbr-field"><label>E-mail da entidade</label><input type="email" data-pbr-field="email" value="${escapeHtml(config.filiacao.email)}"></div>
      </div>
      <div class="sigess-pbr-actions"><button type="button" data-pbr-cancel>Fechar</button><button type="button" class="primary" data-pbr-save>Salvar configuração</button></div>
    `;
    document.body.appendChild(panel);
    const ufSelect = panel.querySelector<HTMLSelectElement>('[data-pbr-field="uf"]');
    const municipalitySelect = panel.querySelector<HTMLSelectElement>('[data-pbr-field="municipio"]');
    ufSelect?.addEventListener("change", () => {
      if (!municipalitySelect) return;
      municipalitySelect.innerHTML = renderMunicipalityOptions(ufSelect.value, "");
    });
    panel.querySelector<HTMLButtonElement>("[data-pbr-cancel]")?.addEventListener("click", () => panel.remove());
    panel.querySelector<HTMLButtonElement>("[data-pbr-save]")?.addEventListener("click", () => void this.saveSettings(panel));
  }

  private async saveSettings(panel: HTMLElement): Promise<void> {
    const field = (name: string) => panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-pbr-field="${name}"]`)?.value.trim() || "";
    const config: Partial<PesqBrasilCadastroConfig> = {
      gruposAlvo: Array.from(panel.querySelectorAll<HTMLInputElement>("[data-pbr-group]:checked")).map((input) => input.value),
      ambientesPesca: Array.from(panel.querySelectorAll<HTMLInputElement>("[data-pbr-environment]:checked")).map((input) => input.value),
      areaPesca: {
        localPesca: field("localPesca"),
        uf: field("uf"),
        municipio: field("municipio"),
        nomeLocal: field("nomeLocal"),
      },
      categoria: field("categoria"),
      formaAtuacao: field("formaAtuacao") as PesqBrasilCadastroConfig["formaAtuacao"],
      filiacao: { cnpj: field("cnpj"), email: field("email") },
      nacionalidade: "Brasileira",
    };
    const response = await browserApi().runtime.sendMessage({ action: "savePesqBrasilCadastroConfig", config }).catch(() => null);
    if (!response?.success) {
      this.showStatus("Não foi possível salvar a configuração.", [], true);
      return;
    }
    this.config = response.data;
    panel.remove();
    this.showStatus("Configuração PesqBrasil salva.", [], false, true);
  }

  private async fillCurrentPage(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const pill = document.getElementById(PILL_ID);
    pill?.setAttribute("data-busy", "true");
    try {
      await this.refreshState();
      const kind = pageKind();
      if (!kind) return;
      if (kind === "socioeconomic") {
        this.showStatus("Esta etapa é manual.", ["Preencha a composição familiar e as respostas socioeconômicas diretamente no PesqBrasil."], false);
        return;
      }
      if (!this.context?.payload?.member) {
        this.showStatus("Dados individuais não recebidos do SIGESS.", ["Abra o PesqBrasil pelo portal externo do SIGESS e tente novamente."], true);
        return;
      }
      if (kind === "personal") {
        this.renderWebAddressBanner();
        await this.fillPersonal(this.context.payload.member);
      } else {
        await this.fillActivity();
      }
      this.showStatus("Campos preenchidos. Revise antes de salvar.", [], false, true);
    } finally {
      this.busy = false;
      pill?.removeAttribute("data-busy");
    }
  }

  private async fillPersonal(member: PesqBrasilCadastroMemberData): Promise<string[]> {
    const config = this.config!;
    clickLabel("Registro inicial");
    await fillLabeledInput("Apelido", member.apelido, ["input[name='apelido']"]);
    await fillLabeledInput("Nome do pai", member.pai, ["input[name='nomePai']"]);
    await selectLabeledOption("Você se considera", toBooleanLabel(member.alfabetizado));
    await selectLabeledOption("Escolaridade", mapEscolaridadeForPesqBrasil(member.escolaridade));
    await selectLabeledOption("Nacionalidade", config.nacionalidade);
    await fillLabeledInput("RG/CNH/Passaporte", member.rg, [
      "input[name='numeroDocumento']",
      "input[placeholder*='documento' i]",
      "input[placeholder*='RG' i]",
    ]);
    await fillLabeledInput("Data de emissão", formatDateForPortal(member.dataExpedicaoRg), [
      "input[placeholder='00/00/0000']",
      "input[name='dataEmissao']",
      "input[id*='datetimepicker']",
    ]);
    await selectLabeledOption("UF de emissão", portalUfLabel(member.ufRg || ""));
    await selectLabeledOption("PIS/PASEP/NIT/NIS", member.nit ? "NIT" : "");
    await fillLabeledInput("Nº do documento (PIS/PASEP/NIT/NIS)", member.nit, [
      "input[name='numeroCtps']",
      "input[placeholder*='Insira o nº do documento' i]",
    ]);
    await fillLabeledInput("E-mail do(a) solicitante", config.filiacao.email, [
      "input[name='email']",
      "input[placeholder*='exemplo@' i]",
    ]);
    await fillLabeledInput("Telefone para contato", member.telefone, [
      "input[name='telefone']",
      "input[placeholder*='xxxxx-xxxx' i]",
    ]);
    await fillLabeledInput("Número", member.numero, [
      "input[name='numero']",
      "input[placeholder*='Insira o número' i]",
    ]);
    await fillLabeledInput("Complemento", member.complemento, [
      "input[name='complemento']",
      "input[placeholder*='Complemento' i]",
    ]);
    return [];
  }

  private async fillMunicipalityField(munContainer: HTMLElement, input: HTMLInputElement, cityName: string): Promise<boolean> {
    if (!input || !cityName) return false;

    // Se já estiver com o valor selecionado, retorna sucesso
    if (input.getAttribute("data-displayvalue") && normalizeText(input.getAttribute("data-displayvalue")) === normalizeText(cityName)) {
      return true;
    }

    input.focus();
    setInputValue(input, "");
    await sleep(150);

    // Digitar no input para acionar o filtro dinâmico
    setInputValue(input, cityName);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const parent = input.closest<HTMLElement>(".br-select") || munContainer;
    const listboxId = parent.getAttribute("aria-controls") || "select_____rp8_____listbox";
    const getListbox = () => {
      if (listboxId) {
        const el = document.getElementById(listboxId);
        if (el) return el;
      }
      return parent.querySelector<HTMLElement>(".br-list, [role='listbox']")
        || (parent.nextElementSibling?.classList.contains("br-list") ? (parent.nextElementSibling as HTMLElement) : null)
        || Array.from(document.querySelectorAll<HTMLElement>(".br-list, [role='listbox']")).find((l) => l.offsetHeight > 0)
        || null;
    };

    const expected = normalizeText(cityName);
    const findItem = () => {
      const listbox = getListbox();
      if (!listbox) return null;
      const items = Array.from(listbox.querySelectorAll<HTMLElement>(".br-item, [role='option'], .br-radio, label"));
      return items.find((el) => {
        const text = normalizeText(el.textContent);
        return text === expected || text.includes(expected);
      }) || null;
    };

    let item = (await waitFor(() => findItem() !== null, 1500)) ? findItem() : null;

    if (!item) {
      const btn = parent.querySelector<HTMLButtonElement>("button");
      btn?.click();
      await waitFor(() => findItem() !== null, 1500);
      item = findItem();
    }

    if (item) {
      item.scrollIntoView({ block: "nearest" });
      const radio = item.querySelector<HTMLInputElement>("input[type='radio']")
        || (item instanceof HTMLInputElement && item.type === "radio" ? item : null);
      const label = item.querySelector<HTMLLabelElement>("label")
        || (item instanceof HTMLLabelElement ? item : null);

      if (radio) {
        radio.click();
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (label) {
        label.click();
      }
      if (!radio && !label) {
        item.click();
      }
      await sleep(300);
      input.blur();
      return true;
    }

    return false;
  }

  private async fillActivity(): Promise<string[]> {
    const config = this.config!;
    for (const group of config.gruposAlvo) clickLabel(group);
    for (const environment of config.ambientesPesca) clickLabel(environment);
    await this.fillArea(config);
    await selectLabeledOption("Categoria", config.categoria);
    if (config.formaAtuacao) clickLabel(config.formaAtuacao === "EMBARCADO" ? "Embarcado" : "Desembarcado");
    const affiliated = Boolean(config.filiacao.cnpj.trim() && config.filiacao.email.trim());
    clickLabel(affiliated ? "Sim" : "Não");
    if (affiliated) {
      const cnpjFilled = await fillLabeledInput("CNPJ da entidade", config.filiacao.cnpj, [
        "input[name='cnpj']",
        "input[name*='cnpj' i]",
      ]);
      const cnpjInput = document.querySelector<HTMLInputElement>("input[name*='cnpj' i], input[placeholder*='cnpj' i]")
        || findFieldContainer("CNPJ da entidade")?.querySelector<HTMLInputElement>("input");
      const searchButton = cnpjInput?.parentElement?.querySelector<HTMLButtonElement>("button")
        || cnpjInput?.closest(".br-input, .input-group, .form-group, .row")?.querySelector<HTMLButtonElement>("button")
        || findFieldContainer("CNPJ da entidade")?.querySelector<HTMLButtonElement>("button");

      await sleep(300);
      if (cnpjFilled && searchButton) {
        searchButton.click();
      } else if (cnpjFilled && cnpjInput) {
        cnpjInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      }
      await sleep(500);
      await fillLabeledInput("E-mail da entidade representativa", config.filiacao.email, [
        "input[name='emailEntidade']",
        "input[name*='email' i]",
      ]);
      await waitFor(() => Boolean(readFieldValue("Nome da entidade representativa")), 5000);
    }
    return [];
  }

  private async fillArea(config: PesqBrasilCadastroConfig): Promise<void> {
    const area = config.areaPesca;
    if (!area.localPesca && !area.uf && !area.municipio && !area.nomeLocal) return;

    let municipality = document.querySelector<HTMLInputElement>("input[placeholder*='município' i]");
    if (!municipality) {
      const add = Array.from(document.querySelectorAll<HTMLElement>("button, a")).find((element) => normalizeText(element.textContent).includes("ADICIONAR AREA"));
      add?.click();
      await waitFor(() => Boolean(document.querySelector("input[placeholder*='município' i]")), 2500);
      municipality = document.querySelector<HTMLInputElement>("input[placeholder*='município' i]");
    }
    const row = municipality?.closest<HTMLElement>("tr, [role=row], .row") || municipality?.parentElement?.parentElement || null;
    if (!row) return;

    const selects = Array.from(row.querySelectorAll<HTMLElement>(".br-select, [role=combobox]"));
    if (selects[0]) await selectContainerOption(selects[0], area.localPesca);

    if (selects[1]) {
      await selectContainerOption(selects[1], portalUfLabel(area.uf));
      // Aguardar o carregamento dinâmico dos municípios após selecionar o estado (UF)
      await sleep(1000);
    }

    if (area.municipio) {
      let attempts = 0;
      let filled = false;
      while (attempts < 8 && !filled) {
        const freshInput = document.querySelector<HTMLInputElement>(
          "input[placeholder*='município' i], input[placeholder*='municipio' i]",
        );
        if (freshInput) {
          const munContainer = freshInput.closest<HTMLElement>(".br-select, .br-input, td") || freshInput.parentElement!;
          filled = await this.fillMunicipalityField(munContainer, freshInput, area.municipio);
        }
        if (filled) break;
        await sleep(600);
        attempts++;
      }
    }

    const freshRow = document.querySelector("input[placeholder*='município' i]")?.closest<HTMLElement>("tr, [role=row], .row") || row;
    const localName = freshRow.querySelector<HTMLInputElement>(
      "td:nth-child(4) input, input[placeholder*='Informe o local' i], input[placeholder*='local' i]",
    );
    if (localName && area.nomeLocal) {
      setInputValue(localName, area.nomeLocal);
    }
  }

  private showStatus(title: string, missing: string[], error = false, success = false): void {
    document.getElementById(STATUS_ID)?.remove();
    const status = document.createElement("div");
    status.id = STATUS_ID;
    status.className = error ? "error" : success ? "success" : "";
    status.innerHTML = `<strong>${escapeHtml(title)}</strong>${missing.length ? `<ul>${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}`;
    document.body.appendChild(status);
    window.setTimeout(() => status.remove(), error ? 9000 : 4500);
  }
}
