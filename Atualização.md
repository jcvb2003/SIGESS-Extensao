# Atualizações Firefox: GitHub e Cloudflare

O SIGESS mantém dois caminhos compatíveis durante a migração:

- **GitHub legado:** versões já instaladas continuam consultando o `update_url`
  que veio no XPI original. O `updates.json` no branch `main` mantém links
  diretos para os assets das Releases do GitHub.
- **Cloudflare:** novas versões apontam o Firefox para
  `https://downloads.sigess.com.br/updates.json`. O Worker lê o manifesto e o
  XPI assinado do repositório privado usando o secret `GITHUB_READ_TOKEN`. Na
  resposta do Worker, o link da versão mais recente é reescrito para
  `https://downloads.sigess.com.br/sigess.xpi?version=x.y.z`, garantindo que o
  pacote baixado corresponda à versão do manifesto.

O XPI assinado é transmitido pelo Worker; não é armazenado em R2. O token deve
ser um Fine-grained Personal Access Token limitado a
`jcvb2003/SIGESS-Extensao`, com `Contents: Read`, e configurado como secret no
Worker. Consulte [o README do Worker](cloudflare/xpi-download-worker/README.md)
para os detalhes de configuração.

## Manifesto e `updates.json`

O `update_url` de novos builds Firefox está em
[`manifests/manifest.firefox.json`](manifests/manifest.firefox.json). Alterar
esse arquivo não altera os XPI já instalados: eles precisam receber uma versão
assinada mais nova para mudar para o Worker.

O script `npm run update-manifest` continua gerando um `update_link` direto para
GitHub Releases. Isso é intencional: mantém as instalações antigas funcionando
durante a janela de coexistência. O Worker transforma somente sua própria
resposta e não altera o `updates.json` armazenado no GitHub.

## Como Lançar uma Nova Versão

Para enviar uma atualização para os usuários, siga estes passos:

1. **Prepare o Cloudflare:** configure `GITHUB_READ_TOKEN` e implante o Worker atualizado. Confirme que `/updates.json` e `/sigess.xpi` respondem antes de publicar a versão ponte.
2. **Atualize a versão**: No `package.json`, aumente o campo `"version"` (por exemplo, para a próxima versão patch).
3. **Atualize o manifesto de atualização**:
   ```bash
   npm run update-manifest
   ```
4. **Gere o pacote (.xpi)**:
   ```bash
   npm run package
   ```
5. **Assine a extensão**:
   ```bash
   npm run sign
   ```
   Isso gerará o arquivo `.xpi` assinado pela Mozilla na pasta `web-ext-artifacts/`.
6. **Crie um Release no GitHub**:
   - Vá para o seu repositório: [SIGESS-Extensao](https://github.com/jcvb2003/SIGESS-Extensao)
   - Crie um novo Release com a tag correspondente (ex: `v2.5.1`).
   - **IMPORTANTE**: Faça o upload do arquivo `.xpi` assinado e nomeie-o exatamente como `sigess.xpi`.
7. **Push**: Envie as alterações aprovadas do código e do `updates.json` para o branch `main`.

### Período de coexistência

Mantenha o repositório público por um mês a partir da publicação e verificação
da versão ponte. Durante esse período, instalações antigas continuam lendo o
manifesto do GitHub e baixando o XPI da Release diretamente; após instalar a
versão ponte, as próximas verificações passam pelo Worker. Quem não atualizar
durante a janela poderá precisar instalar uma versão manualmente.

### Comando único do ciclo completo

Com o terminal aberto na raiz do projeto e o `.env` preenchido com as credenciais do Mozilla AMO, execute no PowerShell:

```powershell
$ErrorActionPreference = 'Stop'; $dirty = git status --porcelain; if ($dirty) { throw "Working tree suja antes da release:`n$dirty" }; cmd /c npm version patch --no-git-tag-version; $pkg = Get-Content package.json -Raw | ConvertFrom-Json; $version = $pkg.version; cmd /c npm run update-manifest; Get-Content .env | ForEach-Object { if ($_ -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }; cmd /c npm run sign; $signed = "web-ext-artifacts/05cdfad4e363424a8770-$version.xpi"; if (!(Test-Path $signed)) { throw "XPI assinado não encontrado: $signed" }; Copy-Item -LiteralPath $signed -Destination web-ext-artifacts/sigess.xpi -Force; git add package.json package-lock.json updates.json; git commit -m "chore(release): v$version"; git tag "v$version"; git push origin main; git push origin "v$version"; gh release create "v$version" web-ext-artifacts/sigess.xpi --title "v$version" --notes "Release v$version"; gh release view "v$version" --json tagName,name,url,assets
```

O comando interrompe a execução se houver alterações não commitadas, incrementa a versão de patch, atualiza o manifesto, envia a extensão ao Mozilla para assinatura, publica o `sigess.xpi` no GitHub Releases e confirma os dados da publicação.

---

> [!TIP]
> O Firefox verifica atualizações periodicamente. Usuários que já tenham a versão 2.5.0 instalada (assinada) receberão a notificação de atualização assim que o [updates.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/updates.json) for atualizado e o release estiver disponível.

Como gerar o arquivo .xpi para o Firefox

# Fluxo de Empacotamento (.xpi)

Este workflow descreve como gerar o arquivo de instalação `.xpi` para o Firefox.

## Pré-requisitos

- Node.js instalado
- Ferramenta `web-ext` instalada globalmente (`npm install --global web-ext`)

## Passos para Gerar o .xpi

1. Abra o terminal na pasta raiz do projeto.
2. Execute o comando de empacotamento:

```bash
npm run package
```

3. O arquivo `.xpi` será gerado na pasta `web-ext-artifacts/` dentro da raiz do projeto.

## Como carregar no Firefox (Desenvolvimento)

1. Abra o Firefox e digite `about:debugging` na barra de endereços.
2. Clique em "Este Firefox" (ou "This Firefox").
3. Clique em "Carregar extensão temporária..." (ou "Load Temporary Add-on...").
4. Selecione o arquivo `manifest.json` dentro da pasta `dist/` (NÃO o arquivo .xpi).

## Como Instalar Definitivamente

Para instalar permanentemente, a extensão precisa ser assinada pela Mozilla (via AMO - Add-ons for Firefox).

1. Configure as credenciais no arquivo `.env` e execute `npm run sign`.
2. O arquivo `.xpi` assinado poderá ser arrastado para o Firefox para instalação permanente.
