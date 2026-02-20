import { Utils } from '../utils';
import { IWorkflowManager } from '../types';

export const Page2 = {
    isCurrentPage: () => !!document.querySelector('input[name="prestacaoServico"]'),
    execute: async (_manager: IWorkflowManager) => {
        console.log("REAP: Executando Página 2...");
        const divRelacao = document.querySelector('input[name="prestacaoServico"]')?.closest('.br-select') as HTMLElement;
        if (divRelacao) await Utils.selectOption(divRelacao, 'Economia Familiar');

        const divEstados = document.querySelector('input[name="estadosComercializacao"]')?.closest('.br-select') as HTMLElement;
        if (divEstados) {
            (divEstados.querySelector('button[data-trigger]') as HTMLElement)?.click();
            await Utils.sleep(500);
            const check = document.querySelector('.br-list input[type="checkbox"][value="5"]') as HTMLInputElement;
            if (check && !check.checked) document.querySelector(`.br-list label[for="${check.id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }

        const checkPeixes = document.querySelector('input[name="gruposAlvo"][value="5"]') as HTMLInputElement;
        if (checkPeixes && !checkPeixes.checked) document.querySelector(`label[for="${checkPeixes.id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        const checkVenda = document.querySelector('input[name="compradoresPescado"][value="6"]') as HTMLInputElement;
        if (checkVenda && !checkVenda.checked) document.querySelector(`label[for="${checkVenda.id}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        await Utils.sleep(1000);
        (document.querySelector('button[data-action="avancar"]') as HTMLElement)?.click();
    }
};
