/**
 * Serviço para gerenciar o Badge (etiqueta) no ícone da extensão.
 */
export const BadgeService = {
  /**
   * Atualiza o badge com a contagem da fila.
   * Formato: X/5
   * Cor: Laranja (#FF8C00)
   */
  async updateQueueBadge(count: number) {
    if (typeof browser === 'undefined') return;
    
    // Fallback para MV2 (browserAction) ou MV3 (action)
    const action = (browser as any).browserAction || (browser as any).action;
    if (!action) return;

    if (count === 0) {
      await action.setBadgeText({ text: "" });
      return;
    }

    // Define o texto X/5 conforme solicitado
    await action.setBadgeText({ text: `${count}/5` });
    
    // Define a cor Laranja Chamativo
    await action.setBadgeBackgroundColor({ color: "#FF8C00" });
    
    // Define a cor do texto (se o navegador suportar)
    if (action.setBadgeTextColor) {
        await action.setBadgeTextColor({ color: "#FFFFFF" });
    }
  }
};
