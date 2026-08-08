(function () {
  // Prevent multiple injections in the same frame
  if ((globalThis as any).__sigessCaepfBridgeLoaded) return;
  (globalThis as any).__sigessCaepfBridgeLoaded = true;

  const XHR = XMLHttpRequest.prototype;
  const send = XHR.send;
  const open = XHR.open;

  function publishSearchResult(data: unknown): void {
    if (Array.isArray(data) && data.length === 0) {
      console.log("SIGESS: CAEPF sem dados cadastrados.");
      globalThis.postMessage({
        type: "SIGESS_CAEPF_NOT_FOUND",
      }, globalThis.location.origin);
      return;
    }

    if (!data) {
      console.warn("SIGESS: Resposta vazia ou invÃ¡lida para pesquisa CAEPF.");
      return;
    }

    console.log("SIGESS: Enviando payload SIGESS_CAEPF_RAW_DATA para extensÃ£o...");
    globalThis.postMessage({
      type: "SIGESS_CAEPF_RAW_DATA",
      payload: data,
    }, globalThis.location.origin);
  }

  XHR.open = function (_method, url) {
    (this as any)._url = url;
    return (open as any).apply(this, arguments);
  };

  XHR.send = function () {
    // Usamos readystatechange para garantir que capturamos quando DONE e STATUS 200
    this.addEventListener('readystatechange', function () {
      if (this.readyState !== 4) return;
      
      const url = String((this as any)._url).toLowerCase();
      if (url.includes('/caepf-main/api/v1/aepfs/pesquisa')) {
        console.log(`SIGESS: Requisição XHR concluída em ${url} (status: ${this.status}, type: ${this.responseType})`);
        
        if (this.status !== 200) {
          console.warn(`SIGESS: Ignorando XHR com status ${this.status} para ${url}`);
          return;
        }

        try {
          let data = null;
          
          // Se o Angular define responseType:'json', this.responseText fica inacessível
          if (this.responseType === 'json') {
            data = this.response;
          } else {
            const text = this.responseText;
            if (text) {
              try {
                data = JSON.parse(text);
              } catch (e) {
                data = this.response; // Fallback para o objeto bruto se falhar o parse
              }
            } else {
              data = this.response;
            }
          }

          if (Array.isArray(data) && data.length === 0) {
            publishSearchResult(data);
          } else if (data) {
            console.log("SIGESS: Enviando payload SIGESS_CAEPF_RAW_DATA para extensão...");
            globalThis.postMessage({
              type: 'SIGESS_CAEPF_RAW_DATA',
              payload: data
            }, globalThis.location.origin);
          } else {
            console.warn("SIGESS: Resposta XHR vazia ou inválida para " + url);
          }
        } catch (e) {
          console.error("SIGESS: Erro crítico ao ler resposta XHR CAEPF", e);
        }
      }
    });
    return (send as any).apply(this, arguments);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

    if (String(url).includes('/caepf-main/api/v1/aepfs/pesquisa')) {
      if (response.status === 200) {
        const clone = response.clone();
        clone.json().then(data => {
          if (Array.isArray(data) && data.length === 0) {
            publishSearchResult(data);
            return;
          }
          console.log("SIGESS: Enviando payload SIGESS_CAEPF_RAW_DATA para extensão (Fetch)...");
          globalThis.postMessage({
            type: 'SIGESS_CAEPF_RAW_DATA',
            payload: data
          }, globalThis.location.origin);
        }).catch(e => console.error("SIGESS: Erro ao capturar Fetch CAEPF", e));
      }
    }
    return response;
  };

  console.log("SIGESS: CAEPF Bridge Injected");
})();
