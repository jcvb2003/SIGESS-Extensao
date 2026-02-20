import { FishProduction } from '../types';
import { FISH_TABLE, MONTHS } from '../config';

export const ProductionGenerator = {
    generate(daysMap: Record<number, number>, gender: 'MASCULINO' | 'FEMININO'): FishProduction[] {
        const months = MONTHS;
        const totalDays = months.reduce((s, m) => s + (daysMap[m] || 16), 0);

        const targetMin = gender === 'MASCULINO' ? 2950 : 2850;
        const targetMax = gender === 'MASCULINO' ? 3075 : 2950;

        let bestResult: FishProduction[] | null = null;
        let attempts = 0;

        while (attempts < 300) {
            const result: FishProduction[] = [];

            // Generate Kg for each fish
            for (const fish of FISH_TABLE) {
                const totalKg = Math.floor(Math.random() * (fish.kgMax - fish.kgMin + 1)) + fish.kgMin;
                result.push({ name: fish.name, totalKg, price: 0, monthlyKg: {} });
            }

            // Sort by Kg descending for supply/demand pricing
            result.sort((a, b) => b.totalKg - a.totalKg);

            // Assign prices inversely (more kg = cheaper) - WHOLE NUMBERS ONLY
            for (let i = 0; i < result.length; i++) {
                const fish = FISH_TABLE.find(f => f.name === result[i].name)!;
                const priceRange = fish.priceMax - fish.priceMin;
                const priceFactor = i / (result.length - 1); // 0 to 1
                const price = fish.priceMin + (priceRange * priceFactor * 0.7) + (Math.random() * priceRange * 0.3);
                result[i].price = Math.round(price); // Whole number only
            }

            // Distribute Kg per month proportionally
            for (const prod of result) {
                let remaining = prod.totalKg;
                const monthlyRaw: Record<number, number> = {};

                for (let mi = 0; mi < months.length; mi++) {
                    const m = months[mi];
                    const daysProportion = (daysMap[m] || 16) / totalDays;
                    const kgForMonth = Math.round(prod.totalKg * daysProportion);
                    monthlyRaw[m] = kgForMonth;
                    remaining -= kgForMonth;
                }

                // Adjust remainder
                const lastMonth = months[months.length - 1];
                monthlyRaw[lastMonth] += remaining;
                prod.monthlyKg = monthlyRaw;
            }

            // Calculate total value
            const totalValue = result.reduce((s, p) => s + (p.totalKg * p.price), 0);

            if (totalValue >= targetMin && totalValue <= targetMax) {
                bestResult = result;
                break;
            }

            // Try to adjust prices
            if (totalValue < targetMin) {
                // Need more value, increase prices slightly
                for (const prod of result) {
                    const fish = FISH_TABLE.find(f => f.name === prod.name)!;
                    prod.price = Math.min(fish.priceMax, prod.price + 0.5);
                }
            } else if (totalValue > targetMax) {
                // Need less value, decrease prices
                for (const prod of result) {
                    const fish = FISH_TABLE.find(f => f.name === prod.name)!;
                    prod.price = Math.max(fish.priceMin, prod.price - 0.5);
                }
            }

            const adjustedTotal = result.reduce((s, p) => s + (p.totalKg * p.price), 0);
            if (adjustedTotal >= targetMin && adjustedTotal <= targetMax) {
                bestResult = result;
                break;
            }

            attempts++;
        }

        if (!bestResult) {
            console.warn("Não foi possível gerar produção ideal, usando fallback.");
            // Fallback: use midpoint values
            bestResult = FISH_TABLE.map(fish => {
                const totalKg = Math.floor((fish.kgMin + fish.kgMax) / 2);
                const price = (fish.priceMin + fish.priceMax) / 2;
                const monthlyKg: Record<number, number> = {};
                months.forEach(m => monthlyKg[m] = Math.round(totalKg / 8));
                return { name: fish.name, totalKg, price, monthlyKg };
            });
        }

        const finalTotal = bestResult.reduce((s, p) => s + (p.totalKg * p.price), 0);
        console.log(`Produção Gerada (${gender}): Total R$ ${finalTotal.toFixed(2)}`);
        bestResult.forEach(p => console.log(`  ${p.name}: ${p.totalKg}kg x R$${p.price.toFixed(2)} = R$${(p.totalKg * p.price).toFixed(2)}`));

        return bestResult;
    }
};
