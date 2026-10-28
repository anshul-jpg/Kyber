/**
 * Screen Capture Service - Lightweight desktop screen snapshot fallback.
 * Allows mobile user to view frozen desktop OS prompts / IDE modals when remote.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let cachedJpeg: Buffer | null = null;
let lastCaptureTime = 0;
const CAPTURE_COOLDOWN_MS = 1000; // 1 second rate limit

export async function captureDesktopSnapshot(): Promise<Buffer | null> {
  const now = Date.now();
  if (cachedJpeg && now - lastCaptureTime < CAPTURE_COOLDOWN_MS) {
    return cachedJpeg;
  }

  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const script = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
[Convert]::ToBase64String($ms.ToArray())
$g.Dispose()
$bmp.Dispose()
$ms.Dispose()
`.trim().replace(/\r?\n/g, '; ');

    const { stdout } = await execAsync(`powershell -NoProfile -Command "${script}"`, {
      timeout: 5000,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });

    const b64 = stdout.trim();
    if (!b64) return null;

    cachedJpeg = Buffer.from(b64, 'base64');
    lastCaptureTime = Date.now();
    return cachedJpeg;
  } catch (err) {
    return null;
  }
}
