import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import obfuscator from 'vite-plugin-javascript-obfuscator';

const outputDir = process.env.BUILD_OUTPUT_DIR || 'dist';

// Carrega as variáveis de ambiente
const env = loadEnv('', process.cwd(), '');

// Build apenas do Popup (React/Module)
export default defineConfig({
    base: './',
    define: {
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
        'import.meta.env.VITE_APP_SECRET': JSON.stringify(env.VITE_APP_SECRET),
    },
    plugins: [
        react(),
        obfuscator({
            // @ts-ignore
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.75,
            numbersToExpressions: true,
            simplify: true,
            stringArray: true,
            stringArrayRotate: true,
            stringArrayShuffle: true,
            stringArrayThreshold: 0.75,
            splitStrings: true,
            splitStringsChunkLength: 10,
            identifierNamesGenerator: 'mangled'
        })
    ],
    build: {
        outDir: outputDir,
        emptyOutDir: true, // Limpa na primeira passada
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'src/popup/index.html'),
                data_inspector: resolve(__dirname, 'src/popup/data_inspector.html')
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }
    }
});
