import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import obfuscator from 'vite-plugin-javascript-obfuscator';

const outputDir = process.env.BUILD_OUTPUT_DIR || 'dist';

// Build apenas do Popup (React/Module)
export default defineConfig({
    base: './',
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
