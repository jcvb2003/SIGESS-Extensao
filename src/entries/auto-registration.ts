import { parsePesqBrasilRSC } from "../modules/automation/pesqbrasil/extractor";
import { parseCaepfData } from "../modules/automation/caepf/extractor";
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
async function initAutoRegistration() {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  
  if (settings.autoRegistrationEnabled === false) {
    console.log("SIGESS: Captura Automática DESATIVADA nas configurações.");
    return;
  }

  dispatchDebugLog("Script de automação carregado.");
  
  // Registrar listeners de mensagens apenas se estiver ativo
  globalThis.addEventListener("message", handleBridgeMessages);
  
  // Injetar bridges
  injectBridges();
  
  // Iniciar assistente de preenchimento se necessário
  initAssistantIfNeeded();
}

function handleBridgeMessages(event: MessageEvent) {
  const { type, payload } = event.data || {};
  if (type && type.startsWith("SIGESS_")) {
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
  } else if (host.includes("caepf.receita.fazenda.gov.br")) {
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
    // PASSO 1: Obter pessoaId e familiaId a partir do CPF
    const perfilRes = await fetch(
      `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${cpf}/tipos-perfil`,
      { headers }
    );
    if (!perfilRes.ok) throw new Error(`Erro Perfil: ${perfilRes.status}`);
    const perfilData = await perfilRes.json();

    console.log("SIGESS: CADUNICO RAW STUDY (Perfil)", perfilData);

    if (!Array.isArray(perfilData) || perfilData.length === 0) {
      console.warn("SIGESS: Perfil não encontrado");
      return;
    }

    const perfil = perfilData[0];
    const pessoaId: number = perfil.identificador;
    const familiaId: number = perfil.numeroFamiliar;

    // PASSO 2: Informações Detalhadas da pessoa
    // Endpoint confirmado pelo HAR: /v1/pessoa/{pessoaId}/informacoes-detalhadas
    const detalhesRes = await fetch(
      `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${pessoaId}/informacoes-detalhadas`,
      { headers }
    );

    if (detalhesRes.ok) {
      const detalhes = await detalhesRes.json();
      console.log("SIGESS: CADUNICO RAW STUDY (Detalhes)", detalhes);

      const c = detalhes.pessoaDadosCadastroDTO || {};
      const esc = detalhes.pessoaEscolaridadeDTO || {};

      // RG: o CadÚnico retorna com zeros à esquerda (ex: "00000000000004520021")
      const rgRaw: string = String(c.numeroIdentidade || '');
      const rgClean = rgRaw.replace(/^0+/, '') || undefined;

      const advancedData: Partial<PessoaData> = {
        // Identificação
        nome: c.nomePessoa,
        cpf: c.numeroCpfPessoa ? String(c.numeroCpfPessoa) : cpf,
        nit: c.numeroNisPisPasepPessoa ? String(c.numeroNisPisPasepPessoa) : undefined,

        // Dados Pessoais
        dataDeNascimento: c.dataNascimentoPessoa ? c.dataNascimentoPessoa.split('T')[0] : undefined,
        sexo: c.tipoSexoPessoa?.codigo === 1 ? 'MASCULINO' : (c.tipoSexoPessoa?.codigo === 2 ? 'FEMININO' : undefined),
        mae: c.filiacao1,   // filiacao1 = mãe no CadÚnico
        pai: c.filiacao2,   // filiacao2 = pai

        // Naturalidade e Nacionalidade
        naturalidade: c.nomeIbgeMunicipioNascimento,
        ufNaturalidade: c.siglaUFNascimento,
        nacionalidade: c.nomePaisOrigem === 'BRASIL' ? 'BRASILEIRO(A)' : c.nomePaisOrigem,

        // RG — sem zeros à esquerda
        rg: rgClean,
        dataExpedicaoRg: c.dataEmissaoIdentidade ? c.dataEmissaoIdentidade.split('T')[0] : undefined,
        ufRg: c.siglaUfIdentidade,
        orgaoEmissorRg: c.siglaOrgaoEmissor,   // ex: "SSP"

        // Título Eleitoral — CadÚnico JÁ TEM esses dados!
        // Confirmado pelo HAR: não precisa ir ao TSE se capturar do CadÚnico
        tituloEleitor: c.numeroTituloEleitorPessoa ? String(c.numeroTituloEleitorPessoa) : undefined,
        zonaEleitoral: c.numeroZonaTituloEleitorPessoa != null ? String(c.numeroZonaTituloEleitorPessoa) : undefined,
        secaoEleitoral: c.numeroSecaoTituloEleitorPessoa != null ? String(c.numeroSecaoTituloEleitorPessoa) : undefined,

        // CTPS (Carteira de Trabalho)
        ctps: c.numeroCtps ? `${c.numeroCtps}/${c.numeroSerieCtps || ''}`.replace(/\/$/, '') : undefined,
        ctpsUf: c.ufEmissoraCtps,

        // Escolaridade — combina código do curso + se concluiu
        alfabetizado: esc.sabeLerEEscrever?.codigo === 1 ? 'SIM' : (esc.sabeLerEEscrever?.codigo === 2 ? 'NÃO' : undefined),
        escolaridade: mapCadUnicoEscolaridade(
          esc.cursoMaisElevadoQueFrequentou?.codigo,
          esc.concluiuOCursoQueFrequentou?.codigo,
          esc.sabeLerEEscrever?.codigo
        ),
      };

      saveData(advancedData, "cadunico_adv");
      dispatchDebugLog(`CadÚnico: ${Object.keys(advancedData).filter(k => (advancedData as any)[k]).length} campos capturados!`, "success");
    }

    // PASSO 3: Membros da Família (para log de estudo — dados de endereço e família)
    if (familiaId) {
      const membrosRes = await fetch(
        `https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/familia/${familiaId}/membros`,
        { headers }
      );
      if (membrosRes.ok) {
        const membros = await membrosRes.json();
        console.log("SIGESS: CADUNICO RAW STUDY (Membros da família)", membros);

        // A data de cadastro da família está aqui
        const dataCadastro = membros?.familiaCadastroDTO?.dataCadastro;
        if (dataCadastro) {
          console.log("SIGESS: Data de cadastro da família:", dataCadastro);
        }

        // O município/UF de cadastro (endereço aproximado)
        const municipio = membros?.familiaCadastroDTO?.municipioCadastro;
        const uf = membros?.familiaCadastroDTO?.ufCadastro;
        if (municipio && uf) {
          // Salvamos como dado de endereço apenas se ainda não temos
          saveData({ cidade: municipio, uf: uf }, "cadunico_familia");
        }
      }
    }

  } catch (e) {
    console.error("SIGESS: Falha na extração avançada CadÚnico", e);
    dispatchDebugLog("Erro na extração avançada. Verifique o console.", "error");
  }
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

  if (!trigger) {
    trigger = document.querySelector(`[role="combobox"][aria-label*="${labelText}"]`);
  }

  if (!trigger) {
    console.warn(`SIGESS: Trigger Radix não encontrado para label "${labelText}"`);
    return false;
  }

  (trigger as HTMLElement).click();
  await sleep(150);

  const options = Array.from(document.querySelectorAll('[role="option"]'));
  const valueNorm = value.trim().toLowerCase();

  const match = options.find(o => o.textContent?.trim().toLowerCase() === valueNorm)
    || options.find(o => o.textContent?.trim().toLowerCase().includes(valueNorm))
    || options.find(o => valueNorm.includes(o.textContent?.trim().toLowerCase() || '___'));

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

  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  const data = settings.pessoaData as PessoaData;

  if (!data || Object.keys(data).length <= 1) {
    alert("Nenhum dado capturado ainda. Visite os portais governamentais primeiro.");
    return;
  }

  // --- Campos de input/textarea ---
  const mappings: Record<string, keyof PessoaData> = {
    'nome': 'nome',
    'cpf': 'cpf',
    'apelido': 'apelido',
    'pai': 'pai',
    'mae': 'mae',
    'dataDeNascimento': 'dataDeNascimento',
    'nacionalidade': 'nacionalidade',
    'naturalidade': 'naturalidade',
    'ufNaturalidade': 'ufNaturalidade',
    'cep': 'cep',
    'endereco': 'endereco',
    'numero': 'numero',
    'bairro': 'bairro',
    'cidade': 'cidade',
    'uf': 'uf',
    'telefone': 'telefone',
    'email': 'email',
    'rg': 'rg',
    'dataExpedicaoRg': 'dataExpedicaoRg',
    'ufRg': 'ufRg',
    'tituloEleitor': 'tituloEleitor',
    'zonaEleitoral': 'zonaEleitoral',
    'secaoEleitoral': 'secaoEleitoral',
    'nit': 'nit',
    'caepf': 'caepf',
    'rgp': 'rgp',
    'emissaoRgp': 'emissaoRgp',
    'ufRgp': 'ufRgp',
    'senhaGovInss': 'senhaGovInss'
  };

  let count = 0;
  for (const [inputName, dataKey] of Object.entries(mappings)) {
    const val = data[dataKey];
    if (val) {
      const input = document.querySelector(
        `input[name="${inputName}"], textarea[name="${inputName}"]`
      ) as HTMLInputElement | null;
      if (input) {
        setReactInput(input, String(val));
        count++;
      }
    }
  }

  // --- Radio buttons ---
  if (data.sexo) {
    const radio = document.querySelector(
      `input[name="sexo"][value="${data.sexo}"]`
    ) as HTMLInputElement | null;
    if (radio) { radio.click(); count++; }
  }

  if (data.alfabetizado) {
    const radio = document.querySelector(
      `input[name="alfabetizado"][value="${data.alfabetizado}"]`
    ) as HTMLInputElement | null;
    if (radio) { radio.click(); count++; }
  }

  // --- Radix UI Selects ---
  const selectFields: Array<[string, string | undefined]> = [
    ['Escolaridade', data.escolaridade],
    ['Estado Civil', data.estadoCivil],
    ['Tipo', data.tipoRgp],
  ];

  for (const [labelText, value] of selectFields) {
    if (value) {
      const ok = await fillRadixSelect(labelText, value);
      if (ok) count++;
    }
  }

  console.log(`SIGESS: ${count} campos preenchidos.`);
  alert(`✅ SIGESS: ${count} campo(s) preenchido(s) com sucesso!`);
}

