import { useEffect, useState } from "react";

interface ReapHelpModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

function parseCurrencyInput(value: string): number {
  if (!value) return 0;
  const normalized = value.trim().replace(/[^0-9,.-]/g, "");
  const withDot = normalized.includes(",")
    ? normalized.replaceAll(".", "").replace(",", ".")
    : normalized;
  const num = Number(withDot);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function parseMonthsInput(value: string): number {
  if (!value) return 0;
  const digits = value.replace(/\D/g, "");
  const num = Number.parseInt(digits, 10);
  return Number.isFinite(num) && num > 0 ? Math.min(12, num) : 0;
}

export function ReapHelpModal({ isOpen, onClose }: ReapHelpModalProps) {
  const [simulatedMonthlyValue, setSimulatedMonthlyValue] = useState("1500");
  const [simulatedMonths, setSimulatedMonths] = useState("8");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalCalculated =
    parseCurrencyInput(simulatedMonthlyValue) * parseMonthsInput(simulatedMonths);
  const formattedTotal = totalCalculated.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <div
      className="help-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="help-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <div className="help-modal-header">
          <h3 id="help-modal-title" className="help-modal-title">
            <span>📘</span>
            <span>O que é o REAP e como se relaciona com o eSocial?</span>
          </h3>
          <button
            type="button"
            className="help-modal-close"
            onClick={onClose}
            aria-label="Fechar janela informativa"
          >
            ✕
          </button>
        </div>
        <div className="help-modal-body">
          <p>
            O REAP é o relatório de exercício da atividade pesqueira e tem como finalidade registrar, anualmente, a produção do pescador, informando as espécies capturadas, as respectivas quantidades em quilos e os valores pelos quais foram comercializadas.
          </p>
          <p>
            Essas informações devem ser compatíveis com os valores de comercialização declarados no eSocial, uma vez que as contribuições são apuradas e recolhidas mensalmente. Dessa forma, é importante que os valores informados no REAP estejam alinhados com a comercialização declarada no eSocial e com as respectivas contribuições pagas.
          </p>
          <p>
            Para exemplificar, imagine uma região em que a pesca fique proibida durante quatro meses em razão do período de defeso. Nesse caso, durante os oito meses em que a pesca é permitida, o pescador deverá registrar e declarar as espécies capturadas, as quantidades e os valores de comercialização no REAP. Também deverá recolher, em cada um desses oito meses, a respectiva contribuição por meio do boleto gerado no eSocial.
          </p>
          <p>
            Assim, ao final do ano, os valores e as informações apresentados no REAP devem guardar correspondência com a atividade de comercialização e com as contribuições declaradas e recolhidas ao longo dos meses em que a atividade pesqueira esteve permitida.
          </p>
          <div className="help-modal-calc-card">
            Se o pescador declarar uma comercialização de{" "}
            <strong>R$</strong>
            <input
              type="text"
              className="help-calc-input"
              value={simulatedMonthlyValue}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
                const parts = cleaned.split(".");
                setSimulatedMonthlyValue(parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned);
              }}
              placeholder="0,00"
              aria-label="Valor de comercialização por mês (X)"
            />{" "}
            por mês durante{" "}
            <input
              type="text"
              className="help-calc-input-months"
              value={simulatedMonths}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                const num = Number.parseInt(digits, 10);
                if (Number.isNaN(num)) {
                  setSimulatedMonths("");
                } else {
                  setSimulatedMonths(String(Math.min(12, Math.max(1, num))));
                }
              }}
              placeholder="0"
              maxLength={2}
              aria-label="Meses de atividade (X)"
            />{" "}
            meses de atividade, ao final do ano terá declarado uma comercialização total de{" "}
            <span className="help-calc-output">{formattedTotal}</span>.
          </div>
        </div>
        <div className="help-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
