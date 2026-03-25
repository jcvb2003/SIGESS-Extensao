import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as any).VITE_APP_SECRET_MOCK = 'test-secret';

import { LicenseService } from '../../src/shared/services/license';

describe('License Security (Multi-Device)', () => {
    it('should verify signature correctly with devices and max_devices', async () => {
        const data = {
            ok: true,
            plan: 'paid',
            usage_count: 5,
            devices: 1,
            max_devices: 2,
            valid_until: '2026-12-31T23:59:59.000Z'
        };

        const secret = (import.meta as any).env?.VITE_APP_SECRET || 'test-secret';
        
        // Simular o que a Edge Function faria (assinatura HMAC SHA-256)
        const msg = `${data.ok}${data.plan || ""}${data.usage_count || ""}${data.devices || ""}${data.max_devices || ""}${data.valid_until}`;
        console.log('Test MSG:', msg);
        console.log('Secret used:', secret);
        
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const msgData = encoder.encode(msg);
        
        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
        const sig = Array.from(new Uint8Array(sigBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Verificar na classe LicenseService enviando a assinatura gerada
        // Nota: verifySignature é privado, mas performLiveCheck/checkLicense a utilizam internamente.
        // Como o objetivo é testar a lógica do HMAC, verificamos o funcionamento via mock de fetch se necessário
        // ou acessando o método privado via casting (apenas para teste)
        
        const isAuthentic = await (LicenseService as any).verifySignature(data, sig);
        expect(isAuthentic).toBe(true);
    });

    it('should fail if devices count is tampered with', async () => {
        const data = {
            ok: true,
            plan: 'paid',
            usage_count: 5,
            devices: 1,
            max_devices: 2,
            valid_until: '2026-12-31T23:59:59.000Z'
        };

        // Assinatura para devices: 1
        const sig = '...'; // Não importa o valor real aqui, o SignatureService deve recusar se os dados mudarem

        const tamperedData = { ...data, devices: 2 }; // Usuário tenta dizer que tem 2 devices
        
        // Regenerate real sig for comparison
        const msg = `${data.ok}${data.plan}${data.usage_count}${data.devices}${data.max_devices}${data.valid_until}`;
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey(
            "raw", encoder.encode('test-secret'), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(msg));
        const validSig = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const isAuthentic = await (LicenseService as any).verifySignature(tamperedData, validSig);
        expect(isAuthentic).toBe(false);
    });
});
