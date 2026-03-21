---
description: Como gerar o arquivo .xpi para o Firefox
---

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
1. Execute `web-ext sign --api-key <sua-key> --api-secret <seu-secret>`.
2. O arquivo `.xpi` assinado poderá ser arrastado para o Firefox para instalação permanente.
