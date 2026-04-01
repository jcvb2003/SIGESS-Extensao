import { parsePesqBrasilRSC } from "../modules/automation/pesqbrasil/extractor";
import { parseCaepfData } from "../modules/automation/caepf/extractor";
import { scrapeEcacCpfData, scrapeEcacCaepfTable } from "../modules/automation/ecac/extractor";
import { parseCadUnicoToken } from "../modules/automation/cadunico/extractor";
import { parseTseData } from "../modules/automation/tse/extractor";
import { PessoaData } from "../shared/types";


function dispatchDebugLog(msg: string, type: "info" | "success" | "warn" | "error" = "info") {
  globalThis.dispatchEvent(new CustomEvent("SIGESS_DEBUG_LOG", {
    detail: { msg, type }
  }));
}

console.log("SIGESS: Auto Registration Content Script loaded");

// O carregamento é assíncrono para verificar se a função está ativa
async function startAutomation() {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};

  if (settings.autoRegistrationEnabled === false) {
    console.log("SIGESS: Captura Automática DESATIVADA nas configurações.");
    return;
  }

  dispatchDebugLog("Script de automação carregado.");

  // Registrar listeners de mensagens e injetar bridges
  globalThis.addEventListener("message", handleBridgeMessages);
  injectBridges();

  // Scrapers de DOM para e-CAC (id=15 e id=89)
  const url = globalThis.location.href;
  if (url.includes('id=15') || url.includes('ConsultarCPF')) {
    const data = scrapeEcacCpfData();
    if (data) saveData(data, "ecac_cpf");
  } else if (url.includes('id=89')) {
    const data = scrapeEcacCaepfTable();
    if (data) saveData(data, "ecac_caepf");
  }

  // Iniciar monitoramento de navegação SPA para o Assistente
  setupSPANavigationObserver();
}

function handleBridgeMessages(event: MessageEvent) {
  // Segurança: verifica se a mensagem vem do mesmo origin (bridge script)
  // No Firefox/Content Scripts, o check de event.source !== window pode falhar entre mundos
  if (event.origin !== globalThis.location.origin) return;

  const { type, payload } = event.data || {};
  if (type?.startsWith("SIGESS_")) {
    processIncomingData(type, payload);
  }
}

function processIncomingData(type: string, payload: any) {
  console.log(`SIGESS: Mensagem recebida da página -> ${type}`);
  if (type === "SIGESS_PESQBRASIL_RAW_DATA") {
    const extractedData = parsePesqBrasilRSC(payload);
    if (extractedData) saveData(extractedData, "pesqbrasil");
  } else if (type === "SIGESS_CAEPF_RAW_DATA") {
    const extractedData = parseCaepfData(payload);
    if (extractedData) saveData(extractedData, "caepf");
  } else if (type === "SIGESS_CADUNICO_RAW_TOKEN") {
    const extractedData = parseCadUnicoToken(payload);
    if (extractedData) saveData(extractedData, "cadunico");
  } else if (type === "SIGESS_CADUNICO_ADV_TOKENS") {
    fetchCadUnicoAdvanced(payload);
  } else if (type === "SIGESS_TSE_RAW_DATA") {
    const extractedData = parseTseData(payload);
    if (extractedData) saveData(extractedData, "tse");
  }
}

function injectScript(assetPath: string) {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(assetPath);
    (document.head || document.documentElement).appendChild(script);
    console.log(`SIGESS: Bridge script injected -> ${assetPath}`);
  } catch (e) {
    console.error(`SIGESS: Erro ao injetar bridge ${assetPath}`, e);
  }
}

function injectBridges() {
  const host = globalThis.location.hostname;
  if (host.includes("pesqbrasil-pescadorprofissional")) {
    injectScript("assets/pesqbrasil_bridge.js");
  } else if (
    host.includes("caepf.receita.fazenda.gov.br") ||
    host.includes("cav.receita.fazenda.gov.br")
  ) {
    injectScript("assets/caepf_bridge.js");
  } else if (host.includes("cadunico.dataprev.gov.br")) {
    injectScript("assets/cadunico_bridge.js");
  } else if (host.includes("tse.jus.br")) {
    injectScript("assets/tse_bridge.js");
  }
}

// Escuta mensagens do Bridge (que roda no mundo MAIN)
// Listener movido para handleBridgeMessages controlado pelo init

