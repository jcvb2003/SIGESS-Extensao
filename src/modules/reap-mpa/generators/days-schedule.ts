import { getFishingMonthIndexes, getPeakMonthIndexes } from "../monthly-plan";

export const DaysGenerator: any = {
  generate(gender: "MASCULINO" | "FEMININO", settings?: any) {
    const months = getFishingMonthIndexes(settings || {});
    const peaks = getPeakMonthIndexes(settings?.mpaDefesoMonths || []);
    const { min, max, annualMin, annualMax } = this.getMonthLimits(gender, settings, months.length);

    const schedule = this.tryGenerateSchedule(months, peaks, min, max, annualMin, annualMax);

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

  getMonthLimits(gender: "MASCULINO" | "FEMININO", settings?: any, fishingCount = 0): { min: number; max: number; annualMin: number | null; annualMax: number | null } {
    const prefix = gender === "MASCULINO" ? "mpaMascDays" : "mpaFemDays";
    const annualPrefix = gender === "MASCULINO" ? "mpaMascAnnual" : "mpaFemAnnual";
    const min = Number(settings?.[`${prefix}Min`]) || 14;
    const max = Number(settings?.[`${prefix}Max`]) || 18;

    const absoluteAnnualMin = fishingCount * min;
    const absoluteAnnualMax = fishingCount * max;

    const savedAnnualMin = settings?.[`${annualPrefix}Min`];
    const savedAnnualMax = settings?.[`${annualPrefix}Max`];

    const annualMin = savedAnnualMin != null
      ? Math.max(absoluteAnnualMin, Math.min(savedAnnualMin, absoluteAnnualMax))
      : null;
    const annualMax = savedAnnualMax != null
      ? Math.max(absoluteAnnualMin, Math.min(savedAnnualMax, absoluteAnnualMax))
      : null;

    return { min, max, annualMin, annualMax };
  },

  tryGenerateSchedule(months: number[], peaks: Set<number>, min: number, max: number, annualMin: number | null, annualMax: number | null): Record<number, number> | null {
    for (let attempt = 0; attempt < 200; attempt++) {
      const schedule = this.generateSingleAttempt(months, peaks, min, max);
      if (!schedule) continue;

      if (annualMin != null || annualMax != null) {
        const total = months.reduce((sum, m) => sum + schedule[m], 0);
        if (annualMin != null && total < annualMin) continue;
        if (annualMax != null && total > annualMax) continue;
      }

      return schedule;
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
