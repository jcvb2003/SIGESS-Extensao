
O “turbo-logger” abriu portas para um projeto ambicioso. Quero aproveitar essa capacidade de leitura e extração de dados de APIs para criar um novo módulo (acordeão) chamado “Cadastro Automático”.

A ideia é permitir o login em sites como gov, eSocial, PesqBrasil, Meu INSS, CadÚnico, e-CAC e Título. Em seguida, o sistema extrairia os dados e, com um botão, preencheria automaticamente as informações na tela de cadastro de sites com o domínio “vercel.app/registration”.

Atualmente, já consigo extrair dados do CadÚnico, com certa dificuldade, e também do PesqBrasil pelo turbo logger.

**Arquitetura geral**

A ideia central é um "agregador de dados gov" que funciona em duas fases: **captura** (nos sites externos) e **inserção** (no vercel.app/registration).

---

**Fase 1 – Captura por site**

Cada site tem uma estratégia diferente:

- **CadÚnico** → você já tem. Intercepta fetch/XHR, captura tokens e CPF, chama a API interna. É o mais rico em dados (endereço, escolaridade, composição familiar).
- **PesqBrasil** → você já loga. Após o login, os dados do pescador vem pela api e é capturado pelo turbo logger.
- **Gov.br / acesso.gov.br** → após SSO, o perfil fica acessível em `/api/profile`. Um content script naquele domínio captura nome, CPF, data de nascimento, telefone, e-mail.
- **eSocial** → após login, a tela de vínculos tem empregador, matrícula, cargo, salário. Scraping de DOM na página de detalhes do trabalhador.
- **Meu INSS** → a API interna em `meu.inss.gov.br/central-servicos/api` retorna benefícios com Bearer token. Mesma estratégia do CadÚnico.
- **eCac** → mais complicado, usa autenticação via certificado ou Gov.br. Se o usuário já está logado, dá pra capturar situação fiscal por scraping.
- **Título Eleitoral** → 

---

**Fase 2 – Inserção no vercel.app/registration**

Um único content script no domínio `*.vercel.app` que:
1. Detecta a página de cadastro
2. Lê o `PessoaData` do `browser.storage`
3. Mapeia os campos da página para os dados disponíveis
4. Um botão flutuante "Preencher com SIGESS" executa o fill usando o `setReactInput` que você já tem

---

**No popup – o acordeão**

O painel teria três áreas:
- **Status das fontes** → badges mostrando quais dados já foram capturados (CadÚnico ✅, eSocial ⏳, etc.)
- **Dados capturados** → um resumo colapsável mostrando o que está salvo
- **Ação** → botão "Preencher cadastro" que abre a aba do vercel ou injeta nos campos se já estiver aberto

---

**O maior desafio**

É estudar as API para extrair os dados.

---

Aqui está o mapa completo para você usar no seu content script:
### 1. Informações de Registro
- **`codigoDoSocio`**: Número de Registro (Matrícula)
- **`dataDeAdmissao`**: Data de Filiação
- **`situacao`**: Situação (`ATIVO`, `APOSENTADO`, `FALECIDO`, `TRANSFERIDO`, `CANCELADO`, `SUSPENSO`)
- **`observacoes`**: Observações (Textarea)
### 2. Dados Pessoais
- **`cpf`**: CPF
- **`nome`**: Nome Completo
- **`apelido`**: Apelido
- **`dataDeNascimento`**: Data de Nascimento
- **`sexo`**: Sexo (`MASCULINO`, `FEMININO`)
- **`estadoCivil`**: Estado Civil (`Solteiro(a)`, `Casado(a)`, `Divorciado(a)`, `Viúvo(a)`, `União Estável`)
- **`pai`**: Nome do Pai
- **`mae`**: Nome da Mãe
- **`nacionalidade`**: Nacionalidade
- **`naturalidade`**: Naturalidade (Cidade)
- **`ufNaturalidade`**: UF de Nascimento
- **`alfabetizado`**: Alfabetizado (`SIM`, `NÃO`)
- **`escolaridade`**: Escolaridade (Ex: `EF INCOMPLETO`, `EM COMPLETO`, etc.)
### 3. Endereço e Contato
- **`endereco`**: Logradouro (Rua, Av, etc.)
- **`numero`**: Número
- **`bairro`**: Bairro
- **`cidade`**: Cidade
- **`uf`**: Estado (UF)
- **`cep`**: CEP
- **`telefone`**: Telefone/Celular
- **`email`**: E-mail
- **`codigoLocalidade`**: Localidade (ID interno do sistema)
### 4. Documentos
- **`rg`**: RG
- **`dataExpedicaoRg`**: Data de Expedição do RG
- **`ufRg`**: UF do RG
- **`tituloEleitor`**: Título de Eleitor
- **`zonaEleitoral`**: Zona Eleitoral
- **`secaoEleitoral`**: Seção Eleitoral
- **`nit`**: NIT / PIS / PASEP
- **`cei`**: CEI
- **`caepf`**: CAEPF
- **`rgp`**: RGP (Registro Geral da Pesca)
- **`tipoRgp`**: Tipo de RGP (`INICIAL`, `PROTOCOLO`, `RECADASTRAMENTO`)
- **`emissaoRgp`**: Data de Emissão do RGP
- **`ufRgp`**: UF do RGP
- **`senhaGovInss`**: Senha do Portal Gov.br / INSS
---
**Dica para o Content Script:**
Como o SIGESS utiliza `react-hook-form` com componentes customizados, o preenchimento automático funciona perfeitamente usando a função `setReactInput` que já implementamos anteriormente no projeto (ela dispara os eventos `input` e `change` que o React precisa para atualizar o estado interno).

