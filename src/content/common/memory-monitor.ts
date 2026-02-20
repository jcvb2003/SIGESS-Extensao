export const MemoryMonitor = {
    _snapshots: new WeakMap(),
    _counters: new Map<string, number>(),

    takeSnapshot(label: string) {
        if ((performance as any).memory) {
            const pMem = (performance as any).memory;
            const snapshot = {
                label,
                timestamp: Date.now(),
                used: pMem.usedJSHeapSize,
                total: pMem.totalJSHeapSize,
                limit: pMem.jsHeapSizeLimit
            };
            // @ts-ignore
            this._snapshots.set(this, snapshot);
            return snapshot;
        }
        return null;
    },

    compareSnapshots(snapshot1: any, snapshot2: any) {
        if (!snapshot1 || !snapshot2) return null;
        const diff = snapshot2.used - snapshot1.used;
        const percentChange = ((diff / snapshot1.used) * 100);
        return {
            diffBytes: diff,
            diffMB: Math.round(diff / 1024 / 1024 * 100) / 100,
            percentChange: Math.round(percentChange * 100) / 100
        };
    },

    incrementCounter(key: string) {
        this._counters.set(key, (this._counters.get(key) || 0) + 1);
    },

    cleanup() {
        // @ts-ignore
        this._snapshots.delete(this);
        this._counters.clear();
    }
};
