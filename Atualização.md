# Walkthrough - Configuração de Atualizações via GitHub

A extensão SIGESS agora está configurada para receber atualizações automáticas hospedadas em seu repositório GitHub.

## Alterações Realizadas

### 1. Manifest da Extensão
O arquivo [public/manifest.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/public/manifest.json) foi atualizado para apontar para o novo repositório:
- **ID**: `{e9df396f-bdd8-4e79-bc7c-92017a928891}`
- **Update URL**: `https://raw.githubusercontent.com/jcvb2003/SIGESS-Extensao/main/updates.json`

### 2. Manifesto de Atualização ([updates.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/updates.json))
Criado o arquivo [updates.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/updates.json) na raiz do projeto. Este arquivo é o que o Firefox consulta para saber se há uma nova versão disponível.

### 3. Automação no [package.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/package.json)
Adicionado o script `update-manifest`:
```json
"update-manifest": "node -e \"...\""
```
Este script adiciona automaticamente a versão atual do [package.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/package.json) ao [updates.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/updates.json), gerando o link correto para o release no GitHub.

## Como Lançar uma Nova Versão

Para enviar uma atualização para os usuários, siga estes passos:

1. **Atualize a versão**: No [package.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/package.json), aumente o campo `"version"` (ex: de `2.5.0` para `2.5.1`).
2. **Atualize o manifesto de atualização**:
   ```bash
   npm run update-manifest
   ```
3. **Gere o pacote (.xpi)**:
   ```bash
   npm run package
   ```
4. **Assine a extensão**: Use o `web-ext sign` (conforme descrito no [README.md](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/README.md) / workflow `/package`) para obter o arquivo `.xpi` assinado pela Mozilla.
5. **Crie um Release no GitHub**:
   - Vá para o seu repositório: [SIGESS-Extensao](https://github.com/jcvb2003/SIGESS-Extensao)
   - Crie um novo Release com a tag correspondente (ex: `v2.5.1`).
   - **IMPORTANTE**: Faça o upload do arquivo `.xpi` assinado e nomeie-o exatamente como `sigess.xpi`.
6. **Push**: Envie as alterações do código e do [updates.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/updates.json) para o branch `main`.

---
> [!TIP]
> O Firefox verifica atualizações periodicamente. Usuários que já tenham a versão 2.5.0 instalada (assinada) receberão a notificação de atualização assim que o [updates.json](file:///d:/Projetos%20Dev/REPOSITORIOS/Exten%C3%A7%C3%A3o%20Firefox/updates.json) for atualizado e o release estiver disponível.
