import React from 'react';
import { AppSettings } from '../../shared/types';

interface ConfigPanelProps {
    settings: AppSettings;
    onUpdate: (s: Partial<AppSettings>) => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ settings, onUpdate }) => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
    const months = [
        { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
        { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
        { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
        { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
        { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
        { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
    ];

    const handleCurrencyInput = (val: string) => {
        let nums = val.replace(/\D/g, '');
        if (!nums) return onUpdate({ valorComercializado: '' });
        const centavos = parseInt(nums);
        const reais = centavos / 100;
        const formatted = reais.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        onUpdate({ valorComercializado: formatted });
    };

    const handleToggleConsultar = (enabled: boolean) => {
        onUpdate({
            consultarGuias: enabled,
            gerarGps: enabled ? false : settings.gerarGps
        });
    };

    const handleToggleGerarGps = (enabled: boolean) => {
        onUpdate({
            gerarGps: enabled,
            consultarGuias: enabled ? false : settings.consultarGuias
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Consultar Guias Pagas */}
            <div className="toggle-group">
                <div className="toggle-header">
                    <label className="toggle-label">
                        <span className="toggle-text">Consultar Guias Pagas</span>
                        <div className="toggle-switch">
                            <input
                                type="checkbox"
                                className="toggle-input"
                                checked={settings.consultarGuias}
                                onChange={(e) => handleToggleConsultar(e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                        </div>
                    </label>
                </div>

                {settings.consultarGuias && (
                    <div className="dropdown-container fade-in">
                        <label className="dropdown-label">Selecionar Ano:</label>
                        <select
                            className="dropdown-select"
                            value={settings.selectedYear}
                            onChange={(e) => onUpdate({ selectedYear: e.target.value })}
                        >
                            <option value="current">Ano Atual (Padrão)</option>
                            {years.map(y => y !== currentYear && (
                                <option key={y} value={y.toString()}>{y}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Gerar GPS */}
            <div className="toggle-group">
                <div className="toggle-header">
                    <label className="toggle-label">
                        <span className="toggle-text">Gerar GPS</span>
                        <div className="toggle-switch">
                            <input
                                type="checkbox"
                                className="toggle-input"
                                checked={settings.gerarGps}
                                onChange={(e) => handleToggleGerarGps(e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                        </div>
                    </label>
                </div>

                {settings.gerarGps && (
                    <div className="gps-controls-container fade-in">
                        <div className="gps-controls">
                            <div className="gps-control-group">
                                <label className="gps-label">Mês:</label>
                                <select
                                    className="gps-select"
                                    value={settings.selectedMonth}
                                    onChange={(e) => onUpdate({ selectedMonth: e.target.value })}
                                >
                                    {months.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="gps-control-group">
                                <label className="gps-label">Valor (R$):</label>
                                <input
                                    type="text"
                                    className="gps-input"
                                    placeholder="Ex: 1.400,00"
                                    maxLength={15}
                                    value={settings.valorComercializado}
                                    onChange={(e) => handleCurrencyInput(e.target.value)}
                                />
                            </div>
                        </div>
                        <p className="gps-note">Redireciona para GPS com competência específica</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConfigPanel;
