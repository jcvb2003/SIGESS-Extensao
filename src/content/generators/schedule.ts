import { MONTHS } from '../config';

export const DaysGenerator = {
    generate(gender: 'MASCULINO' | 'FEMININO') {
        const months = MONTHS;
        const targetMin = gender === 'MASCULINO' ? 125 : 118;
        const targetMax = gender === 'MASCULINO' ? 135 : 124;

        let attempts = 0;
        let bestSchedule: Record<number, number> | null = null;

        while (attempts < 500) {
            const result: Record<number, number> = {};
            let isValid = true;

            for (let i = 0; i < months.length; i++) {
                const mIndex = months[i];
                const isPeak = mIndex === 4 || mIndex === 11;
                let localMin = isPeak ? 17 : 12;
                let localMax = 20;

                if (i > 0) {
                    const prevVal = result[months[i - 1]];
                    localMin = Math.max(localMin, prevVal - 3);
                    localMax = Math.min(localMax, prevVal + 3);
                    if (localMin > localMax) { isValid = false; break; }
                }

                result[mIndex] = Math.floor(Math.random() * (localMax - localMin + 1)) + localMin;
            }

            if (isValid) {
                const sum = Object.values(result).reduce((a, b) => a + b, 0);
                if (sum >= targetMin && sum <= targetMax) {
                    bestSchedule = result;
                    break;
                }
            }
            attempts++;
        }

        if (!bestSchedule) {
            bestSchedule = {};
            months.forEach(m => bestSchedule![m] = 16);
        }
        return bestSchedule;
    }
};
