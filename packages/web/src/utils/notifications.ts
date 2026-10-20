import { LocalNotifications } from '@capacitor/local-notifications';

// Synthesize a clean 800Hz gentle tactile alert chime via Web Audio (0 external audio assets needed)
export function playAlertSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.18);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  // 1. Capacitor Native Android
  try {
    const capPerm = await LocalNotifications.requestPermissions();
    if (capPerm.display === 'granted') return true;
  } catch {}

  // 2. Web Browser / PWA
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch {}
  }
  return false;
}

// Register notification actions with Approve and Reject buttons
export async function initNotificationActions(
  onAction?: (actionId: string, requestId?: string) => void
): Promise<void> {
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'PERMISSION_GATE',
          actions: [
            { id: 'approve', title: '✓ Approve', foreground: false },
            { id: 'deny', title: '✕ Reject', foreground: false, destructive: true },
          ],
        },
      ],
    });

    if (onAction) {
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const requestId = action.notification.extra?.requestId;
        onAction(action.actionId, requestId);
      });
    }
  } catch {}
}

export async function dispatchApprovalNotification(
  toolName: string,
  command: string,
  requestId?: string
): Promise<void> {
  // Play alert audio
  playAlertSound();

  const title = `🔔 Approval: ${toolName}`;
  const body = command.length > 80 ? `${command.slice(0, 80)}...` : command;

  // 1. Try Capacitor Native Android LocalNotification with inline action buttons
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Math.floor(Math.random() * 100000),
          actionTypeId: 'PERMISSION_GATE',
          extra: { requestId },
        },
      ],
    });
    return;
  } catch {}

  // 2. Fallback to Web Browser / PWA Notification
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'antigravity-approval',
      });
    } catch {}
  }
}
