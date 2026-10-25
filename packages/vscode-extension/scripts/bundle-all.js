import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extRoot, '..', '..');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      fs.mkdirSync(parent, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

// 1. Copy Web Dist into Extension Dist
const webDist = path.resolve(repoRoot, 'packages', 'web', 'dist');
const targetWebDist = path.resolve(extRoot, 'dist', 'web');

if (fs.existsSync(webDist)) {
  console.log(`[Bundle] Copying web companion assets to ${targetWebDist}...`);
  copyRecursiveSync(webDist, targetWebDist);
  console.log('[Bundle] Web companion assets bundled successfully.');
} else {
  console.warn('[Bundle Warning] packages/web/dist not found. Run npm run build in packages/web first.');
}

// 2. Copy Android APK if present
const apkSource = path.resolve(repoRoot, 'packages', 'web', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const targetApk = path.resolve(extRoot, 'dist', 'apk', 'app-debug.apk');

if (fs.existsSync(apkSource)) {
  console.log(`[Bundle] Copying debug APK to ${targetApk}...`);
  copyRecursiveSync(apkSource, targetApk);
  console.log('[Bundle] APK bundled successfully.');
} else {
  console.log('[Bundle Info] Local APK build not found. Skipping embedded APK.');
}

// 3. Ensure Interceptor is bundled in media
const interceptorSrc = path.resolve(repoRoot, 'packages', 'cli', 'assets', 'interceptor.js');
const targetInterceptor = path.resolve(extRoot, 'media', 'interceptor.js');

if (fs.existsSync(interceptorSrc)) {
  copyRecursiveSync(interceptorSrc, targetInterceptor);
  console.log('[Bundle] Interceptor hook synchronized.');
}
