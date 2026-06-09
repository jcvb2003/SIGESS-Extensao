import { getFishingMonthIndexes, getPeakMonthIndexes } from "../monthly-plan";

export const DaysGenerator: any = {
  generate(gender: "MASCULINO" | "FEMININO", settings?: any) {
    const months = getFishingMonthIndexes(settings || {});
    const peaks = getPeakMonthIndexes(settings?.mpaDefesoMonths || []);
    const { min, max } = this.getMonthLimits(gender, settings);

    const schedule = this.tryGenerateSchedule(months, peaks, min, max);

    if (!schedule) {
      throw new Error(
        `Não foi possível gerar escala de dias com as configurações atuais.\n` +
        `Verifique os limites de Dias/Mês (${min}–${max}) e os meses de defeso configurados.`
      );
    }

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      schedule[monthIndex] ??= 0;
    }
    return schedule;
  },

  getMonthLimits(gender: "MASCULINO" | "FEMININO", settings?: any): { min: number; max: number } {
    const prefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
    const min = Number(settings?.[`${prefix}Min`]) || 14;
    const max = Number(settings?.[`${prefix}Max`]) || 18;
    return { min, max };
  },

  tryGenerateSchedule(months: number[], peaks: Set<number>, min: number, max: number): Record<number, number> | null {
    for (let attempt = 0; attempt < 200; attempt++) {
      const schedule = this.generateSingleAttempt(months, peaks, min, max);
      if (schedule) return schedule;
    }
    return null;
  },

  generateSingleAttempt(months: number[], peaks: Set<number>, min: number, max: number): Record<number, number> | null {
    const result: Record<number, number> = {};
    for (let i = 0; i < months.length; i++) {
      const m = months[i];
      const peakMin = peaks.has(m) ? Math.min(max, Math.ceil((min + max) / 2)) : min;

      let localMin = peakMin;
      let localMax = max;

      if (i > 0) {
        const prev = result[months[i - 1]];
        localMin = Math.max(localMin, prev - 3);
        localMax = Math.min(localMax, prev + 3);
      }

      if (localMin > localMax) return null;

      result[m] = Math.floor(Math.random() * (localMax - localMin + 1)) + localMin;
    }
    return result;
  },
};
