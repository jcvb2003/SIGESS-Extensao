import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../../src/background/utils/storage';

// Mock browser global
global.browser = {
    storage: {
        local: {
            get: vi.fn(),
            set: vi.fn(),
            remove: vi.fn()
        }
    }
} as any;

describe('StorageService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should save settings correctly', async () => {
        const settings = { consultarGuias: true } as any;
        (browser.storage.local.set as any).mockImplementation((data: any, cb: any) => cb());

        await StorageService.saveSettings(settings);

        expect(browser.storage.local.set).toHaveBeenCalledWith(
            { sinpescaSettings: settings },
            expect.any(Function)
        );
    });

    it('should retrieve settings with defaults', async () => {
        (browser.storage.local.get as any).mockImplementation((keys: any, cb: any) => {
            cb({}); // Empty result
        });

        const result = await StorageService.getSettings();
        expect(result.consultarGuias).toBe(false); // Default
        expect(result.selectedYear).toBe('current');
    });
});
