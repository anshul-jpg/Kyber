let wakeLockSentinel: any = null;

/**
 * Keeps the mobile screen ON (prevents display idle / turning black while speaking or recording).
 * Uses both Native Android window flag (FLAG_KEEP_SCREEN_ON) and W3C Screen Wake Lock API.
 */
export async function acquireWakeLock(): Promise<void> {
  // 1. Native Android Bridge
  if (typeof window !== 'undefined' && (window as any).AndroidHost?.setKeepScreenOn) {
    try {
      (window as any).AndroidHost.setKeepScreenOn(true);
    } catch {}
  }

  // 2. Standard Web Screen Wake Lock API
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
    try {
      if (!wakeLockSentinel) {
        wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
          wakeLockSentinel = null;
        });
      }
    } catch (e) {
      // Ignore if unsupported or battery-restricted
    }
  }
}

/**
 * Releases the screen wake lock, returning the display to normal timeout.
 */
export async function releaseWakeLock(): Promise<void> {
  // 1. Native Android Bridge
  if (typeof window !== 'undefined' && (window as any).AndroidHost?.setKeepScreenOn) {
    try {
      (window as any).AndroidHost.setKeepScreenOn(false);
    } catch {}
  }

  // 2. Standard Web Screen Wake Lock API
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {}
    wakeLockSentinel = null;
  }
}
