import { MONTHS } from "../config";

export const DaysGenerator: any = {
  generate(gender: "MASCULINO" | "FEMININO") {
    const months = MONTHS;
    const { min, max } = this.getTargetLimits(gender);
    
    let schedule = this.tryGenerateValidSchedule(months, min, max);

    if (!schedule) {
      schedule = {};
      months.forEach((m) => (schedule![m] = 16));
    }
    return schedule;
  },

  getTargetLimits(gender: "MASCULINO" | "FEMININO"): { min: number; max: number } {
    return {
      min: gender === "MASCULINO" ? 125 : 118,
      max: gender === "MASCULINO" ? 135 : 124,
    };
  },

  tryGenerateValidSchedule(months: number[], targetMin: number, targetMax: number): Record<number, number> | null {
    let attempts = 0;
    while (attempts < 500) {
      const schedule = this.generateSingleAttempt(months);
      if (schedule) {
        const sum = Object.values(schedule).reduce<number>((a, b) => a + (b as number), 0);
        if (sum >= targetMin && sum <= targetMax) return schedule;
      }
      attempts++;
    }
    return null;
  },

  generateSingleAttempt(months: number[]): Record<number, number> | null {
    const result: Record<number, number> = {};
    for (let i = 0; i < months.length; i++) {
      const mIndex = months[i];
      const { localMin, localMax } = this.calculateMonthRange(i, months, result);

      if (localMin > localMax) return null;

      result[mIndex] = Math.floor(Math.random() * (localMax - localMin + 1)) + localMin;
    }
    return result;
  },

  calculateMonthRange(index: number, months: number[], current: Record<number, number>): { localMin: number; localMax: number } {
    const mIndex = months[index];
    const isPeak = mIndex === 4 || mIndex === 11;
    let localMin = isPeak ? 17 : 12;
    let localMax = 20;

    if (index > 0) {
      const prevVal = current[months[index - 1]];
      localMin = Math.max(localMin, prevVal - 3);
      localMax = Math.min(localMax, prevVal + 3);
    }
    return { localMin, localMax };
  },
};
