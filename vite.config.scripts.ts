import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

// Capturar target via variável de ambiente do processo
const target = process.env.TARGET;
const outputDir = process.env.BUILD_OUTPUT_DIR || 'dist';

if (!target) {
    throw new Error('TARGET env var is required for scripts build (e.g. TARGET=background)');
}

const entries = {
    background: resolve(__dirname, 'src/background/index.ts'),
    content_esocial: resolve(__dirname, 'src/modules/esocial/form-automation.ts'),
    content_reap: resolve(__dirname, 'src/entries/reap.ts'),
    content_reap_turbo: resolve(__dirname, 'src/modules/reap-mpa/turbo-filler.ts'),
    content_script: resolve(__dirname, 'src/entries/content-script.ts'),
    content_auto_registration: resolve(__dirname, 'src/entries/auto-registration.ts'),
    pesqbrasil_bridge: resolve(__dirname, 'src/modules/automation/pesqbrasil/bridge.ts'),
    caepf_bridge: resolve(__dirname, 'src/modules/automation/caepf/bridge.ts'),
    cadunico_bridge: resolve(__dirname, 'src/modules/automation/cadunico/bridge.ts'),
    tse_bridge: resolve(__dirname, 'src/modules/automation/tse/bridge.ts'),
    capture_indicator: resolve(__dirname, 'src/modules/debug/CaptureIndicator.ts')
};

const entryFile = entries[target as keyof typeof entries];
if (!entryFile) {
    throw new Error(`Unknown target: ${target}`);
}

// Build dos Scripts (IIFE - Standalone)
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd());
    
    return {
        define: {
            'import.meta.env.VITE_APP_SECRET': JSON.stringify(env.VITE_APP_SECRET)
        },
        plugins: [],
        build: {
            outDir: outputDir,
            emptyOutDir: false,
            minify: true,
            lib: {
                entry: entryFile,
                formats: ['iife'],
                name: `SIGESS_${target}`,
                fileName: () => `assets/${target}.js`
            },
            rollupOptions: {
                output: {
                    extend: true
                }
            }
        }
    };
});