function injectAssistantUI() {
  if (document.getElementById('sigess-assistant-root')) return;

  const root = document.createElement('div');
  root.id = 'sigess-assistant-root';
  root.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    font-family: 'Inter', sans-serif;
  `;

  const container = document.createElement('div');
  container.style.cssText = `
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 280px;
  `;

  const header = document.createElement('div');
  header.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
      <div style="width: 10px; height: 10px; background: #2563eb; border-radius: 50%; box-shadow: 0 0 6px #2563eb;"></div>
      <strong style="font-size: 14px; color: #1e293b;">SIGESS Assistant</strong>
    </div>
    <p id="sigess-status-text" style="font-size: 12px; color: #64748b; margin: 0;">Aguardando dados...</p>
  `;
  container.appendChild(header);

  const button = document.createElement('button');
  button.innerText = 'Preencher Formulário';
  button.style.cssText = `
    background: #2563eb; color: white; border: none; border-radius: 8px;
    padding: 10px; font-weight: 600; font-size: 13px; cursor: pointer;
    transition: background 0.2s; width: 100%;
  `;
  button.onmouseover = () => button.style.background = '#1d4ed8';
  button.onmouseout = () => button.style.background = '#2563eb';
  button.onclick = fillSIGESSForm;
  container.appendChild(button);

  root.appendChild(container);
  document.body.appendChild(root);

  updateAssistantStatus();
}

