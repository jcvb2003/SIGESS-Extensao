const globalRef = globalThis as any;

if (
  typeof globalRef.browser === "undefined" &&
  typeof globalRef.chrome !== "undefined"
) {
  globalRef.browser = globalRef.chrome;
}

// Normalização para MV2 (Firefox) / MV3 (Chrome)
if (typeof globalRef.browser !== "undefined") {
  // Se browser.action não existe (MV2), mas browserAction existe
  if (!globalRef.browser.action && globalRef.browser.browserAction) {
    globalRef.browser.action = globalRef.browser.browserAction;
  }
}

