import { useEffect } from "react";

interface ReapHelpModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ReapHelpModal({ isOpen, onClose }: ReapHelpModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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