async function updateAssistantStatus() {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  const data = settings.pessoaData as PessoaData;
  const statusText = document.getElementById('sigess-status-text');

  if (statusText) {
    if (data && data.nome) {
      const fontes = Object.keys(data.fontes || {}).length;
      statusText.innerText = `✅ ${data.nome.split(' ')[0]} — ${fontes} fonte(s)`;
      statusText.style.color = '#16a34a';
    } else {
      statusText.innerText = 'Aguardando dados... Visite os portais gov.';
      statusText.style.color = '#64748b';
    }
  }
}

globalThis.addEventListener('SIGESS_DATA_UPDATED', updateAssistantStatus);

// ==========================================
// Detecção de página do SIGESS
// ==========================================

function isSIGESSFormPage(): boolean {
  const href = globalThis.location.href;
  const host = globalThis.location.hostname;

  const isSigessDomain = host.includes("sigess") || host.includes("vercel.app");
  const isFormRoute = href.includes("/socios/novo") ||
    href.includes("/socios/editar") ||
    href.includes("/members/new") ||
    href.includes("/members/edit") ||
    href.includes("/registration");

  return isSigessDomain && isFormRoute;
}

function initAssistantIfNeeded() {
  if (isSIGESSFormPage()) {
    if (document.readyState === 'complete') {
      injectAssistantUI();
    } else {
      globalThis.addEventListener('load', injectAssistantUI);
    }
  }
}

// Monitora navegação SPA
let lastHref = globalThis.location.href;
const spaObserver = new MutationObserver(() => {
  if (globalThis.location.href !== lastHref) {
    lastHref = globalThis.location.href;
    setTimeout(initAssistantIfNeeded, 500);
  }
});

if (document.body) {
  spaObserver.observe(document.body, { childList: true, subtree: true });
} else {
  globalThis.addEventListener('DOMContentLoaded', () => {
    spaObserver.observe(document.body, { childList: true, subtree: true });
  });
}

// Execução da inicialização controlada
initAutoRegistration();
