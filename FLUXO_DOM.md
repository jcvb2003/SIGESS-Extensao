# Fluxo Esperado do DOM - eSocial Automation

## 1. INICIALIZAÇÃO (form-automation.ts)

### Quando: Page Load
```
window.onload → browserAPI.storage.local.get("sigessSettings")
                    ↓
              settings recebidas
                    ↓
              start(settings)
                    ↓
            ┌─────────────────────────────────────┐
            │  Se settings.gerarGps === true:     │
            │  hydrateEsocialProgressOverlay()    │
            │  (cria div overlay no DOM)          │
            │                                     │
            │  Se settings.gerarGps === false:    │
            │  clearEsocialProgressOverlay()      │
            └─────────────────────────────────────┘
                    ↓
            observarBotaoEmitirGuia()
            (observer MutationObserver no DOM)
                    ↓
            if (DOMContentLoaded) executarFluxoGpsSeNecessario()
```

## 2. OBSERVADOR DE BOTÃO (guide-download.ts)

### Onde: Observa `<a>` elementos no DOM
```
MutationObserver escuta childList no document.body
            ↓
Procura por: <a href="...EmitirGuiaMensal...">Emitir Guia</a>
            ↓
Se encontrado:
  ├─ Marca como hooked: setAttribute(HOOKED_BUTTON_ATTR, "true")
  ├─ Adiciona listener: click event
  └─ Desconecta observer quando todos estão hooked
            ↓
Ao clicar:
  ├─ event.preventDefault() + event.stopPropagation()
  ├─ Extrai URL do botão (resolveGuiaDownloadUrlFromAnchor)
  ├─ Extrai competência (extractCompetenciaFromUrl)
  ├─ Chama baixarGuiaPdf()
  └─ Reporta status ao overlay
```

## 3. FLUXO GPS (gps-flow.ts: executarFluxoDirectoFromHome)

### Onde: Home page do eSocial
```
HOME PAGE DO ESOCIAL (isHomePage check)
            ↓
┌──────────────────────────────────────────────────────┐
│ PASSO 1: Verificar Boleto Existente                  │
└──────────────────────────────────────────────────────┘
  consultarGuiaExistenteViaApi(competencia)
            ↓
  fetch("/FolhaPagamento/Listagem/Competencias")
            ↓
  parseHtml() → extractGuiaExistenteInfo()
            ├─ querySelector("table tbody tr")
            ├─ Procura: <a href="...competencia=...">
            ├─ extrai cells[3] = valorDeclarado
            ├─ extrai cells[4] = valorPago
            └─ Procura: <a>Emitir Guia</a>
            ↓
  if (boleto já gerado):
    └─ Baixa do URL direto com baixarGuiaPdfDirecto()
    └─ FIM DO FLUXO
            ↓
┌──────────────────────────────────────────────────────┐
│ PASSO 2: Carregar Comercialização                     │
└──────────────────────────────────────────────────────┘
  carregarDadosComercializacao(competencia)
            ↓
  fetch("/FolhaPagamento/SeguradoEspecial/Comercializacao...")
            ↓
  parseHtml() → buildComercializacaoPayload()
            ├─ querySelector("form") → extrai todos inputs
            ├─ Busca inputs[name] com valores
            └─ Constrói payload POST
            ↓
┌──────────────────────────────────────────────────────┐
│ PASSO 3: Salvar Rascunho                              │
└──────────────────────────────────────────────────────┘
  postJson("/FolhaPagamento/.../SalvarRascunhoComercializacao...")
            ↓
┌──────────────────────────────────────────────────────┐
│ PASSO 4: Enviar Eventos                               │
└──────────────────────────────────────────────────────┘
  postJson("/FolhaPagamento/.../EnviarEventosComercializacao...")
            ↓
┌──────────────────────────────────────────────────────┐
│ PASSO 5: Fechamento                                   │
└──────────────────────────────────────────────────────┘
  fetch("GET /FolhaPagamento/FechamentoFolha?competencia=...")
            ↓
  parseHtml() → buildFechamentoFormData()
            ├─ querySelector("form")
            ├─ querySelectorAll("input[name], select[name]")
            └─ Extrai valores
            ↓
  fetch("POST /FolhaPagamento/FechamentoFolha")
            ↓
  parseHtml() → resolveGuiaUrlFromDocument()
            ├─ Procura por <a> com href contendo PDF/guia
            └─ Extrai URL
            ↓
┌──────────────────────────────────────────────────────┐
│ PASSO 6: Download do Boleto                           │
└──────────────────────────────────────────────────────┘
  baixarGuiaPdfDirecto(guiaUrl, competencia, ...)
            ↓
  fetch(guiaUrl) → blob
            ↓
  getBestNome() → [AQUI CHAMAVA getStoredCredentials]
  getBestCpf()  → [AQUI CHAMAVA getStoredCredentials]
            ↓
  buildEsocialFilename(nome, cpf, competencia)
            ├─ Formato: "NOME_CPF_DATA.pdf"
            └─ Exemplo: "MARIA CLARA VEIGA DO CARMO_05605703250_2026-05.pdf"
            ↓
  triggerLocalDownload(blob, filename)
            ├─ URL.createObjectURL(blob)
            ├─ document.createElement("a")
            ├─ anchor.href = objectUrl
            ├─ anchor.download = filename
            ├─ document.body.appendChild(anchor)
            ├─ anchor.click() → DISPARA DOWNLOAD
            ├─ anchor.remove()
            └─ URL.revokeObjectURL(objectUrl) [após 60s]
```

