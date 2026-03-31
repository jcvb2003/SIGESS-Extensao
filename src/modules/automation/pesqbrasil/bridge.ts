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
      const url = String((this as any)._url).toLowerCase();
      
      // Log para debug de rede (visível no console do navegador)
      if (url.includes('pesqbrasil') || url.includes('dados-pessoais')) {
         console.log("[SIGESS Bridge] Verificando XHR:", url);
      }

      // Intercepta se a URL parecer relevante para dados
      if (url.includes('/registro/') || url.includes('/dados-pessoais') || url === '/' || url.endsWith('.mpa.gov.br/')) {
        handlePayload(this.responseText, "XHR");
      }
    });
    return send.apply(this, arguments as any);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const urlStr = String(url).toLowerCase();

    if (urlStr.includes('pesqbrasil') || urlStr.includes('dados-pessoais')) {
        console.log("[SIGESS Bridge] Verificando Fetch:", urlStr);
    }

    if (urlStr.includes('/registro/') || urlStr.includes('/dados-pessoais') || urlStr === '/' || urlStr.endsWith('.mpa.gov.br/')) {
      const clone = response.clone();
      clone.text().then(text => {
        handlePayload(text, "Fetch");
      }).catch(e => console.error("SIGESS: Erro ao ler fetch PesqBrasil", e));
    }
    return response;
  };

  function handlePayload(text: string, source: string) {
    if (!text) return;

    // Verificação rápida de conteúdo para evitar processar tudo
    const isRSC = text.includes('0:[') || text.includes('1:[');
    const hasData = text.includes('"defaultValues"') || text.includes('"dadosPessoais"') || text.includes('"cpf"');

    if (isRSC && hasData) {
      console.log(`SIGESS: Payload RSC (${source}) do PesqBrasil detectado, enviando...`);
      globalThis.postMessage({
        type: 'SIGESS_PESQBRASIL_RAW_DATA',
        payload: text
      }, '*');
    }
  }

  console.log("SIGESS: PesqBrasil Bridge Injected (v2.8)");
})();
