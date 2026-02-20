import { State } from '../state';
import { DaysGenerator } from '../generators/schedule';
import { ProductionGenerator } from '../generators/fish';
import { Utils } from '../utils';
import { IWorkflowManager } from '../types';

export const Page3 = {
    isCurrentPage: () => !!document.querySelector('.br-accordion') && document.querySelectorAll('.br-accordion').length >= 12,

    execute: async (manager: IWorkflowManager) => {
        console.log("REAP: Executando Página 3 (Meses)...");
        State.currentPage = 3;
        const months = document.querySelectorAll('.br-accordion');

        if (!State.daysMap || Object.keys(State.daysMap).length === 0) {
            State.daysMap = DaysGenerator.generate(State.gender);
        }
        if (!State.production || State.production.length === 0) {
            State.production = ProductionGenerator.generate(State.daysMap, State.gender);
        }

        // Resume from saved index
        const startIndex = State.currentMonthIndex || 0;
        console.log(`Continuando do mês ${startIndex + 1}`);

        for (let i = startIndex; i < months.length; i++) {
            if (State.stopRequested) {
                State.currentMonthIndex = i; // Save progress
                break;
            }

            const monthAccordion = months[i] as HTMLElement;
            const btn = monthAccordion.querySelector('button.header') as HTMLElement;
            const monthName = btn?.textContent?.trim() || `Mês ${i + 1}`;

            console.log(`REAP: Processando ${monthName} (${i + 1}/12)`);
            monthAccordion.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await Utils.sleep(500);

            if (btn.getAttribute('aria-expanded') !== 'true') {
                btn.click();
                await Utils.sleep(1200);
            }

            const activeContent = await Utils.waitForElement('.content', 10000, monthAccordion);
            if (!activeContent) {
                alert(`Erro: Mês ${monthName} não carregou.`);
                manager.stop();
                return;
            }
            await Utils.sleep(800);

            const isDefeso = i <= 3;

            if (isDefeso) {
                const radioNao = activeContent.querySelector(`input[name="informesMensais.${i}.houvePesca"][value="false"]`) as HTMLInputElement;
                if (radioNao && !radioNao.checked) {
                    activeContent.querySelector(`label[for="${radioNao.id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await Utils.sleep(1000);
                }
                const checkDefeso = await Utils.waitForElement(`input[name="informesMensais.${i}.justificativasNaoDeclaracao"][value="1"]`, 5000, activeContent) as HTMLInputElement;
                if (checkDefeso && !checkDefeso.checked) {
                    activeContent.querySelector(`label[for="${checkDefeso.id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            } else {
                const radioSim = activeContent.querySelector(`input[name="informesMensais.${i}.houvePesca"][value="true"]`) as HTMLInputElement;
                if (radioSim && !radioSim.checked) {
                    activeContent.querySelector(`label[for="${radioSim.id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    await Utils.sleep(1500);
                }

                // Dias trabalhados
                const diasInput = activeContent.querySelector(`input[name="informesMensais.${i}.diasTrabalhados"]`) as HTMLInputElement;
                if (diasInput) Utils.setReactInput(diasInput, String(State.daysMap[i] || 16));

                // Área Table
                const areaTable = Array.from(activeContent.querySelectorAll('.table-title')).find(el => el.textContent?.includes("Área"))?.closest('.br-table') as HTMLElement;
                if (areaTable) {
                    await Utils.selectOption(areaTable.querySelector('td:nth-child(1) .br-select') as HTMLElement, "Rio");
                    await Utils.selectOption(areaTable.querySelector('td:nth-child(2) .br-select') as HTMLElement, "PARA");
                    await Utils.sleep(1000);
                    const munSelect = areaTable.querySelector('td:nth-child(3) .br-select') as HTMLElement;
                    if (munSelect) await Utils.fillAutocomplete(munSelect, "Oeiras do Pará");
                    await Utils.selectOption(areaTable.querySelector('td:nth-child(5) .br-select') as HTMLElement, "Emalhe");
                    await Utils.selectOption(areaTable.querySelector('td:nth-child(6) .br-select') as HTMLElement, "Água Doce");
                }

                // Produção Table - Fill ALL fish species (one at a time, add row after filling)
                const prodTable = Array.from(activeContent.querySelectorAll('.table-title')).find(el => el.textContent?.includes("Resultado"))?.closest('.br-table') as HTMLElement;
                if (prodTable) {
                    for (let fishIdx = 0; fishIdx < State.production.length; fishIdx++) {
                        const fish = State.production[fishIdx];
                        const monthlyKg = fish.monthlyKg[i] || 0;
                        if (monthlyKg === 0) continue;

                        // Get current rows
                        let rows = prodTable.querySelectorAll('tbody tr');
                        let row = rows[fishIdx] as HTMLElement;

                        // If row doesn't exist, click add first
                        if (!row && fishIdx > 0) {
                            const addBtn = Array.from(prodTable.querySelectorAll('button')).find(b => b.textContent?.includes('Adicionar')) as HTMLElement;
                            if (addBtn) {
                                addBtn.click();
                                await Utils.sleep(1000);
                                rows = prodTable.querySelectorAll('tbody tr');
                                row = rows[fishIdx] as HTMLElement;
                            }
                        }

                        if (!row) {
                            console.warn(`Row ${fishIdx} não disponível para ${fish.name}`);
                            continue;
                        }

                        // Species (col 1)
                        const specSelect = row.querySelector('td:nth-child(1) .br-select') as HTMLElement;
                        if (specSelect) {
                            await Utils.fillAutocomplete(specSelect, fish.name);
                            await Utils.sleep(500);
                        }

                        // Unit (col 2)
                        await Utils.selectOption(row.querySelector('td:nth-child(2) .br-select') as HTMLElement, "Quilo");

                        // Quantity (col 3)
                        const qtdInput = row.querySelector('td:nth-child(3) input') as HTMLInputElement;
                        if (qtdInput) Utils.setReactInput(qtdInput, String(monthlyKg));

                        // Price (col 4) - Format as X,00
                        const valInput = row.querySelector('td:nth-child(4) input') as HTMLInputElement;
                        if (valInput) Utils.setReactInput(valInput, fish.price.toFixed(2).replace('.', ','));

                        await Utils.sleep(600);
                    }
                }
            }
            await Utils.sleep(1000);
        }

        if (!State.stopRequested) {
            State.currentMonthIndex = 0; // Reset on completion
            alert("Página 3 Preenchida!");
            manager.stop();
        }
    }
};