// ==========================================
// CadÚnico — Extração Avançada via API
// Mapeamento completo baseado no HAR real:
//   /v1/pessoa/{pessoaId}/informacoes-detalhadas
//   /v1/familia/{familiaId}/membros
// ==========================================

async function fetchCadUnicoAdvanced(payload: { cpf: string, bearer: string, xsrf: string, cnas: string }) {
  const { cpf, bearer, xsrf, cnas } = payload;
  console.log("SIGESS: Iniciando extração avançada CadÚnico para CPF: " + cpf);
  dispatchDebugLog("Iniciando extração profunda no CadÚnico...", "info");

  const headers = {
    'Authorization': bearer,
    'X-XSRF-TOKEN': xsrf,
    'CnasVersao': cnas || '1.36.02',
    'Accept': 'application/json',
    'Referer': 'https://cadunico.dataprev.gov.br/'
  };

  try {
    const perfil = await fetchCadUnicoPerfil(cpf, headers);
    if (!perfil) {
      console.warn("SIGESS: Perfil não encontrado para CPF " + cpf);
      return;
    }
    console.log("SIGESS: Perfil Bruto", perfil);

    const [details, family, address] = await Promise.all([
      fetchCadUnicoDetails(perfil.identificador, cpf, headers),
      fetchCadUnicoFamily(perfil.numeroFamiliar, headers),
      fetchCadUnicoAddress(perfil.numeroFamiliar, headers)
    ]);

    const fullData: Partial<PessoaData> = {
      ...details,
      ...family,
      ...address
    };

    saveData(fullData, "cadunico_adv");
    dispatchDebugLog(`CadÚnico: ${Object.keys(fullData).filter(k => (fullData as any)[k]).length} campos capturados no total!`, "success");
  } catch (e) {
    console.error("SIGESS: Falha na extração avançada CadÚnico", e);
    dispatchDebugLog("Erro na extração avançada. Verifique o console.", "error");
  }
}

async function fetchCadUnicoPerfil(cpf: string, headers: any) {
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${cpf}/tipos-perfil`,
    { headers }
  );
  if (!res.ok) throw new Error(`Erro Perfil (HTTP ${res.status}): ${res.url}`);

  const text = await res.text();
  if (!text) return null;

  try {
    const data = JSON.parse(text);
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error("SIGESS: Erro ao parsear Perfil", e);
    return null;
  }
}

async function fetchCadUnicoDetails(pessoaId: number, cpf: string, headers: any): Promise<Partial<PessoaData>> {
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${pessoaId}/informacoes-detalhadas`,
    { headers }
  );
  if (!res.ok) return {};

  const text = await res.text();
  if (!text) return {};

  let detalhes;
  try {
    detalhes = JSON.parse(text);
  } catch (e) {
    console.error("SIGESS: Erro ao parsear Detalhes Detalhados", e);
    return {};
  }

  const c = detalhes.pessoaDadosCadastroDTO || {};
  const esc = detalhes.pessoaEscolaridadeDTO || {};

  const rgRaw = String(c.numeroIdentidade || '');
  const rgClean = rgRaw.replace(/^0+/, '') || undefined;

  let sexo: "MASCULINO" | "FEMININO" | undefined;
  if (c.tipoSexoPessoa?.codigo === 1) sexo = 'MASCULINO';
  else if (c.tipoSexoPessoa?.codigo === 2) sexo = 'FEMININO';

  const detailsData: Partial<PessoaData> = {
    nome: c.nomePessoa,
    cpf: c.numeroCpfPessoa ? String(c.numeroCpfPessoa) : cpf,
    nit: c.numeroNisPisPasepPessoa ? String(c.numeroNisPisPasepPessoa) : undefined,
    dataDeNascimento: c.dataNascimentoPessoa?.split('T')[0],
    sexo,
    mae: c.filiacao1 || c.nomeMaePessoa,
    pai: c.filiacao2 || c.nomePaiPessoa,
    naturalidade: c.nomeIbgeMunicipioNascimento || c.nomeMunicipioNascimentoPessoa,
    ufNaturalidade: c.siglaUFNascimento || c.siglaUfNascimentoPessoa,
    nacionalidade: c.nomePaisOrigem === 'BRASIL' ? 'BRASILEIRO(A)' : (c.nomePaisOrigem || c.tipoNacionalidadePessoa?.descricao),
    estadoCivil: mapCadUnicoEstadoCivil(c.tipoEstadoCivil?.codigo || c.tipoEstadoCivilPessoa?.codigo),
    rg: rgClean,
    dataExpedicaoRg: c.dataEmissaoIdentidade?.split('T')[0],
    ufRg: c.siglaUfIdentidade,
    orgaoEmissorRg: c.siglaOrgaoEmissor,
    tituloEleitor: c.numeroTituloEleitorPessoa ? String(c.numeroTituloEleitorPessoa) : undefined,
    zonaEleitoral: c.numeroZonaTituloEleitorPessoa?.toString().padStart(3, '0'),
    secaoEleitoral: c.numeroSecaoTituloEleitorPessoa?.toString().padStart(4, '0'),
    ctps: c.numeroCtps ? `${c.numeroCtps}/${c.numeroSerieCtps || ''}`.replace(/\/$/, '') : undefined,
    ctpsUf: c.ufEmissoraCtps,
    alfabetizado: mapAlfabetizado(esc.sabeLerEEscrever?.codigo),
    escolaridade: mapCadUnicoEscolaridade(
      esc.cursoMaisElevadoQueFrequentou?.codigo,
      esc.concluiuOCursoQueFrequentou?.codigo,
      esc.sabeLerEEscrever?.codigo
    ),
  };

  return detailsData;
}

