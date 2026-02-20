import { defineConfig } from 'vite';
import { resolve } from 'path';

// Capturar target via variável de ambiente do processo
const target = process.env.TARGET;

if (!target) {
    throw new Error('TARGET env var is required for scripts build (e.g. TARGET=background)');
}

const entries = {
    background: resolve(__dirname, 'src/background/index.ts'),
    content_esocial: resolve(__dirname, 'src/content/esocial.ts'),
    content_reap: resolve(__dirname, 'src/content/reap.ts'),
    content_script: resolve(__dirname, 'src/content/content-script.ts')
};

const entryFile = entries[target as keyof typeof entries];
if (!entryFile) {
    throw new Error(`Unknown target: ${target}`);
}

// Build dos Scripts (IIFE - Standalone)
export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
            entry: entryFile,
            formats: ['iife'],
            name: `Sinpesca_${target}`, // Nome único para cada IIFE
            fileName: () => `assets/${target}.js` // Forçar nome exato sem .iife
        },
        rollupOptions: {
            output: {
                extend: true
            }
        }
    }
});
