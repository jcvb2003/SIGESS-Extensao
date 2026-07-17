export class BridgeInjector {
  private readonly injected = new Set<string>();

  inject(assetPath: string): void {
    if (this.injected.has(assetPath)) return;
    this.injected.add(assetPath);
    try {
      const api = (globalThis.browser || globalThis.chrome) as any;
      const script = document.createElement("script");
      script.src = api.runtime.getURL(assetPath);
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error(`SIGESS: Erro ao injetar bridge ${assetPath}`, error);
    }
  }
}