-------------------

Perfeito. Agora o quebra-cabeça está completo. Veja o mapa de onde cada campo vem:

---

**CadÚnico** cobre a maior parte:
- `nome`, `cpf`, `dataNascimento`, `mae`, `pai`, `sexo`
- `endereco`, `numero`, `bairro`, `cidade`/`municipio`, `uf`, `cep`
- `alfabetizado` ← vem de `sabeLerEEscrever`
- `escolaridade` ← vem de `cursoMaisElevadoQueFrequentou` (vai precisar de um dicionário de equivalência entre os códigos do CadÚnico e os valores do seu sistema)
- `nit` ← vem do campo `nis`

**PesqBrasil** cobre:
- `rgp`, `tipoRgp`, `emissaoRgp`, `ufRgp`
- Provavelmente `codigoDoSocio` e `dataDeAdmissao` se a filiação for à colônia

**Título Eleitoral (API TSE)** cobre:
- `tituloEleitor`, `zonaEleitoral`, `secaoEleitoral`
- Só precisa do CPF — não precisa nem de login

**Gov.br** cobre:
- `telefone`, `email`, `naturalidade`, `ufNaturalidade`, `nacionalidade`

**eSocial** cobre:
- `rg`, `dataExpedicaoRg`, `ufRg`, `estadoCivil`
- Às vezes `nit` também

---

**O que fica sem fonte automática:**
- `codigoLocalidade` → é internal, você preenche por lógica (municipio → lookup na sua tabela)
- `apelido`, `observacoes`, `senhaGovInss`, `cei`, `caepf` → entrada manual sempre
- `situacao` → padrão `ATIVO` no ato do cadastro

---

**Conclusão prática:**

CadÚnico + TSE já preenchem ~70% do formulário sem nenhum login adicional do usuário. PesqBrasil + Gov.br chegam a ~90%. O restante é residual e faz sentido ser manual.

Quer que eu comece pelo código? Se sim, a ordem lógica seria:

1. Content script do CadÚnico (adaptando o userscript que você já tem para o padrão de extensão)
2. Filler do `vercel.app/registration` com o mapa completo
3. Painel do popup
4. Content script do TSE (é o mais simples, só uma chamada fetch com o CPF)

----------------------

# Plano de Implementação — Módulo "Cadastro Automático" (SIGESS)
### Formato: descritivo. Sem código. Para execução pelo Gemini.

---

## Contexto

O SIGESS é uma extensão de navegador (Chrome/Firefox) em TypeScript + React. Já possui módulos funcionais de login automático (PesqBrasil, eSocial) e preenchimento de formulários (REAP). O novo módulo "Cadastro Automático" segue a mesma arquitetura: content scripts que extraem dados de sites governamentais, armazenam em `browser.storage`, e um content script separado que preenche o formulário de cadastro no sistema próprio do usuário (`*.vercel.app/registration`).

