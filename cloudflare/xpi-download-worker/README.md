# SIGESS XPI Download Worker

Expõe o XPI assinado da versão mais recente sem redirecionar o navegador para
o GitHub.

## Endpoints

- `GET /sigess.xpi`: transmite o XPI com `application/x-xpinstall`.
- `HEAD /sigess.xpi`: retorna os mesmos cabeçalhos sem corpo.
- `GET /health`: verificação simples de disponibilidade do Worker.

O `workers.dev` deve permanecer habilitado apenas durante a validação inicial.
Depois que `downloads.sigess.com.br` estiver ativo, altere `workers_dev` para
`false` e implante novamente.
