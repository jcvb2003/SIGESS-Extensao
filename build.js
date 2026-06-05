import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const browserTarget = (process.argv[2] || "firefox").toLowerCase();
const validTargets = new Set(["firefox", "chrome"]);
const outputDir = path.join(__dirname, "dist", browserTarget);

if (!validTargets.has(browserTarget)) {
  console.error(
    `Invalid browser target "${browserTarget}". Use "firefox" or "chrome".`,
  );
  process.exit(1);
}

const targets = [
  "background",
  "content_esocial",
  "content_reap",
  "content_reap_turbo",
  "content_script",
  "content_auto_registration",
  "pesqbrasil_bridge",
  "reap_page_bridge",
  "caepf_bridge",
  "cadunico_bridge",
  "tse_bridge",
  "capture_indicator",
  "content_sdpa",
];

console.log(`Building extension for ${browserTarget}...`);
console.log(`Output directory: ${outputDir}`);
console.log("Building Popup UI...");
execSync("vite build", {
  stdio: "inherit",
  env: { ...process.env, BUILD_OUTPUT_DIR: outputDir },
});

try {
  const popupSource = path.join(outputDir, "src/popup/index.html");
  const popupDest = path.join(outputDir, "popup.html");
  const inspectorSource = path.join(outputDir, "src/popup/data_inspector.html");
  const inspectorDest = path.join(outputDir, "data_inspector.html");
  const filePickerSource = path.join(outputDir, "src/popup/file-picker.html");
  const filePickerDest = path.join(outputDir, "file_picker.html");

  const fixHtmlPaths = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, "utf8");
    // Remove as referências ao diretório original para que fiquem relativas à raiz
    content = content.replace(/\.\.\/\.\.\/assets\//g, "assets/");
    content = content.replace(/\.\/assets\//g, "assets/");
    content = content.replace(/src\/popup\//g, "");
    fs.writeFileSync(filePath, content);
    console.log(`Fixed paths in ${path.basename(filePath)}`);
  };

  if (fs.existsSync(popupSource)) {
    fs.copyFileSync(popupSource, popupDest);
    fixHtmlPaths(popupDest);
    console.log("Moved popup.html to root");
  }

  if (fs.existsSync(inspectorSource)) {
    fs.copyFileSync(inspectorSource, inspectorDest);
    fixHtmlPaths(inspectorDest);
    console.log("Moved data_inspector.html to root");
  }

  if (fs.existsSync(filePickerSource)) {
    fs.copyFileSync(filePickerSource, filePickerDest);
    fixHtmlPaths(filePickerDest);
    console.log("Moved file_picker.html to root");
  }

  const possibleIconSources = [
    path.join(__dirname, "public", "icon.png"),
    path.join(__dirname, "icon.png"),
    path.join(__dirname, "../icon.png"),
    path.join(__dirname, "dist", "icon.png"),
  ];
  const iconSource = possibleIconSources.find((iconPath) =>
    fs.existsSync(iconPath),
  );

  const iconDest = path.join(outputDir, "icon.png");
  if (iconSource) {
    fs.copyFileSync(iconSource, iconDest);
    console.log("Copied icon.png from", iconSource);
  } else {
    throw new Error(
      `icon.png not found. Checked: ${possibleIconSources.join(", ")}`,
    );
  }
} catch (e) {
  console.error("Error moving popup.html or icon", e);
  process.exit(1);
}

console.log("Building Scripts (IIFE)...");
targets.forEach((target) => {
  console.log(`   > Building ${target}...`);
  try {
    execSync("vite build -c vite.config.scripts.ts", {
      stdio: "inherit",
      env: { ...process.env, TARGET: target, BUILD_OUTPUT_DIR: outputDir },
    });
  } catch (e) {
    console.error(`Failed to build ${target}:`, e.message);
    process.exit(1);
  }
});

try {
  const manifestSource = path.join(
    __dirname,
    "manifests",
    `manifest.${browserTarget}.json`,
  );
  const manifestDest = path.join(outputDir, "manifest.json");

  if (!fs.existsSync(manifestSource)) {
    throw new Error(`Manifest not found: ${manifestSource}`);
  }

  // Get current version from package.json
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
  const version = pkg.version;

  // Load manifest, update version, and save to dist
  const manifest = JSON.parse(fs.readFileSync(manifestSource, "utf8"));
  manifest.version = version;
  
  fs.writeFileSync(manifestDest, JSON.stringify(manifest, null, 2));
  console.log(`Applied version ${version} to ${browserTarget} manifest at ${manifestDest}`);
} catch (e) {
  console.error("Failed to apply manifest:", e);
  process.exit(1);
}

console.log("Build Concluded!");
