import { useEffect, useRef, useState } from "react";
import { AppSettings } from "../../../../shared/types";
import { SpeciesSearch } from "./SharedFields";
import { ReapHelpModal } from "./ReapHelpModal";
import { getValidSpeciesPool, MIN_DAYS_SPAN, MIN_KG_SPAN, MIN_PRICE_SPAN, normalizePriceBounds, normalizeProductionRange } from "../../../../modules/reap-mpa/reap-settings";

function cleanSpeciesNumericInput(value: string, allowDecimal = true): string {
  if (!value) return "";
  let cleaned = value.replace(/[^0-9.,]/g, "").replace(",", ".");
  if (allowDecimal) {
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("");
    }
  } else {
    cleaned = cleaned.replaceAll(".", "");
  }
  return cleaned;
}

function cleanDaysInput(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return "";
  const num = Number.parseInt(digitsOnly, 10);
  if (Number.isNaN(num)) return "";
  return String(Math.min(30, Math.max(1, num)));
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoneyValue(value?: string): number {
  if (!value) return 0;
  const normalized = value.trim().replace(/[^0-9,.-]/g, "");
  const withDot = normalized.includes(",")
    ? normalized.replaceAll(".", "").replace(",", ".")
    : normalized;
  const numberValue = Number(withDot);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function calculateProductionSlice(settings: AppSettings) {
  const productiveMonths = 12 - new Set(
    (settings.mpaDefesoMonths || []).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
  ).size;

  const species = getValidSpeciesPool(settings.mpaSpecies);
  const requestedCount = Number(settings.mpaSpeciesCount);
  const usableCount = species.length;
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || usableCount < requestedCount || productiveMonths <= 0) {
    return { min: 0, max: 0, usableCount, productiveMonths, isReady: false };
  }

  const annualMin = species
    .map((item) => item.kgMin * item.priceMin * productiveMonths)
    .sort((a, b) => a - b)
    .slice(0, requestedCount)
    .reduce((sum, value) => sum + value, 0);
  const annualMax = species
    .map((item) => item.kgMax * item.priceMax * productiveMonths)
    .sort((a, b) => b - a)
    .slice(0, requestedCount)
    .reduce((sum, value) => sum + value, 0);

  return {
    min: Math.ceil(annualMin),
    max: Math.floor(annualMax),
    usableCount,
    productiveMonths,
    isReady: annualMin <= annualMax,
  };
}

function getSliderHandleStyle(pct: number): React.CSSProperties {
  return {
    position: "absolute",
    top: "50%",
    left: `${pct}%`,
    transform: "translate(-50%, -50%)",
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: "var(--color-accent)",
    border: "2px solid var(--color-page)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
    cursor: "grab",
    pointerEvents: "none",
  };
}

interface DualRangeSliderProps {
  readonly absMin: number;
  readonly absMax: number;
  readonly value: [number, number];
  readonly onChange: (v: [number, number]) => void;
  readonly formatValue: (v: number) => string;
}

function DualRangeSlider({ absMin, absMax, value, onChange, formatValue }: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"lo" | "hi" | null>(null);
  const [lo, hi] = value;

  const valueFromPointer = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(absMin + pct * (absMax - absMin));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const v = valueFromPointer(e);
    draggingRef.current = Math.abs(v - lo) <= Math.abs(v - hi) ? "lo" : "hi";
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (draggingRef.current === "lo") onChange([Math.min(v, hi), hi]);
    else onChange([lo, Math.max(v, lo)]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const v = valueFromPointer(e);
    if (draggingRef.current === "lo") onChange([Math.min(v, hi), hi]);
    else onChange([lo, Math.max(v, lo)]);
  };

  const onPointerUp = () => {
    draggingRef.current = null;
  };

  const pctLo = ((lo - absMin) / (absMax - absMin)) * 100;
  const pctHi = ((hi - absMin) / (absMax - absMin)) * 100;

  return (
    <div style={{ marginTop: "6px" }}>
      <div style={{ fontSize: "10px", color: "var(--color-muted)", textAlign: "center", marginBottom: "4px" }}>
        Total/ano: <strong style={{ color: "var(--color-accent)" }}>{formatValue(lo)}–{formatValue(hi)}</strong>
      </div>
      <div
        ref={trackRef}
        style={{ position: "relative", height: "18px", cursor: "pointer", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div style={{ position: "absolute", top: "7px", left: 0, right: 0, height: "3px", background: "var(--color-border)", borderRadius: "2px" }} />
        <div style={{ position: "absolute", top: "7px", left: `${pctLo}%`, width: `${pctHi - pctLo}%`, height: "3px", background: "var(--color-accent)", borderRadius: "2px" }} />
        <div style={getSliderHandleStyle(pctLo)} />
        <div style={getSliderHandleStyle(pctHi)} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "var(--color-muted)", marginTop: "1px" }}>
        <span>{formatValue(absMin)}</span><span>{formatValue(absMax)}</span>
      </div>
    </div>
  );
}

interface RangeSliderProps {
  readonly absMin: number;
  readonly absMax: number;
  readonly value: [number, number];
  readonly onChange: (v: [number, number]) => void;
}

function AnnualRangeSlider({ absMin, absMax, value, onChange }: RangeSliderProps) {
  if (absMin >= absMax) {
    return (
      <div style={{ fontSize: "10px", color: "var(--color-muted)", marginTop: "4px", textAlign: "center" }}>
        Total/ano: {absMin} dias
      </div>
    );
  }

  return (
    <DualRangeSlider
      absMin={absMin}
      absMax={absMax}
      value={value}
      onChange={onChange}
      formatValue={(v) => `${v} dias`}
    />
  );
}

function ProductionRangeSlice({ absMin, absMax, value, onChange }: RangeSliderProps) {
  if (absMin <= 0 || absMax <= 0) {
    return (
      <div style={{ fontSize: "10px", color: "var(--color-muted)", marginTop: "4px", textAlign: "center" }}>
        Preencha kg/preco das especies
      </div>
    );
  }

  if (absMin >= absMax) {
    return (
      <div style={{ fontSize: "10px", color: "var(--color-muted)", marginTop: "4px", textAlign: "center" }}>
        Total/ano: {formatCurrency(absMin)}
      </div>
    );
  }

  return (
    <DualRangeSlider
      absMin={absMin}
      absMax={absMax}
      value={value}
      onChange={onChange}
      formatValue={formatCurrency}
    />
  );
}

interface ReapSpeciesSectionProps {
  readonly settings: AppSettings;
  readonly onUpdate: (data: Partial<AppSettings>) => void | Promise<void>;
}

export function ReapSpeciesSection({
  settings,
  onUpdate,
}: ReapSpeciesSectionProps) {
  const selectedSpeciesIds =
    settings.mpaSpecies?.map((s) => s.id).filter((id): id is number => id !== undefined) || [];
  const filled = settings.mpaSpecies?.filter((s) => s?.id).length ?? 0;
  const requestedSpeciesCount = settings.mpaSpeciesCount ?? 0;
  const speciesCountExceedsRegistered = requestedSpeciesCount > filled;
  const [revealedOptionalCount, setRevealedOptionalCount] = useState(0);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const lastFilledSpeciesIndex = (settings.mpaSpecies || []).reduce(
    (lastIndex, species, index) => (species?.id ? index : lastIndex),
    -1,
  );
  const visibleSpeciesCount = Math.min(
    10,
    Math.max(1, lastFilledSpeciesIndex + 1, 1 + revealedOptionalCount),
  );
  const productionSlice = calculateProductionSlice(settings);
  const prodAbsMin = productionSlice.min;
  const prodAbsMax = productionSlice.max;
  const [mascProdAnnualMin, mascProdAnnualMax] = normalizeProductionRange(
    settings.mpaMascProductionAnnualMin,
    settings.mpaMascProductionAnnualMax,
    prodAbsMin,
    prodAbsMax,
  );
  const [femProdAnnualMin, femProdAnnualMax] = normalizeProductionRange(
    settings.mpaFemProductionAnnualMin,
    settings.mpaFemProductionAnnualMax,
    prodAbsMin,
    prodAbsMax,
  );
  const productionInputsKey = JSON.stringify(
    [
      settings.mpaSpeciesCount,
      settings.mpaDefesoMonths,
      ...(settings.mpaSpecies || []).map((item) => [item.kgMin, item.kgMax, item.priceMin, item.priceMax]),
    ],
  );
  const previousProductionInputsKey = useRef<string>();

  useEffect(() => {
    if (prodAbsMin <= 0 || prodAbsMax <= prodAbsMin) return;

    const inputsChanged = previousProductionInputsKey.current !== undefined
      && previousProductionInputsKey.current !== productionInputsKey;
    previousProductionInputsKey.current = productionInputsKey;
    const targetMin = inputsChanged ? prodAbsMin : undefined;
    const targetMax = inputsChanged ? prodAbsMax : undefined;
    const patch: Partial<AppSettings> = {};
    if (settings.mpaMascProductionAnnualMin !== (targetMin ?? mascProdAnnualMin)) {
      patch.mpaMascProductionAnnualMin = targetMin ?? mascProdAnnualMin;
    }
    if (settings.mpaMascProductionAnnualMax !== (targetMax ?? mascProdAnnualMax)) {
      patch.mpaMascProductionAnnualMax = targetMax ?? mascProdAnnualMax;
    }
    if (settings.mpaFemProductionAnnualMin !== (targetMin ?? femProdAnnualMin)) {
      patch.mpaFemProductionAnnualMin = targetMin ?? femProdAnnualMin;
    }
    if (settings.mpaFemProductionAnnualMax !== (targetMax ?? femProdAnnualMax)) {
      patch.mpaFemProductionAnnualMax = targetMax ?? femProdAnnualMax;
    }

    if (Object.keys(patch).length > 0) void onUpdate(patch);
  }, [
    femProdAnnualMax,
    femProdAnnualMin,
    mascProdAnnualMax,
    mascProdAnnualMin,
    onUpdate,
    prodAbsMax,
    prodAbsMin,
    productionInputsKey,
    settings.mpaFemProductionAnnualMax,
    settings.mpaFemProductionAnnualMin,
    settings.mpaMascProductionAnnualMax,
    settings.mpaMascProductionAnnualMin,
  ]);

  const updateSpecie = (index: number, data: any) => {
    const current = settings.mpaSpecies || [];
    const next = [...current];
    for (let i = 0; i < 10; i++) {
      if (!next[i]) next[i] = {};
    }
    next[index] = { ...next[index], ...data };
    onUpdate({ mpaSpecies: next });
  };

  let speciesCountFeedback: React.ReactNode = null;
  if (speciesCountExceedsRegistered) {
    speciesCountFeedback = (
      <p className="reap-note reap-error-note">
        Cadastre pelo menos {requestedSpeciesCount} espécies para usar esta quantidade no REAP.
      </p>
    );
  } else if (filled === 0) {
    speciesCountFeedback = (
      <p className="reap-note">Cadastre uma espécie para definir a quantidade no REAP.</p>
    );
  }

  return (
    <section className="section">
      <div className="section-header">
        <span className="section-num">04</span>
        <div>
          <h2 className="section-title">Espécies e Produção</h2>
          <p className="section-description">Espécies declaradas, kg e preço por gênero.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        <div className="form-group">
          <label className="reap-label" htmlFor="mpaSpeciesCount">Qtd. de espécies no REAP</label>
          <select
            id="mpaSpeciesCount"
            className="gps-select"
            value={settings.mpaSpeciesCount ?? ""}
            onChange={(e) => {
              const nextCount = Number(e.target.value);
              if (nextCount <= filled) void onUpdate({ mpaSpeciesCount: nextCount });
            }}
          >
            <option value="">Selecione...</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n} disabled={n > filled}>{n} espécies</option>
            ))}
          </select>
          {speciesCountFeedback}
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--color-text)" }}>
            <input
              type="checkbox"
              checked={Boolean(settings.mpaRotateMonthlySpecies)}
              onChange={(event) => onUpdate({ mpaRotateMonthlySpecies: event.target.checked })}
            />
            Alternar espécies mensalmente
          </label>
        </div>

        <div className="stack" style={{ gap: "8px" }}>
          {Array.from({ length: visibleSpeciesCount }, (_, idx) => {
            const data = settings.mpaSpecies?.[idx] || {};
            const isOptional = idx >= 1;
            const kgMin = Number(String(data.kgMin ?? "").replace(",", "."));
            const kgMax = Number(String(data.kgMax ?? "").replace(",", "."));
            const priceMin = Number(String(data.priceMin ?? "").replace(",", "."));
            const priceMax = Number(String(data.priceMax ?? "").replace(",", "."));
            const normalizedPrices = normalizePriceBounds(priceMin, priceMax);
            const hasKgRangeError = Boolean(data.id) && Number.isFinite(kgMin) && Number.isFinite(kgMax) && kgMax - kgMin < MIN_KG_SPAN;
            const hasPriceRangeError = Boolean(data.id) && Number.isFinite(priceMin) && Number.isFinite(priceMax)
              && (!normalizedPrices || normalizedPrices[1] - normalizedPrices[0] < MIN_PRICE_SPAN);
            return (
              <div
                key={idx}
                style={{
                  background: "var(--color-surface-alt)",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border)",
                  borderLeft: isOptional
                    ? "3px solid var(--color-border-strong)"
                    : "3px solid var(--color-accent)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{
                    fontFamily: "var(--mono)",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    color: isOptional ? "var(--color-muted)" : "var(--color-accent)",
                  }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: isOptional ? "transparent" : "var(--color-accent-soft)",
                    color: isOptional ? "var(--color-muted)" : "var(--color-accent-strong)",
                    border: isOptional ? "1px solid var(--color-border)" : "none",
                  }}>
                    {isOptional ? "opcional" : "obrigatória"}
                  </span>
                </div>

                <SpeciesSearch
                  idx={idx}
                  selectedId={data.id}
                  disabledIds={selectedSpeciesIds}
                  onChange={(id) => updateSpecie(idx, { id })}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                  {[
                    { key: "kgMin", label: "KG MÍN/MÊS", allowDecimal: false },
                    { key: "kgMax", label: "KG MÁX/MÊS", allowDecimal: false },
                    { key: "priceMin", label: "R$ MÍN", allowDecimal: true },
                    { key: "priceMax", label: "R$ MÁX", allowDecimal: true },
                  ].map(({ key, label, allowDecimal }) => (
                    <div key={key} className="stack" style={{ gap: "3px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--color-muted)", textAlign: "center" }}>
                        {label}
                      </span>
                      <input
                        type="text"
                        inputMode={allowDecimal ? "decimal" : "numeric"}
                        className="gps-input"
                        style={{ textAlign: "center", fontSize: "12px", padding: "6px 4px" }}
                        value={(data as any)[key] || ""}
                        onKeyDown={(e) => {
                          if (["e", "E", "+", "-"].includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={(e) => updateSpecie(idx, { [key]: cleanSpeciesNumericInput(e.target.value, allowDecimal) })}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                {hasKgRangeError && (
                  <p style={{ fontSize: "10px", color: "var(--color-danger)", margin: "6px 0 0" }}>
                    A faixa de KG deve ter pelo menos {MIN_KG_SPAN} kg entre o mínimo e o máximo.
                  </p>
                )}
                {hasPriceRangeError && (
                  <p style={{ fontSize: "10px", color: "var(--color-danger)", margin: "6px 0 0" }}>
                    A faixa de preço deve ter pelo menos R$ {MIN_PRICE_SPAN.toFixed(2).replace(".", ",")} entre o mínimo e o máximo.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {visibleSpeciesCount < 10 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              const nextCount = visibleSpeciesCount + 1;
              setRevealedOptionalCount((current) => Math.max(current, nextCount - 1));
            }}
          >
            + Adicionar espécie
          </button>
        )}

        {filled < 1 && (
          <p style={{ fontSize: "11px", color: "var(--color-danger)", textAlign: "center", margin: 0 }}>
            Preencha ao menos 1 espécie.
          </p>
        )}

        {(() => {
          const fishingCount = 12 - new Set(
            (settings.mpaDefesoMonths || []).filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
          ).size;
          const mascMin = Number(settings.mpaMascDaysMin) || 0;
          const mascMax = Number(settings.mpaMascDaysMax) || 0;
          const femMin = Number(settings.mpaFemDaysMin) || 0;
          const femMax = Number(settings.mpaFemDaysMax) || 0;

          const mascAbsMin = fishingCount * mascMin;
          const mascAbsMax = fishingCount * mascMax;
          const femAbsMin = fishingCount * femMin;
          const femAbsMax = fishingCount * femMax;

          const mascAnnualMin = settings.mpaMascAnnualMin ?? mascAbsMin;
          const mascAnnualMax = settings.mpaMascAnnualMax ?? mascAbsMax;
          const femAnnualMin = settings.mpaFemAnnualMin ?? femAbsMin;
          const femAnnualMax = settings.mpaFemAnnualMax ?? femAbsMax;

          const hasMasc = mascMin > 0 && mascMax > 0 && fishingCount > 0;
          const hasFem = femMin > 0 && femMax > 0 && fishingCount > 0;
          const monthlyCommercializationInput = settings.mpaEsocialMonthlyValue ?? settings.valorComercializado ?? "";
          const monthlyCommercialization = parseMoneyValue(monthlyCommercializationInput);
          const estimatedAnnualCommercialization = monthlyCommercialization * fishingCount;
          const recommendedAnnualMin = Math.max(0, estimatedAnnualCommercialization - 300);
          const recommendedAnnualMax = estimatedAnnualCommercialization + 300;

          const panelColors: Record<string, { accent: string; soft: string }> = {
            MASCULINO: { accent: "#2563eb", soft: "rgba(37,99,235,0.08)" },
            FEMININO:  { accent: "#db2777", soft: "rgba(219,39,119,0.08)" },
          };

          const panelStyle = (_label: string): React.CSSProperties => ({
            background: "var(--color-surface-alt)",
            padding: "0",
            borderRadius: "8px",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          });

          const panelHeader = (label: string): React.CSSProperties => ({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            borderBottom: "1px solid var(--color-border)",
            background: panelColors[label]?.soft ?? "var(--color-surface-alt)",
          });

          const panelBody: React.CSSProperties = {
            padding: "12px",
          };

          return (
            <>
              <div style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: "8px 12px",
                alignItems: "end",
                padding: "10px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                background: "var(--color-surface-alt)",
              }}>
                <div>
                  <label className="reap-label" htmlFor="mpaMonthlyCommercialization">
                    Qual o valor médio mensal de produção que você usa para gerar boletos no e-Social?
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <strong style={{ color: "var(--color-accent-strong)", fontSize: "12px" }}>R$</strong>
                    <input
                      id="mpaMonthlyCommercialization"
                      type="text"
                      inputMode="decimal"
                      className="gps-input"
                      style={{ maxWidth: "180px" }}
                      value={monthlyCommercializationInput}
                      onChange={(event) => onUpdate({
                        mpaEsocialMonthlyValue: event.target.value.replace(/[^0-9.,]/g, ""),
                      })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
                <div style={{ fontSize: "10px", color: "var(--color-muted)", textAlign: "right", lineHeight: 1.45 }}>
                  {monthlyCommercialization > 0 && fishingCount > 0 ? (
                    <>
                      <div>Meses de atividade: <strong>{fishingCount}</strong></div>
                      <div>O valor anual produzido é aproximadamente de <strong>{formatCurrency(estimatedAnnualCommercialization)}</strong>.</div>
                      <div>Faixa recomendada: <strong>{formatCurrency(recommendedAnnualMin)} a {formatCurrency(recommendedAnnualMax)}</strong>.</div>
                    </>
                  ) : (
                    "Informe um valor mensal para calcular a estimativa anual."
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {[
                {
                  label: "MASCULINO",
                  daysMinKey: "mpaMascDaysMin" as const,
                  daysMaxKey: "mpaMascDaysMax" as const,
                  daysMinId: "mpaMascDaysMin",
                  daysMaxLabel: "Dias Trabalhados Máximos Masculinos",
                  absMin: mascAbsMin,
                  absMax: mascAbsMax,
                  annualMin: mascAnnualMin,
                  annualMax: mascAnnualMax,
                  has: hasMasc,
                  onAnnualChange: ([lo, hi]: [number, number]) => onUpdate({ mpaMascAnnualMin: lo, mpaMascAnnualMax: hi }),
                  onDaysMinChange: (v: string) => onUpdate({ mpaMascDaysMin: v, mpaMascAnnualMin: undefined, mpaMascAnnualMax: undefined }),
                  onDaysMaxChange: (v: string) => onUpdate({ mpaMascDaysMax: v, mpaMascAnnualMin: undefined, mpaMascAnnualMax: undefined }),
                   daysMinVal: settings.mpaMascDaysMin || "",
                   daysMaxVal: settings.mpaMascDaysMax || "",
                   daysRangeError: mascMin > 0 && mascMax > 0 && mascMax - mascMin < MIN_DAYS_SPAN,
                  prodAbsMin,
                  prodAbsMax,
                  prodAnnualMin: mascProdAnnualMin,
                  prodAnnualMax: mascProdAnnualMax,
                  onProdChange: ([lo, hi]: [number, number]) => onUpdate({
                    mpaMascProductionAnnualMin: lo,
                    mpaMascProductionAnnualMax: hi,
                  }),
                },
                {
                  label: "FEMININO",
                  daysMinKey: "mpaFemDaysMin" as const,
                  daysMaxKey: "mpaFemDaysMax" as const,
                  daysMinId: "mpaFemDaysMin",
                  daysMaxLabel: "Dias Trabalhados Máximos Femininos",
                  absMin: femAbsMin,
                  absMax: femAbsMax,
                  annualMin: femAnnualMin,
                  annualMax: femAnnualMax,
                  has: hasFem,
                  onAnnualChange: ([lo, hi]: [number, number]) => onUpdate({ mpaFemAnnualMin: lo, mpaFemAnnualMax: hi }),
                  onDaysMinChange: (v: string) => onUpdate({ mpaFemDaysMin: v, mpaFemAnnualMin: undefined, mpaFemAnnualMax: undefined }),
                  onDaysMaxChange: (v: string) => onUpdate({ mpaFemDaysMax: v, mpaFemAnnualMin: undefined, mpaFemAnnualMax: undefined }),
                   daysMinVal: settings.mpaFemDaysMin || "",
                   daysMaxVal: settings.mpaFemDaysMax || "",
                   daysRangeError: femMin > 0 && femMax > 0 && femMax - femMin < MIN_DAYS_SPAN,
                  prodAbsMin,
                  prodAbsMax,
                  prodAnnualMin: femProdAnnualMin,
                  prodAnnualMax: femProdAnnualMax,
                  onProdChange: ([lo, hi]: [number, number]) => onUpdate({
                    mpaFemProductionAnnualMin: lo,
                    mpaFemProductionAnnualMax: hi,
                  }),
                },
              ].map((panel) => (
                <div key={panel.label} style={panelStyle(panel.label)}>
                  <div style={panelHeader(panel.label)}>
                    <span style={{
                      width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                      background: panelColors[panel.label]?.accent ?? "var(--color-accent)",
                    }} />
                    <span style={{
                      fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em",
                      color: panelColors[panel.label]?.accent ?? "var(--color-text-strong)",
                    }}>
                      {panel.label}
                    </span>
                  </div>
                  <div className="stack" style={{ ...panelBody, gap: "10px" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <label htmlFor={`${panel.daysMinId}-prod`} className="reap-label" style={{ marginBottom: 0 }}>
                          Produção (R$)
                        </label>
                        <button
                          type="button"
                          className="reap-help-btn-red"
                          onClick={() => setIsHelpModalOpen(true)}
                          title="O que é o REAP e como se relaciona com o eSocial?"
                          aria-label="Ajuda sobre Produção (R$) e o REAP"
                        >
                          ?
                        </button>
                      </div>
                      <ProductionRangeSlice
                        absMin={panel.prodAbsMin}
                        absMax={panel.prodAbsMax}
                        value={[panel.prodAnnualMin, panel.prodAnnualMax]}
                        onChange={panel.onProdChange}
                      />
                    </div>
                    <div>
                      <label htmlFor={panel.daysMinId} className="reap-label" style={{ marginBottom: "4px" }}>
                        Dias/Mês
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                        <input
                          id={panel.daysMinId}
                          type="text"
                          inputMode="numeric"
                          className="gps-input"
                          style={{ fontSize: "12px" }}
                          placeholder="Mín"
                          value={panel.daysMinVal}
                          onKeyDown={(e) => {
                            if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => panel.onDaysMinChange(cleanDaysInput(e.target.value))}
                        />
                        <input
                          type="text"
                          inputMode="numeric"
                          className="gps-input"
                          style={{ fontSize: "12px" }}
                          aria-label={panel.daysMaxLabel}
                          placeholder="Máx"
                          value={panel.daysMaxVal}
                          onKeyDown={(e) => {
                            if (["e", "E", "+", "-", ".", ","].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={(e) => panel.onDaysMaxChange(cleanDaysInput(e.target.value))}
                        />
                      </div>
                       {panel.daysRangeError && (
                         <div style={{ fontSize: "10px", color: "var(--color-danger)", marginTop: "4px" }}>
                           A faixa de Dias/Mês deve ter pelo menos {MIN_DAYS_SPAN} dias.
                         </div>
                       )}
                       {panel.has ? (
                        <AnnualRangeSlider
                          absMin={panel.absMin}
                          absMax={panel.absMax}
                          value={[panel.annualMin, panel.annualMax]}
                          onChange={panel.onAnnualChange}
                        />
                      ) : (
                        <div style={{ fontSize: "10px", color: "var(--color-muted)", marginTop: "4px", textAlign: "center" }}>—</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          );
        })()}
      </div>
      <ReapHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </section>
  );
}
