import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../../src/background/utils/storage';

globalThis.browser = {
    storage: {
        local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined)
        }
    }
} as any;

describe('StorageService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should save settings correctly', async () => {
        const settings = { consultarGuias: true } as any;
        (browser.storage.local.set as any).mockResolvedValue(undefined);

        await StorageService.saveSettings(settings);

        expect(browser.storage.local.set).toHaveBeenCalledWith(
            { sigessSettings: settings }
        );
    });

    it('should retrieve settings with defaults', async () => {
        (browser.storage.local.get as any).mockResolvedValue({});

        const result = await StorageService.getSettings();
        expect(result.consultarGuias).toBe(false);
        expect(result.selectedYear).toBe('current');
    });
});
