import { parsePesqBrasilRSC } from "../modules/automation/pesqbrasil/extractor";
import { parseCaepfData } from "../modules/automation/caepf/extractor";
import { scrapeEcacCpfData, scrapeEcacCaepfTable } from "../modules/automation/ecac/extractor";
import { parseCadUnicoToken } from "../modules/automation/cadunico/extractor";
import { fetchCadUnicoAdvanced } from "../modules/automation/cadunico/fetcher";
import { parseTseData } from "../modules/automation/tse/extractor";
import { updateAssistantStatus, removeAssistantUI } from "../modules/automation/assistant-ui";
import { setupSPANavigationObserver } from "../modules/automation/spa-observer";

console.log("SIGESS: Auto Registration Content Script loaded");

/** Cache reativo do estado de ativação — evita I/O no storage a cada mensagem. */
let _autoEnabled = false;

// ── Inicialização ────────────────────────────────────────────────────────

async function startAutomation() {
  // Correção para falha intermitente de redirecionamento no CadÚnico (Gov.br -> SuccessLogin sem token)
  if (
    globalThis.location.hostname.includes('cadunico.dataprev.gov.br') &&
    globalThis.location.hash === '#/successLogin'
  ) {
    if (sessionStorage.getItem('sigess_cadunico_retry')) {
      sessionStorage.removeItem('sigess_cadunico_retry');
      console.error('[SIGESS] CadÚnico: Falha persistente no successLogin. Aguardando ação manual.');
    } else {
      sessionStorage.setItem('sigess_cadunico_retry', '1');
      console.warn('[SIGESS] CadÚnico: successLogin sem token detectado. Redirecionando para raiz do app...');
      globalThis.location.replace('https://cadunico.dataprev.gov.br/');
    }
    return;
  }

  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  _autoEnabled = !!settings.autoRegistrationEnabled;

  // SEMPRE registra listeners de bridge, mesmo se desativado (para poder ativar em tempo real)
  globalThis.addEventListener("message", handleBridgeMessages);

  if (_autoEnabled) {
    initEnabledFeatures();
  }

  // Monitor sempre ativo para reagir a mudanças no popup e navegação SPA
  setupSPANavigationObserver(updateAssistantStatus);
}

/**
 * Inicializa as funcionalidades que dependem da captura estar ATIVA.
 * Pode ser chamado no load inicial ou via onChanged.
 */
function initEnabledFeatures() {
  console.log("SIGESS: Funcionalidades de automação ativadas.");

  injectBridges();

  // Scrapers de DOM para e-CAC (id=15 e id=89)
  const url = globalThis.location.href;
  const isEcacCpf = url.includes('id=15') || url.includes('ConsultarCPF');
  const isEcacCaepf = url.includes('id=89');

  if (isEcacCpf || isEcacCaepf) {
    const runScrape = () => {
      const data = isEcacCpf ? scrapeEcacCpfData() : scrapeEcacCaepfTable();
      if (data) {
        saveData(data, isEcacCpf ? "ecac_cpf" : "ecac_caepf");
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runScrape, { once: true });
    } else {
      runScrape();
    }
  }
}

// ── Mensagens da Bridge ──────────────────────────────────────────────────

function handleBridgeMessages(event: MessageEvent) {
  if (event.origin !== globalThis.location.origin) return;

  const { type, payload } = event.data || {};
  if (type?.startsWith("SIGESS_")) {
    processIncomingData(type, payload);
  }
}

function processIncomingData(type: string, payload: unknown) {
  if (!_autoEnabled) return;

  console.log(`SIGESS: Mensagem recebida da página -> ${type}`);

  if (type === "SIGESS_PESQBRASIL_RAW_DATA") {
    const extractedData = parsePesqBrasilRSC(payload as string);
    if (extractedData) saveData(extractedData, "pesqbrasil");
  } else if (type === "SIGESS_CAEPF_RAW_DATA") {
    const extractedData = parseCaepfData(payload);
    if (extractedData) saveData(extractedData, "caepf");
  } else if (type === "SIGESS_CADUNICO_RAW_TOKEN") {
    const extractedData = parseCadUnicoToken(payload as string);
    if (extractedData) saveData(extractedData, "cadunico");
  } else if (type === "SIGESS_CADUNICO_ADV_TOKENS") {
    const advPayload = payload as { cpf: string; bearer: string; xsrf: string; cnas: string };
    fetchCadUnicoAdvanced(advPayload).then(data => {
      if (data) saveData(data, "cadunico_adv");
    });
  } else if (type === "SIGESS_TSE_RAW_DATA") {
    const extractedData = parseTseData(payload);
    if (extractedData) saveData(extractedData, "tse");
  }
}

// ── Injeção de bridges ───────────────────────────────────────────────────

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

// ── Persistência ─────────────────────────────────────────────────────────

function saveData(data: Partial<import("../shared/types").PessoaData>, fonte: string) {
  console.log(`SIGESS: Dados extraídos de ${fonte}`, data);
  chrome.runtime.sendMessage({
    action: "SAVE_PESSOA_DATA",
    data,
    fonte
  }, () => {
    if (chrome.runtime.lastError) {
      console.warn("SIGESS: Erro ao salvar dados:", chrome.runtime.lastError.message);
      return;
    }
    globalThis.dispatchEvent(new CustomEvent('SIGESS_DATA_UPDATED'));
  });
}

// ── Reatividade (storage.onChanged) ──────────────────────────────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes.sigessSettings) {
    const newVal = changes.sigessSettings.newValue || {};
    const oldVal = changes.sigessSettings.oldValue || {};

    console.log("SIGESS: Configurações alteradas detected no storage.onChanged", {
      autoEnabled: newVal.autoRegistrationEnabled,
      hasData: !!(newVal.pessoaData && Object.keys(newVal.pessoaData).length > 0)
    });

    // Atualiza cache de ativação
    _autoEnabled = !!newVal.autoRegistrationEnabled;

    // Se o recurso foi desativado completamente
    if (oldVal.autoRegistrationEnabled === true && newVal.autoRegistrationEnabled === false) {
      console.log("SIGESS: Captura desativada via popup. Ocultando UI.");
      removeAssistantUI();
      return;
    }

    // Se ativou agora, tenta inicializar bridges
    if (!oldVal.autoRegistrationEnabled && newVal.autoRegistrationEnabled) {
      initEnabledFeatures();
    }

    // Sempre atualiza o assistente para refletir novos dados (ou a falta deles)
    updateAssistantStatus();
  }
});

globalThis.addEventListener('SIGESS_DATA_UPDATED', updateAssistantStatus);

startAutomation();
