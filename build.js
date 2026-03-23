const { execSync } = require('child_process');

const targets = ['background', 'content_esocial', 'content_reap', 'content_reap_turbo', 'content_script'];

console.log('🏗️ Building Popup UI...');
execSync('vite build', { stdio: 'inherit' });

// Workaround to flatten HTML output
try {
    // Windows specific move/copy or Node fs
    const fs = require('fs');
    const path = require('path');
    const source = path.join(__dirname, 'dist/src/popup/index.html');
    const dest = path.join(__dirname, 'dist/popup.html');


    if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
        console.log('Moved popup.html to root');
    }

    // Copy icon - Corrigido para buscar no diretório pai se não estiver em ./icon.png
    let iconSource = path.join(__dirname, 'icon.png');
    if (!fs.existsSync(iconSource)) {
        // Tenta buscar no pai
        iconSource = path.join(__dirname, '../icon.png');
    }

    const iconDest = path.join(__dirname, 'dist/icon.png');
    if (fs.existsSync(iconSource)) {
        fs.copyFileSync(iconSource, iconDest);
        console.log('Copied icon.png from', iconSource);
    } else {
        console.error('Warning: icon.png not found in . or ..');
    }
} catch (e) {
    console.error('Error moving popup.html or icon', e);
}

console.log('🛠️ Building Scripts (IIFE)...');
targets.forEach(target => {
    console.log(`   > Building ${target}...`);
    try {
        // Cross-platform env passing via options
        execSync(`vite build -c vite.config.scripts.ts`, {
            stdio: 'inherit',
            env: { ...process.env, TARGET: target }
        });
    } catch (e) {
        console.error(`Failed to build ${target}`);
        process.exit(1);
    }
});

console.log('✅ Build Concluded!');
