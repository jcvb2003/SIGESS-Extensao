import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getReapPdfCacheForPreset,
  saveReapPdfCacheForPreset,
  removeReapPdfCacheForPreset,
  REAP_PDF_CACHES_STORAGE_KEY
} from '../../src/modules/reap-mpa/pdf-cache';

const storageMock: Record<string, any> = {};

globalThis.browser = {
  storage: {
    local: {
      get: vi.fn().mockImplementation((keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const res: Record<string, any> = {};
        for (const k of keyList) {
          if (k in storageMock) res[k] = storageMock[k];
        }
        return Promise.resolve(res);
      }),
      set: vi.fn().mockImplementation((data: Record<string, any>) => {
        Object.assign(storageMock, data);
        return Promise.resolve();
      }),
      remove: vi.fn().mockImplementation((keys: string | string[]) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
          delete storageMock[k];
        }
        return Promise.resolve();
      }),
    },
  },
} as any;

describe('pdf-cache migration and removal', () => {
  beforeEach(() => {
    for (const key of Object.keys(storageMock)) {
      delete storageMock[key];
    }
    vi.clearAllMocks();
  });

  it('migrates legacy cache to preset and removes the legacy storage key', async () => {
    storageMock['sigessReapPdfCache'] = { b64: 'JVBERi0xLjQK...', filename: 'defeso.pdf' };

    const cache = await getReapPdfCacheForPreset('preset-1');
    expect(cache).toEqual({ b64: 'JVBERi0xLjQK...', filename: 'defeso.pdf' });

    // Legacy key must have been removed from storage
    expect(storageMock['sigessReapPdfCache']).toBeUndefined();
    // Cache must now be inside the preset map
    expect(storageMock[REAP_PDF_CACHES_STORAGE_KEY]).toEqual({
      'preset-1': { b64: 'JVBERi0xLjQK...', filename: 'defeso.pdf' },
    });
  });

  it('removes preset cache and ensures legacy cache is also removed', async () => {
    storageMock[REAP_PDF_CACHES_STORAGE_KEY] = {
      'preset-1': { b64: 'JVBERi0xLjQK...', filename: 'defeso.pdf' },
    };
    storageMock['sigessReapPdfCache'] = { b64: 'JVBERi0xLjQK...', filename: 'defeso.pdf' };

    await removeReapPdfCacheForPreset('preset-1');

    expect(storageMock[REAP_PDF_CACHES_STORAGE_KEY]['preset-1']).toBeUndefined();
    expect(storageMock['sigessReapPdfCache']).toBeUndefined();

    // Verifying that after removal, calling getReapPdfCacheForPreset returns null and does NOT resurrect the PDF
    const result = await getReapPdfCacheForPreset('preset-1');
    expect(result).toBeNull();
  });

  it('removes legacy cache even when preset cache did not exist yet', async () => {
    storageMock['sigessReapPdfCache'] = { b64: 'JVBERi0xLjQK...', filename: 'old.pdf' };

    await removeReapPdfCacheForPreset('preset-unknown');

    expect(storageMock['sigessReapPdfCache']).toBeUndefined();
    const result = await getReapPdfCacheForPreset('preset-unknown');
    expect(result).toBeNull();
  });

  it('saves new cache to preset and cleans legacy key', async () => {
    storageMock['sigessReapPdfCache'] = { b64: 'old...', filename: 'old.pdf' };

    await saveReapPdfCacheForPreset('preset-2', { b64: 'new...', filename: 'new.pdf' });

    expect(storageMock['sigessReapPdfCache']).toBeUndefined();
    expect(storageMock[REAP_PDF_CACHES_STORAGE_KEY]['preset-2']).toEqual({
      b64: 'new...',
      filename: 'new.pdf',
    });
  });
});
