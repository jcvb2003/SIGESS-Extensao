/**
 * Responsável por logs coloridos no console do desenvolvedor.
 * Substitui o antigo TurboLogger e padroniza o prefixo [SIGESS].
 *
 * Para ativar logs de diagnóstico detalhados no console do portal:
 *   window.__SIGESS_DIAGNOSTICS = true
 * ou, para persistir entre recargas:
 *   DebugLogger.diagnostics = true
 */
export class DebugLogger {
  /** Liga/desliga logs de diagnóstico detalhados em tempo de execução. */
  static diagnostics: boolean = false;

  private category: string;

  constructor(category: string = "GENERAL") {
    this.category = category.toUpperCase();
  }

  log(msg: string, type: "info" | "success" | "warn" | "error" = "info") {
    const colors = {
      info: "#cbd5e1",
      success: "#10b981",
      warn: "#f59e0b",
      error: "#ef4444",
    };

    const styles = `color: ${colors[type]}; font-weight: bold;`;
    console.log(`%c[SIGESS DEBUG][${this.category}] ${msg}`, styles);
  }

  error(msg: string, err?: any) {
    console.error(`[SIGESS DEBUG][${this.category}] ERROR: ${msg}`, err);
  }

  warn(msg: string) {
    console.warn(`[SIGESS DEBUG][${this.category}] WARN: ${msg}`);
  }

  /** Loga apenas quando diagnostics está ativado. Aceita dados extras opcionais. */
  diag(msg: string, data?: any) {
    if (!DebugLogger.diagnostics && !(globalThis as any).__SIGESS_DIAGNOSTICS) return;
    if (data !== undefined) {
      console.log(`%c[SIGESS DIAG][${this.category}] ${msg}`, "color: #a78bfa; font-weight: bold;", data);
    } else {
      console.log(`%c[SIGESS DIAG][${this.category}] ${msg}`, "color: #a78bfa; font-weight: bold;");
    }
  }
}
