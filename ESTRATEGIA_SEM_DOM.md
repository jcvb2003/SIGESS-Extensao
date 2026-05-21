# Estratégia: Remover Dependência do DOM

## Objetivo
Usar **APIs e HTTP requests** em vez de parsing DOM sempre que possível.

---

## Dados Disponíveis por Fonte

### 1. **Dados da Sessão** ✅ API
```
GET https://login.esocial.gov.br/api/v1/LoginESocialConsultas.svc/DadosSessao
↓
Response (JSONP): {
  "Nome": "MARIA CLARA VEIGA DO CARMO",
  "NI": "05605703250",
  "IDSessao": "...",
  ...
}
```
**Status**: ✅ JÁ IMPLEMENTADO

---

### 2. **Valores da Comercialização**
```
GET https://www.esocial.gov.br/portal/FolhaPagamento/SeguradoEspecial/ComercializacaoProducao?competencia=202605
↓
Response: HTML (contains)
<input name="[0].TiposComercializacao[0].ValorComercializado" value="375,00" />
```

**Problema**: HTML com inputs, não estruturado
**Solução**: Fetch + Parse HTML → Extract valor

---

### 3. **Dados de Competência/Boleto** (Declarado/Pago)
```
GET https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias
↓
Response: HTML (contains)
<tr>
  <td>Maio/2026</td>
  <td>20/06/2026</td>
  <td>Encerrado</td>
  <td>5,62</td>  <!-- Declarado (cells[3]) -->
  <td>5,62</td>  <!-- Pago (cells[4]) -->
</tr>
```

**Problema**: HTML em tabela, índices frágeis
**Solução**: Fetch + Parse HTML → Extract por header matching

---

## Nova Arquitetura

### Função: `fetchBoletoData(competencia: string)`

```typescript
export async function fetchBoletoData(competencia: string): Promise<{
  valorDeclarado: number;
  valorPago: number;
  situacao: string;
  emissaoUrl: string | null;
}> {
  // Já temos isso implementado em gps-flow.ts:extractGuiaExistenteInfo()
  // Mas podemos melhorar:
  
  // 1. Fetch HTML da página de competências
  const html = await fetch(
    `/portal/FolhaPagamento/Listagem/Competencias?ano=2026`
  ).then(r => r.text());
  
  // 2. Parse HTML
  const doc = parseHtml(html);
  
  // 3. Find table row for competencia
  const row = doc.querySelector(`table tbody tr:has(a[href*="competencia=${competencia}"])`);
  
  // 4. Extract values by column order (more reliable than cells[3])
  const cells = Array.from(row.querySelectorAll("td"));
  // competencia | vencimento | situacao | declarado | pago | detalhe | acoes
  const valorDeclarado = extractMoneyValues(cells[3]?.textContent || "")[0] ?? 0;
  const valorPago = extractMoneyValues(cells[4]?.textContent || "")[0] ?? 0;
  
  // 5. Return structured data
  return {
    valorDeclarado,
    valorPago,
    situacao: cells[2]?.textContent?.trim(),
    emissaoUrl: findEmitirGuiaUrl(row)
  };
}
```

---

### Função: `fetchComercializacaoData(competencia: string)`

```typescript
export async function fetchComercializacaoData(competencia: string): Promise<{
  valorComercializado: number;
}> {
  // 1. Fetch HTML da página de comercialização
  const html = await fetch(
    `/portal/FolhaPagamento/SeguradoEspecial/ComercializacaoProducao?competencia=${competencia}`
  ).then(r => r.text());
  
  // 2. Parse HTML
  const doc = parseHtml(html);
  
  // 3. Extract from input[name*="ValorComercializado"]
  const input = doc.querySelector(
    'input[name*="TiposComercializacao"][name*="ValorComercializado"]'
  ) as HTMLInputElement;
  
  const valorComercializado = extractMoneyValues(input?.value || "")[0] ?? 0;
  
  return { valorComercializado };
}
```

---

## Hierarquia Final de Dados

### Para **Nome e CPF**:
1. ✅ API: `DadosSessao` (sessão logada atual)
2. Fallback: `window.nomeUsuario` (global)
3. Fallback: Storage (credenciais_*)
4. Fallback: DOM extraction

### Para **Valor Declarado**:
1. ✅ HTTP Fetch: `/portal/FolhaPagamento/Listagem/Competencias`
   - Parse HTML table
   - Extract row by competencia
   - Get cells[3] (Declarado)
2. Se falhar: reportar erro (não usar 0 como default)

### Para **Valor Pago**:
1. ✅ HTTP Fetch: `/portal/FolhaPagamento/Listagem/Competencias`
   - Parse HTML table
   - Extract row by competencia
   - Get cells[4] (Pago)

### Para **Valor Comercializado**:
1. ✅ HTTP Fetch: `/portal/FolhaPagamento/SeguradoEspecial/ComercializacaoProducao`
   - Parse HTML form
   - Extract inputs com `ValorComercializado`
   - Sum ou get primeiro valor

---

## Quando DOM é Necessário

✅ **OK usar DOM**:
- `observarBotaoEmitirGuia()` - precisa observar DOM para botões
- `resolveGuiaDownloadUrlFromAnchor()` - elemento já está no DOM
- Modal/overlay updates via `renderEsocialProgressOverlay()`

❌ **Evitar DOM**:
- ~~Extrair values de tabelas em outras páginas~~ → Usar Fetch
- ~~Ler window.nomeUsuario~~ → Usar API DadosSessao
- ~~Extrair competência do DOM~~ → Usar parâmetros/storage

---

## Benefícios

| Problema Anterior | Solução Nova |
|------------------|------------|
| Nome vinha errado (global pollution) | API DadosSessao per-tab |
| Valor Declarado = 0 (índices frágeis) | Fetch + robust parsing |
| Dependência de estar em página X | Fetch + parse em qualquer contexto |
| Window globals contaminavam tabs | API call por tab |
| DOM parsing frágil a mudanças | Fetch data structure, parse once |

---

## Implementação

1. **Criar `esocial-api-data.ts`**:
   - `fetchBoletoData(competencia)`
   - `fetchComercializacaoData(competencia)`
   
2. **Usar em `gps-flow.ts`**:
   - Trocar `extractGuiaExistenteInfo()` por `fetchBoletoData()`
   - Trocar `extrairValorTotalComercializado()` por `fetchComercializacaoData()`

3. **Manter no `esocial-extractors.ts`**:
   - `fetchEsocialSessionData()` (já temos)
   - `getBestNome()` com API priority
   - `getBestCpf()` com API priority

---

## Teste de Validação

Para cada valor retornado:
```typescript
if (valorDeclarado === 0 && valorPago > 0) {
  console.warn("[SIGESS] Valor Declarado extraído como 0, algo está errado!");
}
```

Se isso acontecer:
1. Log HTML de debug
2. Retornar valorDeclarado = valorPago (fallback safety)
3. Notificar usuário sobre extraction failure
