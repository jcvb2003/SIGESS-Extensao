# SIGESS — Extensão de Navegador

Extensão Firefox/Chrome que automatiza tarefas repetitivas em sistemas governamentais brasileiros usados por sindicatos de pesca artesanal.

**Versão:** 3.1.8

## Funcionalidades

| Módulo | O que automatiza |
|--------|-----------------|
| **Login múltiplo** | Abre múltiplas abas e realiza logins em lote a partir de lista de credenciais |
| **eSocial** | Redirecionamento pós-login, preenchimento de competências (ano/mês), valores de GPS |
| **REAP MPA** | Formulário completo em `mpa.gov.br` — espécies, quantidades, preços (2021–2025) |
| **REAP Agro** | Formulário completo em `agro.gov.br` — mesmas capacidades do MPA |
| **Credenciais via link** | Processamento seguro de credenciais compartilhadas por link |

> Dados de login ficam **exclusivamente no computador do usuário** — nada é enviado para servidores externos.

## Stack

- TypeScript + React 18 + Vite
- Supabase Realtime (sincronização de configurações)
- Vitest (testes unitários)
- web-ext (empacotamento Firefox)
- javascript-obfuscator (proteção de código no build)

## Início rápido

```bash
cp .env.example .env       # apenas variáveis não sensíveis de desenvolvimento
npm install

npm run build:firefox      # → dist/firefox/
npm run build:chrome       # → dist/chrome/
npm run dev:firefox        # build + abre Firefox com extensão carregada
npm run test               # vitest
```

### Variáveis de ambiente

```env
O licenciamento usa `https://api.sigess.com.br`; nenhum segredo de validação
é incorporado ao XPI. A extensão contém somente a chave pública ES256.
```

## Estrutura

```
src/
├── background/        # Service worker + roteamento de mensagens
├── entries/           # Entry points de build
│   ├── content-script.ts
│   ├── reap.ts
│   ├── sdpa.ts
│   └── auto-registration.ts
├── modules/
│   ├── automation/
│   ├── esocial/       # Automação portal eSocial
│   ├── reap-agro/     # Automação portal Agro
│   └── reap-mpa/      # Automação portal MPA
├── popup/             # UI React do popup
└── shared/            # Tipos, serviços, utilitários

manifests/
├── manifest.firefox.json
└── manifest.chrome.json
```

## Distribuição (Firefox)

```bash
npm run package    # gera .xpi em web-ext-artifacts/
npm run sign       # assina via Mozilla AMO (requer WEB_EXT_API_KEY + WEB_EXT_API_SECRET)
```

Após publicar nova versão, atualizar `updates.json` para o sistema de auto-update:

```bash
npm run update-manifest   # adiciona a versão atual ao updates.json
```
