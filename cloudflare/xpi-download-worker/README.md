# SIGESS XPI Download Worker

Expõe o manifesto de atualização e os XPIs assinados sem redirecionar o
navegador para o GitHub.

## Endpoints

- `GET /sigess.xpi`: transmite o XPI mais recente com `application/x-xpinstall`.
- `HEAD /sigess.xpi`: retorna os mesmos cabeçalhos sem corpo.
- `GET /updates.json`: transmite o manifesto de atualização do Firefox.
- `GET /releases/vX.Y.Z/sigess.xpi`: transmite uma versão assinada específica.
- `GET /health`: verificação simples de disponibilidade do Worker.

O `workers.dev` deve permanecer desativado. A superfície pública oficial é
`downloads.sigess.com.br`.
