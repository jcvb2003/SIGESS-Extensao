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
dispatchDebugLog("Script de automação carregado.");

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
globalThis.addEventListener("message", (event) => {
  const { type, payload } = event.data || {};
  
  if (type && type.startsWith("SIGESS_")) {
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
      } else {
        console.warn(`SIGESS: Mensagem com prefixo SIGESS_ recebida mas não processada: ${type}`);
      }
  }
});

async function fetchCadUnicoAdvanced(payload: { cpf: string, bearer: string, xsrf: string, cnas: string }) {
  const { cpf, bearer, xsrf, cnas } = payload;
  console.log("SIGESS: Iniciando extração avançada CadÚnico para CPF: " + cpf);
  dispatchDebugLog("Iniciando extração profunda no CadÚnico...", "info");

  const headers = {
    'Authorization': bearer,
    'X-XSRF-TOKEN': xsrf,
    'CnasVersao': cnas,
    'Accept': 'application/json',
    'Referer': 'https://cadunico.dataprev.gov.br/'
  };

  try {
    // 1. Tipos de Perfil (Obter pessoaId e numeroFamiliar)
    const perfilRes = await fetch(`https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${cpf}/tipos-perfil`, { headers });
    if (!perfilRes.ok) throw new Error(`Erro Perfil: ${perfilRes.status}`);
    const perfilData = await perfilRes.json();
    
    console.log("SIGESS: CADUNICO RAW STUDY (Perfil)", perfilData);
    
    if (!perfilData || !Array.isArray(perfilData) || perfilData.length === 0) {
        console.warn("SIGESS: Perfil não encontrado ou formato inválido");
        return;
    }
    const perfil = perfilData[0];
    const pessoaId = perfil.identificador;
    const numeroFamiliar = perfil.numeroFamiliar;

    // 2. Informações Detalhadas (Escolaridade)
    const detalhesRes = await fetch(`https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/pessoa/${pessoaId}/informacoes-detalhadas`, { headers });
    if (detalhesRes.ok) {
      const detalhes = await detalhesRes.json();
      console.log("SIGESS: CADUNICO RAW STUDY (Detalhes)", detalhes);
      
      const cadastro = detalhes.pessoaDadosCadastroDTO || {};
      const esc = detalhes.pessoaEscolaridadeDTO || {};

      const advancedData: Partial<PessoaData> = {
        nome: cadastro.nomePessoa,
        cpf: cpf,
        ufNaturalidade: cadastro.ufNaturalidade,
        naturalidade: cadastro.nomeMunicipioNaturalidade,
        sexo: cadastro.sexo === 'Masculino' ? 'MASCULINO' : (cadastro.sexo === 'Feminino' ? 'FEMININO' : undefined),
        
        // Endereço (Vem do perfil inicial)
        cidade: perfil.municipio,
        uf: perfil.uf,

        // Escolaridade
        alfabetizado: esc.sabeLerEEscrever?.codigo === 1 ? 'SIM' : 'NÃO',
      };

      saveData(advancedData, "cadunico_adv");
      dispatchDebugLog("Dados avançados do CadÚnico capturados!", "success");
    }

    // 3. Membros da Família (Data de Cadastro)
    const membrosRes = await fetch(`https://cadunico.dataprev.gov.br/transacional/api/transacional-api/v1/familia/${numeroFamiliar}/membros`, { headers });
    if (membrosRes.ok) {
      const membros = await membrosRes.json();
      console.log("SIGESS: CADUNICO RAW STUDY (Membros)", membros);
    }

  } catch (e) {
    console.error("SIGESS: Falha na extração avançada CadÚnico", e);
    dispatchDebugLog("Erro na extração avançada. Verifique o console.", "error");
  }
}

function saveData(data: any, fonte: string) {
  console.log(`SIGESS: Dados extraídos de ${fonte}`, data);
  chrome.runtime.sendMessage({
    action: "SAVE_PESSOA_DATA",
    data: data,
    fonte: fonte
  }, () => {
      // Notifica o assistente se ele existir na página
      const customEvent = new CustomEvent('SIGESS_DATA_UPDATED');
      globalThis.dispatchEvent(customEvent);
  });
}