## 4. EXTRAÇÃO DO NOME/CPF (esocial-extractors.ts)

### Priority Order:
```
getBestNome():
  1. API: fetchEsocialSessionData() 
     └─ fetch("/api/v1/LoginESocialConsultas.svc/DadosSessao")
     └─ Extrai: response.Nome
     
  2. Global: window.nomeUsuario
  
  3. Storage: getStoredCredentials()
     └─ localStorage["credenciais_*"] ou ["sigess_last_esocial_credentials"]
     
  4. DOM: querySelector(".nome-usuario")
     └─ Se não encontrar: querySelector("#header")
     
  5. Default: "SEM_NOME"

getBestCpf():
  1. API: fetchEsocialSessionData()
     └─ fetch("/api/v1/LoginESocialConsultas.svc/DadosSessao")
     └─ Extrai: response.NI
     
  2. Global: window.identidadeLocal
  
  3. Storage: getStoredCredentials()
     └─ localStorage["credenciais_*"]
     
  4. Default: "SEM_CPF"
```

## 5. FLUXO DO OVERLAY (overlay-ui.ts)

### Renderização do Status:
```
reportBatchStatus(status, title, description, extra)
            ↓
  if (overlayState === null):
    clearEsocialProgressOverlay()
    └─ document.getElementById(ESOCIAL_PROGRESS_OVERLAY_ID).remove()
            ↓
  else if (overlayState):
    renderEsocialProgressOverlay(overlayState)
    ├─ Encontra/cria <div id="ESOCIAL_PROGRESS_OVERLAY_ID">
    ├─ Estiliza: position: fixed, z-index: 99999, backdrop-filter: blur(2px)
    ├─ innerHTML = progress card com spinner
    ├─ Mostra title e description
    ├─ Mostra progresso: step/total
    └─ auto-remove após hideAt timestamp
```

## FLUXO COMPLETO EM SEQUÊNCIA:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. PAGE LOAD                                                │
│    browserAPI.storage.local.get("sigessSettings")           │
│    → hydrateEsocialProgressOverlay() + observarBotaoEmitir  │
└─────────────────────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────────┐
            │ 2. USUÁRIO ABRE PÁGINA OU   │
            │    CLICA NO BOTÃO EMITIR    │
            └─────────────────────────────┘
                          ↓
            ┌─────────────────────────────────────────────┐
            │ 3. VERIFICAR SE JÁ EXISTE BOLETO           │
            │    - Busca no DOM da página                 │
            │    - Extrai valores das tabelas             │
            │    - Se existe: vai pro download            │
            │    - Se não existe: inicia geração GPS      │
            └─────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────────────────────────┐
            │ 4. FLUXO DE GERAÇÃO (se necessário)        │
            │    - Carrega HTML da comercialização        │
            │    - Extrai dados do form                   │
            │    - Envia eventos                          │
            │    - Faz fechamento                         │
            │    - Obtém guia URL                         │
            └─────────────────────────────────────────────┘
                          ↓
            ┌─────────────────────────────────────────────┐
            │ 5. DOWNLOAD E NOMEAÇÃO                      │
            │    - Chama API DadosSessao para nome/CPF    │
            │    - Monta filename correto                 │
            │    - Faz download automático                │
            │    - Remove overlay                         │
            └─────────────────────────────────────────────┘
```

## PONTOS CRÍTICOS DO DOM:

| Etapa | Seletor DOM | O que extrai | Arquivo |
|-------|------------|--------------|---------|
| Verificação | `table tbody tr` com `a[href*="competencia"]` | Valores das colunas 3 e 4 (declarado/pago) | gps-flow.ts |
| Comercialização | `form input[name], select[name]` | Valores dos inputs | gps-flow.ts |
| Fechamento | `form` + seus `input/select` | Dados do formulário | gps-flow.ts |
| Guia | HTML resposta (parseHtml) | URL do PDF/guia | document-parser.ts |
| Botão | `<a href="...EmitirGuiaMensal...">` | Texto contém "emitir guia" | guide-download.ts |
| Nome | `.nome-usuario` ou `#header` | textContent | esocial-extractors.ts |

## O PROBLEMA DE ANTES:

```
Quando você abre TAB 1:
  window.nomeUsuario = "MARIA CLARA..."
  
Quando você abre TAB 2:
  window.nomeUsuario = "MARIA CLARA..." (AINDA)
  ← Não muda porque é GLOBAL!
  
Ao baixar boleto em TAB 2:
  getBestNome() → lê window.nomeUsuario
  → Retorna "MARIA CLARA..." (ERRADO!)
  
SOLUÇÃO:
  fetchEsocialSessionData() faz chamada API POR TAB
  ← Cada tab tem sua própria sessão logada
  ← API retorna nome correto daquela sessão
  ← Problema resolvido!
```
