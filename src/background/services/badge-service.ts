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

    if (count === 0) {
      await browser.action.setBadgeText({ text: "" });
      return;
    }

    // Define o texto X/5 conforme solicitado
    await browser.action.setBadgeText({ text: `${count}/5` });
    
    // Define a cor Laranja Chamativo
    await browser.action.setBadgeBackgroundColor({ color: "#FF8C00" });
    
    // Define a cor do texto (se o navegador suportar)
    if ((browser.action as any).setBadgeTextColor) {
        await (browser.action as any).setBadgeTextColor({ color: "#FFFFFF" });
    }
  }
};
