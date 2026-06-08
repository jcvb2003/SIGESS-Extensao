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

  return (
    <div ref={containerRef} style={{ position: "relative", marginBottom: "8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: "1px solid #ccc",
          borderRadius: "4px",
          background: "white",
          overflow: "hidden",
        }}
      >
        <input
          id={`specie-${idx}`}
          type="text"
          className="gps-input"
          style={{
            flex: 1,
            border: "none",
            fontSize: "11px",
            padding: "5px 6px",
            outline: "none",
          }}
          placeholder={selected ? selected.nome : "-- Buscar espécie --"}
          value={open ? query : selected ? selected.nome : ""}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {selectedId && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 6px",
              color: "#999",
              fontSize: "13px",
              lineHeight: 1,
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
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "4px",
            maxHeight: "180px",
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: "8px",
                fontSize: "11px",
                color: "#888",
                textAlign: "center",
              }}
            >
              Nenhum resultado
            </div>
          )}
          {filtered.map((s) => {
            const isDisabled = disabledIds.includes(s.id) && s.id !== selectedId;
            return (
              <div
                key={s.id}
                onMouseDown={() => !isDisabled && handleSelect(s.id)}
                style={{
                  padding: "6px 8px",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  opacity: isDisabled ? 0.4 : 1,
                  background: s.id === selectedId ? "#e8f4fd" : "white",
                  borderBottom: "1px solid #f0f0f0",
                }}
                onMouseEnter={(e) => {
                  if (!isDisabled) (e.currentTarget as HTMLDivElement).style.background = "#f5f5f5";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background =
                    s.id === selectedId ? "#e8f4fd" : "white";
                }}
              >
                <div style={{ fontSize: "11px", fontWeight: "bold", color: "#333" }}>{s.nome}</div>
                <div style={{ fontSize: "9px", color: "#888", fontStyle: "italic" }}>
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
