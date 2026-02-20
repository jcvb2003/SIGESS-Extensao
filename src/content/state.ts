import { FishProduction } from './types';

class StateManager {
    public isRunning = false;
    public isPaused = false;
    public stopRequested = false;
    public gender: 'MASCULINO' | 'FEMININO' = 'MASCULINO';
    public daysMap: Record<number, number> = {};
    public production: FishProduction[] = [];
    public currentMonthIndex = 0;
    public currentPage = 0;

    reset() {
        this.isRunning = false;
        this.isPaused = false;
        this.stopRequested = false;
        this.currentMonthIndex = 0;
        this.daysMap = {};
        this.production = [];
        this.currentPage = 0;
    }
}

export const State = new StateManager();
