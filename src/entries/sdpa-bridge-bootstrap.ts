import "../shared/utils/browser-shim";

const api = (globalThis.browser || (globalThis as any).chrome) as any;
const marker = "__sigessSdpaBridgeBootstrapInjected";

if (!(globalThis as any)[marker]) {
  (globalThis as any)[marker] = true;
  const script = document.createElement("script");
  script.src = api.runtime.getURL("assets/sdpa_page_bridge.js");
  (document.head || document.documentElement).appendChild(script);
}
