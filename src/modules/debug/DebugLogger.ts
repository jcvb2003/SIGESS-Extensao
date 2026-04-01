/**
 * Responsável por logs coloridos no console do desenvolvedor.
 * Substitui o antigo TurboLogger e padroniza o prefixo [SIGESS].
 */
export class DebugLogger {
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
}
