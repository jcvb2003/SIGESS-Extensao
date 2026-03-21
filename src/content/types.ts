export interface FishData {
  name: string;
  kgMin: number;
  kgMax: number;
  priceMin: number;
  priceMax: number;
}
export interface FishProduction {
  name: string;
  totalKg: number;
  price: number;
  monthlyKg: Record<number, number>;
}
export interface IWorkflowManager {
  stop(): void;
}