O formulário de destino é conhecido e fixo. O mapeamento de campos é estático. O maior trabalho está nos extratores.

---

## Arquitetura Geral

O fluxo é linear: o usuário navega pelos sites governamentais enquanto a extensão captura os dados em segundo plano. Quando quiser cadastrar, abre o sistema no vercel, clica num botão flutuante injetado pela extensão, e o formulário é preenchido automaticamente com o que foi capturado.

Os dados de todas as fontes são consolidados numa estrutura única (`PessoaData`) salva no storage da extensão. Cada extrator contribui com sua parte, sem apagar o que os outros já capturaram.

---

## Passo 1 — Estrutura de Dados (`PessoaData`)

**Objetivo:** definir o contrato de dados que circula entre todos os módulos.

**O que se sabe:** o formulário de destino tem campos bem definidos, mapeados no plano anterior. A estrutura precisa cobrir todos eles, além de metadados indicando quais fontes já foram capturadas e quando.

**O que o Gemini deve fazer:** criar a interface `PessoaData` em `src/shared/types.ts` com todos os campos do formulário mais um objeto `fontes` que registra o status de cada fonte (`cadunico`, `pesqbrasil`, `tse`, `govbr`). Adicionar o tipo ao `AppSettings` e criar dois métodos no `StorageService`: um para ler e um para salvar o `PessoaData`. A lógica de salvar deve sempre fazer **merge** com o que já existe — nunca sobrescrever tudo.

---

## Passo 2 — Dicionários de Equivalência

**Objetivo:** converter os valores que chegam dos sites governamentais para os valores aceitos pelo formulário de destino.

**O que se sabe:** o CadÚnico usa suas próprias nomenclaturas para escolaridade e alfabetização. O formulário do usuário usa valores como `EF INCOMPLETO`, `EM COMPLETO`, `SIM`, `NÃO`. Esses dois mundos precisam ser mapeados.

**O que o Gemini deve investigar:** ao rodar o extrator do CadÚnico pela primeira vez numa pessoa real, usar o turbo logger para imprimir os valores exatos que chegam nos campos de escolaridade e alfabetização. Com esses valores em mãos, construir o dicionário de equivalência correto.

**Risco:** os valores do CadÚnico podem variar por região ou versão da API. O dicionário deve ser tolerante a variações de capitalização e acentuação.

---

## Passo 3 — Extrator CadÚnico

**Objetivo:** capturar automaticamente dados pessoais, de endereço e escolaridade do CadÚnico, sem que o usuário precise fazer nada além de navegar normalmente pelo sistema.

**O que se sabe:** o CadÚnico é um sistema React que se comunica com uma API REST interna. O userscript fornecido pelo usuário já prova que é possível interceptar o `fetch` e o `XMLHttpRequest` para capturar o CPF e os tokens de autenticação (`Bearer` e `X-XSRF-TOKEN`). Com esses três elementos, é possível chamar as mesmas APIs que o sistema usa para buscar dados detalhados da pessoa. As URLs relevantes já estão documentadas no userscript.

**O que o Gemini deve fazer:** converter o userscript em um content script nativo da extensão, seguindo o padrão já estabelecido no projeto. A interceptação de rede é idêntica ao userscript. A diferença é que em vez de mostrar um popup na página, os dados devem ser salvos via `browser.storage` usando o `StorageService`. O script deve ouvir uma mensagem do popup (`extractCadunico`) e responder com sucesso ou falha.

**O que o Gemini deve investigar com o turbo logger:** quais campos exatamente chegam no objeto `pessoaEscolaridadeDTO`, `pessoaDadosCadastroDTO` e `pessoaEnderecoDTO` — especialmente os valores de sexo, escolaridade e alfabetização, para construir os dicionários do Passo 2.

**Risco:** o token XSRF pode expirar. Se a extração falhar por 401/403, o usuário precisa navegar mais um pouco para renovar os tokens antes de tentar novamente.

---

## Passo 4 — Extrator PesqBrasil

**Objetivo:** capturar os dados de registro de pesca (RGP, tipo, data de emissão, UF) após o usuário estar logado no PesqBrasil.

