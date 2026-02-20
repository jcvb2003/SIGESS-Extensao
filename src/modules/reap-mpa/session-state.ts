import { FishProduction } from "./types";
class StateManager {
  public isRunning = false;
  public isPaused = false;
  public isPausing = false;
  public stopRequested = false;
  public turboMode = false;
  public gender: "MASCULINO" | "FEMININO" = "MASCULINO";
  public daysMap: Record<number, number> = {};
  public production: FishProduction[] = [];
  public currentMonthIndex = 0;
  public currentPage = 0;
  public monthlyProgress: Record<
    number,
    "pending" | "active" | "done" | "skipped"
  > = {};
  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.isPausing = false;
    this.stopRequested = false;
    this.turboMode = false;
    this.currentMonthIndex = 0;
    this.clearData();
  }
  
  clearData() {
    this.daysMap = {};
    this.production = [];
    this.currentPage = 0;
    this.monthlyProgress = {};
    console.log("REAP: Dados limpos (reset).");
  }
}

const GLOBAL_KEY = "__sigessState";
if (!(globalThis as any)[GLOBAL_KEY]) {
  (globalThis as any)[GLOBAL_KEY] = new StateManager();
}

export const State = (globalThis as any)[GLOBAL_KEY] as StateManager;
