# SIGESS XPI Download Worker

O Worker mantém o repositório privado e oferece os arquivos necessários ao
Firefox em `downloads.sigess.com.br`. Ele lê o manifesto e o XPI assinado pela
API do GitHub, transmitindo o XPI sem gravá-lo em R2. O cache curto de cinco
minutos preserva o comportamento atual do endpoint de download.

## Endpoints

- `GET /instalar`: exibe a página de instalação e inicia o download após 3 s.
- `GET /sigess.xpi`: transmite a release mais recente como
  `application/x-xpinstall`.
- `GET /sigess.xpi?version=x.y.z`: transmite a release indicada pelo manifesto,
  evitando que o cache de `/releases/latest` entregue uma versão anterior.
- `HEAD /sigess.xpi`: retorna metadados sem baixar o asset.
- `GET /updates.json`: lê `updates.json` do branch `main` e troca o link da
  versão mais recente por `/sigess.xpi?version=x.y.z` nesta origem.
- `HEAD /updates.json`: retorna os cabeçalhos do manifesto sem corpo.
- `GET /health`: verificação simples de disponibilidade do Worker.

O arquivo `updates.json` no GitHub continua contendo links diretos para GitHub
Releases. Isso mantém o fluxo legado para extensões já instaladas. Apenas a
resposta servida pelo Worker é reescrita para que versões migradas consultem o
XPI via Cloudflare.

## Acesso ao repositório

Crie um Fine-grained Personal Access Token limitado ao repositório
`jcvb2003/SIGESS-Extensao`, com a permissão `Contents: Read`. Configure-o como
secret do Worker, sem adicioná-lo ao código ou ao `wrangler.jsonc`:

```sh
npx wrangler secret put GITHUB_READ_TOKEN
```

Execute o comando neste diretório e informe o token no prompt. A configuração
marca esse secret como obrigatório para o deploy. Se o token expirar ou for
revogado, `/updates.json` e `/sigess.xpi` responderão com erro temporário; a
página `/instalar` e `/health` continuarão disponíveis.

O XPI e o manifesto continuam públicos nos endpoints Cloudflare, como exige a
distribuição do Firefox. O repositório, o código-fonte e o histórico não são
expostos por essas rotas.

O `workers.dev` deve permanecer habilitado apenas durante a validação inicial.
Depois que `downloads.sigess.com.br` estiver ativo, mantenha `workers_dev` como
`false`.