// ==========================================
// Lógica de Preenchimento (SIGESS Assistant)
// ==========================================

function setReactInput(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    if (!el) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLInputElement.prototype,
        "value",
    )?.set || Object.getOwnPropertyDescriptor(
        globalThis.HTMLTextAreaElement.prototype,
        "value",
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

async function fillSIGESSForm() {
    console.log("SIGESS: Iniciando preenchimento automático...");
    
    const result = await chrome.storage.local.get("pessoaData");
    const data = result.pessoaData as PessoaData;

    if (!data) {
        alert("Nenhum dado capturado ainda. Visite os portais governamentais primeiro.");
        return;
    }

    const mappings: Record<string, keyof PessoaData> = {
        // Pessoais
        'nome': 'nome',
        'cpf': 'cpf',
        'apelido': 'apelido',
        'pai': 'pai',
        'mae': 'mae',
        'dataDeNascimento': 'dataDeNascimento',
        'nacionalidade': 'nacionalidade',
        'naturalidade': 'naturalidade',
        'ufNaturalidade': 'ufNaturalidade',
        // Endereço
        'cep': 'cep',
        'endereco': 'endereco',
        'numero': 'numero',
        'bairro': 'bairro',
        'cidade': 'cidade',
        'uf': 'uf',
        'telefone': 'telefone',
        'email': 'email',
        // Documentos
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
            const input = document.querySelector(`input[name="${inputName}"], textarea[name="${inputName}"]`) as HTMLInputElement;
            if (input) {
                setReactInput(input, String(val));
                count++;
            }
        }
    }

    // Casos especiais (Selects e Radios)
    if (data.sexo) {
        const radio = document.querySelector(`input[name="sexo"][value="${data.sexo}"]`) as HTMLInputElement;
        if (radio) radio.click();
    }

    if (data.alfabetizado) {
        const radio = document.querySelector(`input[name="alfabetizado"][value="${data.alfabetizado}"]`) as HTMLInputElement;
        if (radio) radio.click();
    }

    console.log(`SIGESS: ${count} campos preenchidos.`);
}

function injectAssistantUI() {
    // Evita duplicatas
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
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 16px;
        padding: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 280px;
        transition: all 0.3s ease;
    `;

    const header = document.createElement('div');
    header.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <div style="width: 10px; height: 10px; background: #2563eb; border-radius: 50%;"></div>
            <strong style="font-size: 14px; color: #1e293b;">SIGESS Assistant</strong>
        </div>
        <p id="sigess-status-text" style="font-size: 12px; color: #64748b; margin: 0;">Aguardando dados...</p>
    `;
    container.appendChild(header);

    const button = document.createElement('button');
    button.innerText = 'Preencher Formuário';
    button.style.cssText = `
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 10px;
        font-weight: 600;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.2s;
    `;
    button.onmouseover = () => button.style.background = '#1d4ed8';
    button.onmouseout = () => button.style.background = '#2563eb';
    button.onclick = fillSIGESSForm;
    container.appendChild(button);

    root.appendChild(container);
    document.body.appendChild(root);

    // Update status inicial
    updateAssistantStatus();
}

async function updateAssistantStatus() {
    const result = await chrome.storage.local.get("pessoaData");
    const data = result.pessoaData as PessoaData;
    const statusText = document.getElementById('sigess-status-text');
    
    if (statusText && data) {
        statusText.innerText = `Pronto: ${data.nome?.split(' ')[0] || 'Sócio'} (${data.cpf || 'CPF oculto'})`;
    }
}

// Listen para updates
globalThis.addEventListener('SIGESS_DATA_UPDATED', updateAssistantStatus);

// Detectar página do SIGESS
    if (globalThis.location.href.includes("sigess") && (globalThis.location.href.includes("/socios/novo") || globalThis.location.href.includes("/socios/editar"))) {
    // Aguarda o DOM estar pronto
    if (document.readyState === 'complete') {
        injectAssistantUI();
    } else {
        globalThis.addEventListener('load', injectAssistantUI);
    }
}

// Inicializa a injeção da ponte se necessário
injectBridges();
