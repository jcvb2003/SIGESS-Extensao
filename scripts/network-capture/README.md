# Análise de candidatos a cache com mitmproxy

Este utilitário é externo ao módulo de cache da extensão. Ele mede o tráfego observado pelo Firefox e compara uma execução fria com uma execução aquecida.

O addon não grava corpo de resposta, cookies ou tokens. Cada linha do arquivo JSONL contém apenas metadados de rede e tamanhos do corpo transmitido/descompactado.

## 1. Preparar o Firefox

Use um perfil separado para o diagnóstico. Configure o proxy HTTP/HTTPS como `127.0.0.1:8080` e, na primeira execução, abra `http://mitm.it` para instalar o certificado do mitmproxy nesse perfil.

## 2. Captura fria

Com o cache desativado no Network Monitor do Firefox, execute:

```powershell
& 'C:\Users\José Carlos\AppData\Roaming\Python\Python313\Scripts\mitmdump.exe' --listen-host 127.0.0.1 --listen-port 8080 `
  -s .\scripts\network-capture\mitmproxy-addon.py `
  --set "sigess_output=$((Join-Path $PWD 'cold.jsonl'))" `
  --set sigess_hosts=www.tse.jus.br,meu.inss.gov.br,sso.acesso.gov.br,servicos.mte.gov.br,pesqbrasil-pescadorprofissional.mpa.gov.br,cadunico.dataprev.gov.br,cav.receita.fazenda.gov.br,www.receita.fazenda.gov.br
```

Execute o fluxo do portal uma vez e encerre o `mitmdump` com `Ctrl+C`.

## 3. Captura aquecida

Limpe o arquivo anterior, habilite novamente o cache do Firefox e repita exatamente o mesmo fluxo:

```powershell
& 'C:\Users\José Carlos\AppData\Roaming\Python\Python313\Scripts\mitmdump.exe' --listen-host 127.0.0.1 --listen-port 8080 `
  -s .\scripts\network-capture\mitmproxy-addon.py `
  --set "sigess_output=$((Join-Path $PWD 'warm.jsonl'))" `
  --set sigess_hosts=www.tse.jus.br,meu.inss.gov.br,sso.acesso.gov.br,servicos.mte.gov.br,pesqbrasil-pescadorprofissional.mpa.gov.br,cadunico.dataprev.gov.br,cav.receita.fazenda.gov.br,www.receita.fazenda.gov.br
```

## 4. Comparar

```powershell
node .\scripts\network-capture\compare-captures.mjs `
  --cold .\cold.jsonl `
  --warm .\warm.jsonl `
  --output .\sigess-network-candidates.json
```

O relatório classifica recursos estáticos repetidos como `high-potential` ou `candidate`. Ele também preserva a diferença entre recurso que voltou à rede e recurso que não foi observado na captura aquecida.
