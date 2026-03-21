import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import obfuscator from 'vite-plugin-javascript-obfuscator';

// Build apenas do Popup (React/Module)
export default defineConfig({
    plugins: [
        react(),
        obfuscator({
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
        outDir: 'dist',
        emptyOutDir: true, // Limpa na primeira passada
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'src/popup/index.html')
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name].js',
                assetFileNames: 'assets/[name].[ext]'
            }
        }
    }
});
