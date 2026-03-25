import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFingerprint } from '../../src/shared/utils/fingerprint';

globalThis.browser = {
    storage: {
        local: {
            get: vi.fn(),
            set: vi.fn()
        }
    },
    runtime: {
        getPlatformInfo: vi.fn().mockResolvedValue({ os: 'win' })
    }
} as any;

describe('Fingerprint Stability', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return the stored UUID and ignore browser state', async () => {
        const mockUuid = '550e8400-e29b-41d4-a716-446655440000';
        (browser.storage.local.get as any).mockResolvedValue({ fp_id: mockUuid });

        const id1 = await getFingerprint();
        
        // Simular mudança de estado que antes afetaria o hash
        // (hardwareConcurrency, language, timezone etc são globais que não mudamos aqui, 
        // mas o código novo nem os acessa mais)
        
        expect(id1).toBe(mockUuid);
        expect(browser.storage.local.get).toHaveBeenCalledWith('fp_id');
    });

    it('should generate a new UUID if none exists and persist it', async () => {
        (browser.storage.local.get as any).mockResolvedValue({});
        
        const id = await getFingerprint();
        
        expect(id).toMatch(/^[0-9a-f-]{36}$/); // Formato UUID
        expect(browser.storage.local.set).toHaveBeenCalled();
    });
});