function mapAlfabetizado(codigo: number | undefined): "SIM" | "NÃO" | undefined {
  if (codigo === 1) return "SIM";
  if (codigo === 2) return "NÃO";
  return undefined;
}

function mapCadUnicoEstadoCivil(codigo: number | undefined): string | undefined {
  const map: Record<number, string> = {
    1: "SOLTEIRO(A)",
    2: "CASADO(A)",
    3: "DIVORCIADO(A)",
    4: "VIÚVO(A)",
    5: "UNIÃO ESTÁVEL"
  };
  return (codigo && map[codigo]) ? map[codigo] : undefined;
}

async function fetchCadUnicoFamily(familiaId: number, headers: any): Promise<Partial<PessoaData>> {
  if (!familiaId) return {};
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/familia/${familiaId}/membros`,
    { headers }
  );
  if (!res.ok) return {};

  const text = await res.text();
  if (!text) return {};

  let membros;
  try {
    membros = JSON.parse(text);
  } catch (e) {
    console.error("SIGESS: Erro ao parsear Membros", e);
    return {};
  }
  const municipio = membros?.familiaCadastroDTO?.municipioCadastro;
  const uf = membros?.familiaCadastroDTO?.ufCadastro;

  if (municipio && uf) {
    return { cidade: municipio, uf: uf };
  }
  return {};
}

async function fetchCadUnicoAddress(familiaId: number, headers: any): Promise<Partial<PessoaData>> {
  if (!familiaId) return {};
  const res = await fetch(
    `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/familia/${familiaId}/endereco`,
    { headers }
  );
  if (!res.ok) return {};

  const text = await res.text();
  if (!text) return {};

  let e;
  try {
    e = JSON.parse(text);
    console.log("SIGESS: Endereço Bruto", e);
  } catch (err) {
    console.error("SIGESS: Erro ao parsear Endereço", err);
    return {};
  }

  return {
    endereco: `${e.nomeTipologradouro || e.tipoLogradouro || ''} ${e.nomeLogradouro || e.logradouro || ''}`.trim(),
    numero: e.complementoNumero || e.numero || 'SN',
    cep: e.cepLogradouro || e.cep || undefined,
    cidade: e.municipio || e.nomeMunicipio,
    uf: e.uf || e.siglaUf,
    bairro: e.localidade || e.nomeBairro
  };
}


/**
 * Mapeamento de escolaridade do CadÚnico → valores do SIGESS.
 *
 * cursoMaisElevadoQueFrequentou.codigo:
 *   3  = Classe de Alfabetização
 *   4  = EF 1ª a 4ª séries (Primário / 1ª fase do 1º grau)
 *   5  = EF 5ª a 8ª séries (Ginasial / 2ª fase do 1º grau)
 *   6  = Ensino Médio (2º grau)
 *   7  = Ensino Superior
 *   8  = Especialização / Mestrado / Doutorado
 *   9  = Alfabetização para Adultos (Mobral)
 *  10  = Nenhum
 *
 * concluiuOCursoQueFrequentou.codigo: 1 = Sim, 2 = Não
 */
function mapCadUnicoEscolaridade(
  cursoCodigo: number | undefined,
  concluiuCodigo: number | undefined,
  sabeLerCodigo: number | undefined
): string | undefined {
  const concluiu = concluiuCodigo === 1;

  switch (cursoCodigo) {
    case 3:  // Classe de Alfabetização
    case 9:  // Mobral / Alfabetização Adultos
      return "LÊ E ESCREVE";

    case 4:  // Primário (EF 1ª a 4ª)
      // Primário completo ainda é EF incompleto no sistema de 9 anos
      return "ENSINO FUNDAMENTAL INCOMPLETO";

    case 5:  // Ginasial (EF 5ª a 8ª)
      return concluiu ? "ENSINO FUNDAMENTAL COMPLETO" : "ENSINO FUNDAMENTAL INCOMPLETO";

    case 6:  // Ensino Médio
      return concluiu ? "ENSINO MÉDIO COMPLETO" : "ENSINO MÉDIO INCOMPLETO";

    case 7:  // Superior
      return concluiu ? "ENSINO SUPERIOR COMPLETO" : "ENSINO SUPERIOR INCOMPLETO";

    case 8:  // Pós-graduação / Mestrado / Doutorado
      return "ENSINO SUPERIOR COMPLETO";

    case 10: // Nenhum
      return sabeLerCodigo === 1 ? "LÊ E ESCREVE" : "ANALFABETO";

    default:
      return undefined;
  }
}

function saveData(data: any, fonte: string) {
  console.log(`SIGESS: Dados extraídos de ${fonte}`, data);
  chrome.runtime.sendMessage({
    action: "SAVE_PESSOA_DATA",
    data: data,
    fonte: fonte
  }, () => {
    globalThis.dispatchEvent(new CustomEvent('SIGESS_DATA_UPDATED'));
  });
}

// ==========================================
// Lógica de Preenchimento (SIGESS Assistant)
// ==========================================

function setReactInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
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

/**
 * Preenche um Select Radix UI / shadcn buscando o trigger pelo texto do label
 * e clicando na opção correspondente ao valor desejado.
 */
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

  if (!trigger) {
    console.warn(`SIGESS: Trigger Radix não encontrado para label "${labelText}"`);
    return false;
  }

  (trigger as HTMLElement).click();
  await sleep(150);

  const options = Array.from(document.querySelectorAll('[role="option"]'));
  const valueNorm = value.trim().toUpperCase();

  const match = options.find(o => o.textContent?.trim().toUpperCase() === valueNorm)
    || options.find(o => o.textContent?.trim().toUpperCase().includes(valueNorm))
    || options.find(o => valueNorm.includes(o.textContent?.trim().toUpperCase() || '___'));

  if (match) {
    (match as HTMLElement).click();
    console.log(`SIGESS: Selecionado "${match.textContent?.trim()}" para "${labelText}"`);
    return true;
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  console.warn(`SIGESS: Opção "${value}" não encontrada para "${labelText}"`);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fillSIGESSForm() {
  console.log("SIGESS: Iniciando preenchimento automático...");

  const data = await getCollectedData();
  if (!data) return;

  let count = 0;
  count += fillStandardInputs(data);
  count += fillStandardRadios(data);
  count += await fillCustomSelects(data);

  dispatchDebugLog(`Formulário Assistido: ${count} campos preenchidos.`, "success");
}

async function getCollectedData(): Promise<PessoaData | null> {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  const data = settings.pessoaData as PessoaData;
  // Agora basta ter nome e CPF de qualquer fonte
  return (data?.nome && data?.cpf) ? data : null;
}

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

function fillStandardRadios(data: PessoaData): number {
  let count = 0;
  const radios = [
    { name: 'sexo', value: data.sexo },
    { name: 'alfabetizado', value: data.alfabetizado }
  ];

  for (const r of radios) {
    if (r.value) {
      // Tenta seletor de input padrão OU seletor de botão Shadcn/Radix
      const selector = `input[name="${r.name}"][value="${r.value}"], button[role="radio"][value="${r.value}"]`;
      const el = document.querySelector(selector) as HTMLElement | null;

      if (el) {
        el.focus();
        el.click();

        // Dispara eventos para o React perceber a mudança
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        count++;
      }
    }
  }
  return count;
}

async function fillCustomSelects(data: PessoaData): Promise<number> {
  let count = 0;
  const selectFields: Array<[string, string | undefined]> = [
    ['Escolaridade', data.escolaridade],
    ['Estado Civil', data.estadoCivil],
    ['UF Naturalidade', data.ufNaturalidade],
    ['UF do RG', data.ufRg],
    ['UF do RGP', data.ufRgp],
    ['Data do RGP', data.dataPrimeiroRegistro],
    ['Tipo', data.tipoRgp],
  ];

  for (const [labelText, value] of selectFields) {
    if (value) {
      const ok = await fillRadixSelect(labelText, value);
      if (ok) count++;
    }
  }
  return count;
}

function injectAssistantUI() {
  const ID_ASSISTANT = 'sigess-assistant-root';
  if (document.getElementById(ID_ASSISTANT)) return;

  const root = document.createElement('div');
  root.id = ID_ASSISTANT;
  root.style.cssText = `
    position: fixed;
    bottom: 15px;
    right: 15px;
    z-index: 2147483647;
    padding: 2px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    min-width: 220px;
    transition: all 0.3s ease;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  header.innerHTML = `
    <div style="width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; box-shadow: 0 0 6px #38bdf8;"></div>
    <span style="font-size: 11px; font-weight: 700; color: #f8fafc; letter-spacing: 0.5px;">ASSISTENTE SIGESS</span>
  `;
  root.appendChild(header);

  const body = document.createElement('div');
  body.style.padding = '12px';

  const statusLine = document.createElement('div');
  statusLine.id = 'sigess-assistant-status';
  statusLine.style.cssText = `font-size: 10px; color: #94a3b8; margin-bottom: 10px;`;
  statusLine.innerText = 'Aguardando dados...';
  body.appendChild(statusLine);

  const button = document.createElement('button');
  button.id = 'sigess-assistant-btn';
  button.innerText = 'Preencher Formulário';
  button.disabled = true;
  button.style.cssText = `
    width: 100%;
    padding: 8px;
    background: #38bdf8;
    color: #0f172a;
    border: none;
    border-radius: 6px;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
    opacity: 0.5;
  `;

  button.onmousedown = () => button.style.transform = 'scale(0.98)';
  button.onmouseup = () => button.style.transform = 'scale(1)';
  button.onclick = fillSIGESSForm;

  body.appendChild(button);
  root.appendChild(body);
  document.body.appendChild(root);

  updateAssistantStatus();
}

