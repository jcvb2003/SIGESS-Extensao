import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppSettings, PessoaData } from '../shared/types';
import { Shield, AlertTriangle, CheckCircle2, Info, ArrowLeft } from 'lucide-react';
import './styles/global.css';

const DataInspector: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            const res = await chrome.storage.local.get("sigessSettings");
            setSettings(res.sigessSettings || null);
        };
        loadSettings();
    }, []);

    if (!settings) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Carregando dados...</div>;

    const rawData = settings.pessoaData_raw || {};
    const sources = Object.keys(rawData);
    const mainData = settings.pessoaData || {};

    const fieldGroups = [
        {
            title: "Identificação",
            fields: [
                { key: "nome", label: "Nome Completo" },
                { key: "cpf", label: "CPF" },
                { key: "dataDeNascimento", label: "Data Nasc." },
                { key: "sexo", label: "Gênero" },
                { key: "mae", label: "Mãe" },
                { key: "pai", label: "Pai" }
            ]
        },
        {
            title: "Documentos",
            fields: [
                { key: "rg", label: "RG" },
                { key: "orgaoEmissorRg", label: "Órgão Emissor" },
                { key: "tituloEleitor", label: "Título" },
                { key: "zonaEleitoral", label: "Zona" },
                { key: "secaoEleitoral", label: "Seção" },
                { key: "nit", label: "NIS/NIT" },
                { key: "caepf", label: "CAEPF" }
            ]
        },
        {
            title: "Endereço e Contato",
            fields: [
                { key: "endereco", label: "Endereço" },
                { key: "bairro", label: "Bairro" },
                { key: "cidade", label: "Cidade" },
                { key: "uf", label: "UF" },
                { key: "cep", label: "CEP" },
                { key: "telefone", label: "Telefone" }
            ]
        }
    ];

    const hasDivergence = (fieldKey: string) => {
        const values = sources
            .map(s => {
                const val = rawData[s][fieldKey as keyof PessoaData];
                return (val && typeof val === 'string') ? val.trim().toLowerCase() : "";
            })
            .filter(v => v !== "");
        
        if (values.length <= 1) return false;
        return !values.every(v => v === values[0]);
    };

    const renderValue = (val: any) => {
        if (val === undefined || val === null || val === "") return "—";
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    };

    return (
        <div className="inspector-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh', background: '#0f172a', color: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                <button 
                  onClick={() => globalThis.close()} 
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#f8fafc', margin: 0, letterSpacing: '-0.025em' }}>Inspetor de Dados</h1>
                    <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Comparativo detalhado entre fontes de captura automáticas</p>
                </div>
            </header>

            {sources.length === 0 ? (
                <div className="empty-state" style={{ textAlign: 'center', padding: '80px 24px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ background: 'rgba(51, 65, 85, 0.2)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <Info size={32} color="#475569" />
                    </div>
                    <h3 style={{ margin: '0 0 8px', color: '#f8fafc' }}>Nenhuma fonte detectada</h3>
                    <p style={{ color: '#64748b', maxWidth: '300px', margin: '0 auto', fontSize: '14px' }}>
                        Inicie uma coleta automática navegando pelos sites governamentais para popular este painel.
                    </p>
                </div>
            ) : (
                <div className="comparison-table-wrapper" style={{ overflowX: 'auto', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <th style={{ textAlign: 'left', padding: '16px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', width: '200px' }}>Campo</th>
                                {sources.map(s => (
                                    <th key={s} style={{ textAlign: 'left', padding: '16px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {s.replace('_', ' ')}
                                    </th>
                                ))}
                                <th style={{ textAlign: 'left', padding: '16px', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consolidado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fieldGroups.map(group => (
                                <React.Fragment key={group.title}>
                                    <tr style={{ background: 'rgba(56, 189, 248, 0.03)' }}>
                                        <td colSpan={sources.length + 2} style={{ padding: '12px 16px', color: '#38bdf8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                            {group.title}
                                        </td>
                                    </tr>
                                    {group.fields.map(field => {
                                        const divergent = hasDivergence(field.key);
                                        const finalValue = mainData[field.key as keyof PessoaData];
                                        return (
                                            <tr key={field.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: divergent ? 'rgba(245, 158, 11, 0.03)' : 'transparent' }}>
                                                <td style={{ padding: '12px 16px', color: '#94a3b8', fontWeight: 500 }}>
                                                    {field.label}
                                                </td>
                                                {sources.map(s => (
                                                    <td key={s} style={{ padding: '12px 16px', color: rawData[s][field.key as keyof PessoaData] ? '#f1f5f9' : '#334155' }}>
                                                        {renderValue(rawData[s][field.key as keyof PessoaData])}
                                                    </td>
                                                ))}
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ color: divergent ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                                                            {renderValue(finalValue)}
                                                        </span>
                                                        {divergent && <span title="Divergência detectada entre as fontes"><AlertTriangle size={14} color="#f59e0b" /></span>}
                                                        {!divergent && finalValue && sources.length > 1 && (
                                                            <span title="Consenso entre fontes"><CheckCircle2 size={14} color="#10b981" /></span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <footer style={{ marginTop: '48px', padding: '24px 0', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#475569', fontSize: '12px' }}>
                    <Shield size={16} />
                    <span>Os dados brutos são mantidos apenas no seu navegador para auditoria local.</span>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                      onClick={() => globalThis.print()}
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                    >
                        Imprimir Relatório
                    </button>
                </div>
            </footer>
        </div>
    );
};

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<DataInspector />);
}
