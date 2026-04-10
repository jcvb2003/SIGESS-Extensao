import { BadgeManager } from "./badge-manager";

/**
 * @deprecated Use BadgeManager em vez deste serviço para evitar condições de corrida.
 * Mantido apenas para compatibilidade temporária.
 */
export const BadgeService = {
  async updateQueueBadge(count: number) {
    BadgeManager.setQueueCount(count);
  }
};