async function updateAssistantStatus() {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  const data = settings.pessoaData as PessoaData;

  const root = document.getElementById('sigess-assistant-root');
  const btn = document.getElementById('sigess-assistant-btn') as HTMLButtonElement;
  const status = document.getElementById('sigess-assistant-status');

  // Visibilidade controlada pela funcionalidade estar ativa
  if (settings.autoRegistrationEnabled === false) {
    if (root) root.style.display = 'none';
    return;
  }

  if (root) root.style.display = 'flex';

  if (btn && status) {
    if (data?.nome && data?.cpf) {
      status.innerText = `Pronto: ${data.nome.split(' ')[0]}`;
      status.style.color = '#10b981';
      btn.disabled = false;
      btn.style.opacity = '1';
    } else {
      status.innerText = 'Aguardando dados...';
      status.style.color = '#94a3b8';
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
  }
}

// Escuta mudanças nas configurações ou nos dados
chrome.storage.onChanged.addListener((changes) => {
  if (changes.sigessSettings) {
    updateAssistantStatus();
  }
});

globalThis.addEventListener('SIGESS_DATA_UPDATED', updateAssistantStatus);

function isSIGESSFormPage(): boolean {
  const host = globalThis.location.hostname;
  const path = globalThis.location.pathname;

  const isSigessDomain = host.includes("sigess") || host.includes("vercel.app");
  const isFormRoute = path.includes("/registration");

  return isSigessDomain && isFormRoute;
}

function removeAssistantUI() {
  const existing = document.getElementById('sigess-assistant-root');
  if (existing) {
    existing.remove();
  }
}

function handleSPANavigation() {
  if (isSIGESSFormPage()) {
    if (document.body) injectAssistantUI();
  } else {
    removeAssistantUI();
  }
}

function setupSPANavigationObserver() {
  // Monitora mudanças na URL via eventos de navegação
  globalThis.addEventListener('popstate', handleSPANavigation);

  // Monitora mudanças no DOM que podem indicar navegação interna (Next.js)
  const observer = new MutationObserver(() => {
    handleSPANavigation();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Executa verificação inicial
  handleSPANavigation();
}

startAutomation();
