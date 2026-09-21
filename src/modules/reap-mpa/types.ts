export interface FishData {
  id: number;
  name: string;
  kgMin: number;
  kgMax: number;
  priceMin: number;
  priceMax: number;
}
export interface FishProduction {
  id: number;
  name: string;
  totalKg: number;
  price: number;
  monthlyKg: Record<number, number>;
  monthlyPrices?: Record<number, number>;
  /** Ordem da espécie no calendário sorteado para cada mês ativo. */
  monthlyOrder?: Record<number, number>;
}

export class InvalidSpeciesPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSpeciesPoolError";
  }
}

export class InfeasibleProductionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfeasibleProductionTargetError";
  }
}

export type ProductionMode = "mpa" | "agro";

export interface ProductionGeneratorOptions {
  mode?: ProductionMode;
  randomFn?: () => number;
}
export interface IWorkflowManager {
  stop(): void;
}