**O que se sabe:** o SIGESS já faz login automático no PesqBrasil. Após o login, a página exibe os dados do pescador. Não se sabe ainda se esses dados vêm de uma API (como no CadÚnico) ou estão diretamente no HTML da página.

**O que o Gemini deve investigar:** com o DevTools aberto na aba Network, navegar até a página de dados do pescador após o login e verificar se há chamadas de API retornando JSON, ou se os dados estão no DOM. Usar o turbo logger para imprimir o que é encontrado. A estratégia de extração (API vs scraping de DOM) depende dessa investigação.

**Risco:** o PesqBrasil tem duas URLs diferentes (agro.gov.br e mpa.gov.br). Verificar se o comportamento é idêntico nas duas.

---

## Passo 5 — Extrator TSE (Título Eleitoral)

**Objetivo:** capturar número do título, zona e seção eleitoral usando apenas o CPF, sem exigir login do usuário.

**O que se sabe:** o site do TSE possui uma tela de autoatendimento que consulta dados do eleitor pelo CPF. Essa tela necessariamente chama uma API interna para buscar os dados. A URL dessa API é desconhecida.

**O que o Gemini deve investigar:** abrir a tela de consulta do TSE com o DevTools na aba Network, preencher um CPF e submeter. Identificar a requisição que retorna os dados do eleitor e registrar: URL completa, método HTTP, headers obrigatórios, e estrutura exata do JSON de resposta.

**Risco:** a API pode exigir um token gerado pela própria página. Se for esse o caso, a abordagem muda — em vez de chamar a API diretamente, criar um content script que roda dentro do domínio do TSE, automatiza o preenchimento do CPF, captura a resposta e a salva no storage.

---

## Passo 6 — Message Router (background)

**Objetivo:** registrar as novas ações no roteador de mensagens do background, seguindo o padrão já existente no projeto.

**O que se sabe:** o arquivo `message-router.ts` já tem um `switch` com todas as ações da extensão. Basta adicionar os casos para `savePessoaData`, `getPessoaData`, `clearPessoaData` e `extractTSE`. A lógica de merge deve estar aqui centralizada para o caso do TSE, que é chamado pelo background e não por um content script de página.

---

## Passo 7 — Filler do Vercel

**Objetivo:** injetar um botão flutuante no formulário de cadastro do sistema do usuário que, ao ser clicado, preenche todos os campos com os dados capturados.

**O que se sabe:** o formulário usa `react-hook-form`. O projeto já possui a função `setReactInput` em `dom-helpers.ts`, que funciona corretamente com React — ela já é usada no módulo eSocial. O mapeamento completo de campos (`name` do input → campo do `PessoaData`) está definido no plano anterior e é estático.

**O que o Gemini deve verificar:** se os campos do formulário são `input` nativos ou componentes customizados (como React Select). Para selects customizados, a abordagem de preenchimento é diferente — não é um `setReactInput` simples, é necessário simular a interação com o componente. Inspecionar o DOM do formulário real para confirmar.

**Risco:** o formulário é uma SPA com múltiplas abas (Dados Pessoais, Endereço, Documentos). O botão deve preencher todas as abas, não só a visível. Verificar se o `react-hook-form` aceita valores em campos de abas não-ativas ou se é necessário navegar entre as abas durante o preenchimento.

---

## Passo 8 — Painel do Popup

**Objetivo:** criar o acordeão "Cadastro Automático" no popup da extensão, seguindo o padrão visual e de comportamento dos painéis existentes (LoginSection, ESocialPanel, etc.).

**O que se sabe:** o painel precisa mostrar o status de cada fonte (capturado ou não), um preview mínimo dos dados capturados (nome e CPF), botões para acionar cada extrator manualmente, e o botão principal de preenchimento. O padrão de acordeão, badges, botões e toasts já existe no projeto — basta seguir.

---

## Passo 9 — Wiring Final (App.tsx, Manifests, Build)

**Objetivo:** registrar tudo nos lugares corretos para que a extensão reconheça os novos scripts.

**O que se sabe:** é necessário adicionar o novo painel ao `App.tsx` (importar, adicionar ao estado de seções abertas, incluir no JSX). Nos manifests (Chrome e Firefox), registrar os três novos content scripts com seus respectivos `matches` e `run_at`. No `vite.config.scripts.ts`, adicionar as três novas entradas. No `build.js`, adicionar os três novos targets ao array.

