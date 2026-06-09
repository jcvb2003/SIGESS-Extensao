import React, { useEffect, useRef, useState } from "react";
import { FULL_PORTAL_SPECIES } from "../../../../shared/data/species";
import { formatBRL } from "./helpers";

interface CurrencyInputProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

interface SpeciesSearchProps {
  idx: number;
  selectedId?: number;
  disabledIds: number[];
  onChange: (id: number | undefined) => void;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      className="gps-input"
      style={{ fontSize: "11px" }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={focused ? value : formatBRL(value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        onChange(raw);
      }}
    />
  );
};

export const SpeciesSearch: React.FC<SpeciesSearchProps> = ({
  idx,
  selectedId,
  disabledIds,
  onChange,
}) => {
  const selected = FULL_PORTAL_SPECIES.find((s) => s.id === selectedId);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered =
    query.trim().length === 0
      ? FULL_PORTAL_SPECIES
      : FULL_PORTAL_SPECIES.filter(
          (s) =>
            s.nome.toLowerCase().includes(query.toLowerCase()) ||
            s.camposAdicionais.nomeCientifico.toLowerCase().includes(query.toLowerCase()),
        );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (id: number) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setQuery("");
  };

  const hasFish = !!selected;

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: hasFish ? "1px solid var(--color-accent)" : "1px dashed var(--color-border-strong)",
          borderRadius: "6px",
          background: hasFish ? "var(--color-accent-soft)" : "var(--color-surface)",
          overflow: "hidden",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <input
          id={`specie-${idx}`}
          type="text"
          className="gps-input"
          style={{
            flex: 1,
            border: "none",
            fontSize: "12px",
            fontWeight: hasFish ? 600 : 400,
            padding: "7px 10px",
            outline: "none",
            background: "transparent",
            color: hasFish ? "var(--color-accent-strong)" : "var(--color-muted)",
            boxShadow: "none",
          }}
          placeholder="— selecionar espécie —"
          value={open ? query : selected ? selected.nome : ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {hasFish && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 10px",
              color: "var(--color-accent)",
              fontSize: "16px",
              lineHeight: 1,
              flexShrink: 0,
              opacity: 0.6,
            }}
            title="Limpar"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 9999,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border-strong)",
            borderRadius: "3px",
            maxHeight: "180px",
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: "10px 8px",
                fontSize: "11px",
                color: "var(--color-muted)",
                textAlign: "center",
                fontFamily: "var(--mono)",
              }}
            >
              Nenhum resultado
            </div>
          )}
          {filtered.map((s) => {
            const isDisabled = disabledIds.includes(s.id) && s.id !== selectedId;
            const isActive = s.id === selectedId;
            return (
              <div
                key={s.id}
                onMouseDown={() => !isDisabled && handleSelect(s.id)}
                style={{
                  padding: "7px 10px",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.35 : 1,
                  background: isActive ? "var(--color-accent-soft)" : "transparent",
                  borderBottom: "1px solid var(--color-border)",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled) (e.currentTarget as HTMLDivElement).style.background =
                    isActive ? "var(--color-accent-soft)" : "var(--color-surface-alt)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    isActive ? "var(--color-accent-soft)" : "transparent";
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: 600, color: isActive ? "var(--color-accent-strong)" : "var(--color-text-strong)" }}>
                  {s.nome}
                </div>
                <div style={{ fontSize: "9px", color: "var(--color-muted)", fontStyle: "italic" }}>
                  {s.camposAdicionais.nomeCientifico}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
