(function () {
  const XHR = XMLHttpRequest.prototype;
  const send = XHR.send;
  const open = XHR.open;

  XHR.open = function (this: XMLHttpRequest, _method: string, url: string | URL) {
    (this as any)._url = url;
    return open.apply(this, arguments as any);
  };

  XHR.send = function (this: XMLHttpRequest) {
    this.addEventListener('load', function () {
      const url = String((this as any)._url);
      if (url.includes('/registro/') && (url.includes('/dados-pessoais') || url.includes('visualizar'))) {
        handlePayload(this.responseText, url, "XHR");
      }
    });
    return send.apply(this, arguments as any);
  };

  const NEXT_ACTION_CONFIG = 'f2152988ad11ba6240ed4e87ccf34966d66e391a';

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    const input = args[0];
    const init = args[1] || {};
    const urlStr = String(typeof input === 'string' ? input : (input as any).url || input);
    
    const getHeader = (h: any, name: string): string => {
      if (!h) return '';
      if (typeof h.get === 'function') return h.get(name) || '';
      if (typeof h === 'object') {
        const found = Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase());
        return found ? String(found[1]) : '';
      }
      return '';
    };

    const action = getHeader(init.headers, 'Next-Action');
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));

    // Caso 1: Deteção de ID via Resposta RSC (Configuração)
    if (action === NEXT_ACTION_CONFIG) {
       const clone = response.clone();
       clone.text().then(text => {
         // O formato RSC do Next.js coloca dados em linhas precedidas por IDs (1:, 2:, etc)
         const jsonLine = text.split('\n').find(l => l.startsWith('1:'));
         if (!jsonLine) return;
         try {
           const obj = JSON.parse(jsonLine.slice(2)); // remove o prefixo "1:"
           const registroId = obj?.configuracoes?.solicitacaoAtiva?.id;
           if (registroId) {
             console.log(`[SIGESS] ID identificado na resposta RSC: ${registroId}`);
             triggerAutoFetch(registroId);
           }
         } catch {}
       }).catch(() => {});
    }

    // Caso 2: Captura normal (Navegação/Visualização)
    if (urlStr.includes('/registro/') && (urlStr.includes('/dados-pessoais') || urlStr.includes('visualizar'))) {
       const clone = response.clone();
       clone.text().then((text: string) => {
         handlePayload(text, urlStr, "Direct Fetch");
       }).catch((_e: any) => {});
    }

    return response;
  };

  function triggerAutoFetch(id: string | number) {
     if ((globalThis as any)._sigessPesqBrasilBusy) return;
     (globalThis as any)._sigessPesqBrasilBusy = true;

     console.log(`[SIGESS] Disparando captura automática para registro: ${id}`);
     originalFetch(
       `/registro/${id}/edicao-registro/dados-pessoais?_rsc=sigess`,
       { headers: { 'Accept': 'text/x-component', 'RSC': '1' } }
     ).then(r => r.text()).then(text => {
       handlePayload(text, `/registro/${id}`, "Auto-Fetch RSC");
     }).catch((_e: any) => {});
  }

  function handlePayload(text: string, url: string, source: string) {
    if (!text) return;
    const hasData = text.includes('"defaultValues"') || text.includes('"dadosPessoais"') || text.includes('"codigoRGP"');
    if (hasData) {
      console.log(`SIGESS: Dados detectados em ${url} (${source}). Enviando...`);
      globalThis.postMessage({ type: 'SIGESS_PESQBRASIL_RAW_DATA', payload: text }, '*');
    }
  }

  console.log("SIGESS: PesqBrasil Bridge Active (v5.0-api)");
})();


