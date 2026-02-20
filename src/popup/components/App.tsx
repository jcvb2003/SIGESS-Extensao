import React, { useState, useEffect } from 'react';
import { StorageService } from '../../background/utils/storage';
import { AppSettings, UserCredentials } from '../../shared/types';
import ConfigPanel from './ConfigPanel';
import BatchLoginModal from './BatchLoginModal';
import ReapPanel from './ReapPanel';

const App: React.FC = () => {
    const [loading, setLoading] = useState(false);
    const [showBatchModal, setShowBatchModal] = useState<'pesqbrasil' | 'esocial' | null>(null);

    const [settings, setSettings] = useState<AppSettings>({
        consultarGuias: false,
        gerarGps: false,
        selectedYear: 'current',
        selectedMonth: '08',
        valorComercializado: '',
        reapData: {
            '2021': '',
            '2022': '',
            '2023': '',
            '2024': ''
        }
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const s = await StorageService.getSettings();
        setSettings(s);
    };

    const handleUpdateSettings = async (newSettings: Partial<AppSettings>) => {
        const updated = { ...settings, ...newSettings };
        setSettings(updated);

        // Sync com background
        await browser.runtime.sendMessage({
            action: 'updateESocialSettings',
            settings: updated
        });
    };

    const handleBatchLogin = async (credentials: UserCredentials[]) => {
        if (!showBatchModal) return;

        setLoading(true);
        try {
            await browser.runtime.sendMessage({
                action: 'startBatchLogin',
                type: showBatchModal,
                credentials
            });
        } catch (e: any) {
            console.error(e);
        } finally {
            setLoading(false);
            setShowBatchModal(null);
        }
    };

    return (
        <div className="container">
            <header className="header">
                <div className="header-content">
                    <img src="../../icon.png" alt="SINPESCA" className="logo" />
                    <div className="header-text">
                        <h1 className="title">SINPESCA</h1>
                        <p className="subtitle">Automatização Governamental</p>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="main-content">

                {/* Login Múltiplo Section */}
                <section className="section">
                    <div className="section-header">
                        <h2 className="section-title">Login Múltiplo</h2>
                        <p className="section-description">Execute múltiplos logins no PesqBrasil ou eSocial</p>
                    </div>
                    <div className="section-content">
                        <div className="button-group">
                            <button
                                className="btn-primary"
                                onClick={() => setShowBatchModal('pesqbrasil')}
                                disabled={loading}
                            >
                                <span className="btn-icon">🌐</span>
                                <span className="btn-text">PesqBrasil</span>
                            </button>
                            <button
                                className="btn-primary"
                                onClick={() => setShowBatchModal('esocial')}
                                disabled={loading}
                            >
                                <span className="btn-icon">📋</span>
                                <span className="btn-text">eSocial</span>
                            </button>
                        </div>
                    </div>
                </section>

                {/* eSocial Section */}
                <section className="section">
                    <div className="section-header">
                        <h2 className="section-title">eSocial</h2>
                        <p className="section-description">Configurações de automação para o eSocial</p>
                    </div>
                    <div className="section-content">
                        <ConfigPanel
                            settings={settings}
                            onUpdate={handleUpdateSettings}
                        />
                    </div>
                </section>

                {/* REAP Section */}
                <ReapPanel
                    settings={settings}
                    onUpdate={(reapData) => handleUpdateSettings({ reapData })}
                />

            </main>

            {showBatchModal && (
                <BatchLoginModal
                    type={showBatchModal}
                    onConfirm={handleBatchLogin}
                    onCancel={() => setShowBatchModal(null)}
                />
            )}
        </div>
    );
};

export default App;