---

## Ordem de Execução Recomendada

| # | Passo | Por quê essa ordem |
|---|-------|--------------------|
| 1 | Estrutura de dados | Tudo depende do contrato `PessoaData` |
| 2 | Extrator CadÚnico | É a fonte mais rica e já tem base no userscript |
| 3 | Dicionários de equivalência | Só dá pra construir depois de ver os dados reais |
| 4 | Filler do Vercel | Pode ser testado com dados manuais no storage |
| 5 | Painel do Popup | Pode ser construído com dados mockados |
| 6 | Extrator PesqBrasil | Depende de investigação de DOM/API |
| 7 | Extrator TSE | Depende de investigação de API |
| 8 | Message Router | Consolida os extratores |
| 9 | Wiring final | Só depois de tudo funcionando isoladamente |

---

## Premissas para o Gemini

- Nunca sobrescrever o `PessoaData` inteiro — sempre fazer merge campo a campo
- Usar o turbo logger em todo ponto de incerteza antes de assumir a estrutura de um dado
- Seguir os padrões já existentes no projeto — não criar novas abstrações desnecessárias
- Testar cada extrator isoladamente antes de integrar ao painel
- Os seletores DOM e URLs de API são hipóteses até serem confirmados em ambiente real
Analisei o plano fornecido pelo Claude e os seus feedbacks. Ele está muito bem estruturado, mas como o Claude não tem acesso direto aos arquivos do seu projeto, fiz alguns ajustes técnicos para garantir que a implementação funcione de primeira:

Pontos de Refinamento (Onde ajustei o plano):
Interceptação do CadÚnico: Diferente do que o Claude sugeriu (apenas um Content Script), precisaremos injetar um script no "Main World" (contexto da página) do CadÚnico. Content scripts comuns rodam em um mundo isolado e não conseguem interceptar o window.fetch que o CadÚnico usa. Farei essa ponte para capturar os tokens e o CPF automaticamente.
Investigação da API do TSE: Governos mudam APIs constantemente. Vou verificar se a consulta por CPF ainda é "aberta" ou se exige algum token gerado por CAPTCHA. Se houver CAPTCHA, automatizaremos a extração pela interface (Scraping) em vez de API direta.
Sistema de Build: Notei que o seu projeto tem um fluxo de build customizado (vite.config.scripts.ts, build.js). Precisaremos registrar os novos extratores e o filler do Vercel nesses arquivos para que eles sejam compilados corretamente.
Lógica de Merge: Concordo plenamente com o Claude. O StorageService será atualizado para garantir que os dados do CadÚnico não apaguem os dados do PesqBrasil, mas sim os complementem no objeto PessoaData.


Podemos seguir com a execução? Se sim, começarei definindo a estrutura de dados PessoaData e preparando o StorageService.

Analisar esse script é fundamental! Ele me dá o "mapa da mina" das APIs internas do CadÚnico.

Se ele parou de funcionar, os motivos prováveis são:

Mudança de Versão: O header CnasVersao: 1.35.00 pode estar obsoleto.
Estrutura de URL: O padrão do CPF nas URLs pode ter mudado levemente (ex: /v1/ para /v2/).
Segurança: O site pode estar bloqueando a interceptação simples de fetch ou exigindo novos headers de segurança (como o CnasVersao dinâmico).
Minha Estratégia Ajustada para o CadÚnico:
Vou converter esse UserScript em um "Bridge Script" nativo da extensão SIGESS:

Injeção: Vou injetar esse script no contexto da página (main world) para que ele tenha acesso ao window.fetch real, contornando o isolamento comum das extensões.
Captura Passiva: Em vez de um botão flutuante vermelho/verde na página (que polui o visual), o script enviará os tokens silenciosamente para o popup da extensão via postMessage.
Extração Robusta: No popup do SIGESS, o botão "Extrair Dados" usará os tokens capturados para chamar as APIs que você mapeou (informacoes-detalhadas, membros, etc.), mas com headers atualizados que vou investigar via Turbo Logger.
Atualização do Plano de Dados (PessoaData):
Vou incluir os campos do pessoaEscolaridadeDTO que o script extrai, mapeando-os para os campos do seu formulário no Vercel (como sabeLerEEscrever -> alfabetizado).



