(function () {
  let capturedBearer = '';
  let capturedXSRF = '';
  let capturedCnas = '';
  let capturedCpf = '';

  const CPF_REGEX = /\/(?:pessoa|situacao-familia|membros|endereco)\/(\d{11}|\d{10})/;
  const TOKEN_API = '/v1/suporte/configuracao/token';

  let lastSentHash = '';
  let lastSentTime = 0;

  function checkAndSendTokens() {
    if (capturedBearer && capturedXSRF && capturedCpf) {
      const currentHash = `${capturedCpf}:${capturedBearer.slice(-10)}:${capturedXSRF.slice(-10)}`;
      const now = Date.now();

      // Só envia se os tokens mudaram ou se passou mais de 60 segundos
      if (currentHash !== lastSentHash || (now - lastSentTime > 60000)) {
        console.log("SIGESS: Enviando tokens do CadÚnico para a extensão...");
        lastSentHash = currentHash;
        lastSentTime = now;

        globalThis.postMessage({
          type: 'SIGESS_CADUNICO_ADV_TOKENS',
          payload: {
            bearer: capturedBearer,
            xsrf: capturedXSRF,
            cnas: capturedCnas || '1.36.02', // Versão padrão do Cnas
            cpf: capturedCpf
          }
        }, '*');
      }
    }
  }

  function getHeader(headers: any, name: string): string | null {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] || headers[name.toLowerCase()] || null;
  }

  function extractCpfFromText(text: string): string | null {
    if (!text) return null;
    const clean = text.trim().replace(/\D/g, '');
    return (clean.length >= 10 && clean.length <= 11) ? clean : null;
  }

  // Interceptação de Headers em Fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function(resource: any, init?: any) {
    const url = typeof resource === 'string' ? resource : (resource?.url || '');
    const resPromise = originalFetch.call(this, resource, init);

    // 1. Captura de Tokens nos Headers
    if (init?.headers) {
      const h_auth = getHeader(init.headers, 'Authorization');
      const h_xsrf = getHeader(init.headers, 'X-XSRF-TOKEN');
      const h_cnas = getHeader(init.headers, 'CnasVersao');
      
      if (h_auth) capturedBearer = h_auth;
      if (h_xsrf) capturedXSRF = h_xsrf;
      if (h_cnas) capturedCnas = h_cnas;
    }

    // 2. Captura de CPF na URL (padrão antigo/backup)
    if (url && typeof url === 'string' && CPF_REGEX.test(url)) {
      const match = url.match(CPF_REGEX);
      if (match?.[1]) {
        capturedCpf = match[1];
        console.log("SIGESS: CPF capturado via URL Fetch: " + capturedCpf);
      }
    }

    // 3. Captura de CPF no CORPO da Resposta (Nova âncora de resiliência)
    if (url && typeof url === 'string' && url.includes(TOKEN_API)) {
      resPromise.then(response => {
        if (response.ok) {
          response.clone().text().then(text => {
            const cpf = extractCpfFromText(text);
            if (cpf) {
              capturedCpf = cpf;
              console.log("SIGESS: CPF capturado via Suporte API (Fetch): " + capturedCpf);
              checkAndSendTokens();
            }
          });
        }
      }).catch(() => {});
    } else if (capturedBearer && capturedXSRF && capturedCpf) {
      checkAndSendTokens();
    }

    return resPromise;
  };

  // Interceptação de Headers em XHR
  const XHR = XMLHttpRequest.prototype;
  const setRequestHeader = XHR.setRequestHeader;
  const open = XHR.open;
  const send = XHR.send;

  XHR.open = function (this: any, _method: string, url: string | URL) {
    this._url = url;
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr && CPF_REGEX.test(urlStr)) {
      const match = urlStr.match(CPF_REGEX);
      if (match?.[1]) {
        capturedCpf = match[1];
        console.log("SIGESS: CPF capturado via URL XHR: " + capturedCpf);
      }
    }
    return (open as any).apply(this, arguments);
  };

  XHR.setRequestHeader = function (this: any, _header: string, _value: string) {
    if (_header.toLowerCase() === 'authorization') capturedBearer = _value;
    if (_header.toLowerCase() === 'x-xsrf-token') capturedXSRF = _value;
    if (_header.toLowerCase() === 'cnasversao') capturedCnas = _value;
    return (setRequestHeader as any).apply(this, arguments);
  };

  XHR.send = function (this: any) {
    const xhr = this;
    xhr.addEventListener('load', function() {
        const urlStr = xhr._url ? xhr._url.toString().toLowerCase() : '';
        if (urlStr.includes(TOKEN_API) && xhr.status === 200) {
            const raw = xhr.responseText || (xhr.response ? xhr.response.toString() : '');
            const cpf = extractCpfFromText(raw);
            if (cpf) {
                capturedCpf = cpf;
                console.log("SIGESS: CPF capturado via Suporte API (XHR): " + capturedCpf);
                checkAndSendTokens();
            }
        } else if (capturedBearer && capturedXSRF && capturedCpf) {
            checkAndSendTokens();
        }
    });
    return (send as any).apply(this, arguments);
  };

  console.log("SIGESS: CadÚnico Advanced Bridge Injected on " + globalThis.location.href);
})();
