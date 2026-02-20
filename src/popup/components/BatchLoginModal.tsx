import React, { useState } from 'react';
import { UserCredentials } from '../../shared/types';

interface BatchLoginModalProps {
    type: 'pesqbrasil' | 'esocial';
    onConfirm: (creds: UserCredentials[]) => void;
    onCancel: () => void;
}

const BatchLoginModal: React.FC<BatchLoginModalProps> = ({ type, onConfirm, onCancel }) => {
    const [text, setText] = useState('');

    const handleProcess = () => {
        if (!text.trim()) return;

        const credentials: UserCredentials[] = [];
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);

        lines.forEach(line => {
            const parts = line.split(/[\t]+| {2,}/).map(item => item.trim());
            for (let i = 0; i < parts.length; i += 2) {
                const cpf = parts[i];
                const senha = parts[i + 1];
                if (cpf && senha) {
                    credentials.push({ cpf, senha });
                }
            }
        });

        if (credentials.length > 0) {
            onConfirm(credentials);
        } else {
            alert('Nenhuma credencial válida encontrada. Use o formato: CPF [TAB] SENHA');
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0,
            width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)'
        }}>
            <div className="section fade-in" style={{
                width: '90%',
                maxWidth: '360px',
                padding: '0',
                overflow: 'hidden',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
            }}>
                <div className="header" style={{ padding: '16px', textAlign: 'left' }}>
                    <h3 className="title" style={{ fontSize: '18px' }}>
                        Login em Lote {type === 'pesqbrasil' ? 'PesqBrasil' : 'eSocial'}
                    </h3>
                    <p className="subtitle">Importação de credenciais</p>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        backgroundColor: '#f8fafc',
                        padding: '12px',
                        borderRadius: '8px',
                        borderLeft: '4px solid #008080'
                    }}>
                        <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>
                            Cole os dados do Excel abaixo. <br />
                            Formato: <strong>CPF [TAB] SENHA</strong>
                        </p>
                    </div>

                    <textarea
                        className="reap-textarea"
                        style={{ minHeight: '160px', fontFamily: 'monospace' }}
                        placeholder={`000.000.000-00\tSenha123\n111.111.111-11\tSenha456`}
                        value={text}
                        onChange={e => setText(e.target.value)}
                    />

                    <div className="button-group">
                        <button
                            onClick={onCancel}
                            style={{
                                flex: 1,
                                padding: '12px',
                                border: '1px solid #d1d5db',
                                borderRadius: '8px',
                                background: 'white',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleProcess}
                            className="btn-primary"
                            style={{ flex: 2 }}
                        >
                            Iniciar Lote
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchLoginModal;
