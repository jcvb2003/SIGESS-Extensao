/**
 * Gerenciador centralizado de Badge (etiqueta) do ícone da extensão.
 * Resolve conflitos entre notificações de atualização e contador da fila de login.
 */
export class BadgeManager {
  private static hasUpdate = false;
  private static queueCount = 0;

  /**
   * Define se há uma atualização pendente.
   * Updates têm prioridade visual (!) sobre a contagem da fila.
   */
  static setUpdate(active: boolean) {
    this.hasUpdate = active;
    this.refresh();
  }

  /**
   * Define a contagem de itens na fila de login.
   */
  static setQueueCount(count: number) {
    this.queueCount = count;
    this.refresh();
  }

  private static async refresh() {
    if (typeof browser === 'undefined' && typeof chrome === 'undefined') return;
    
    // Resolve API (MV2/MV3)
    const api = typeof browser === 'undefined' ? (chrome as any) : browser;
    const action = api.action || api.browserAction;
    if (!action) return;

    // Prioridade 1: Atualização disponível
    if (this.hasUpdate) {
      await action.setBadgeText({ text: "!" });
      await action.setBadgeBackgroundColor({ color: "#f59e0b" }); // Amarelo/Laranja (Alerta)
      return;
    }

    // Prioridade 2: Fila de login
    if (this.queueCount > 0) {
      await action.setBadgeText({ text: `${this.queueCount}/5` });
      await action.setBadgeBackgroundColor({ color: "#FF8C00" }); // Laranja (Atividade)
      return;
    }

    // Nada para mostrar
    await action.setBadgeText({ text: "" });
  }
}
