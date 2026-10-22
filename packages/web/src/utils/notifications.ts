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

// Register notification actions with Allow and Deny buttons
export async function initNotificationActions(
  onAction?: (actionId: 'allow' | 'deny', requestId?: string) => void
): Promise<void> {
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'PERMISSION_GATE',
          actions: [
            { id: 'allow', title: 'Allow', foreground: false },
            { id: 'deny', title: 'Deny', foreground: false, destructive: true },
          ],
        },
      ],
    });

    if (onAction) {
      await LocalNotifications.removeAllListeners();
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const requestId = action.notification.extra?.requestId;
        if (action.actionId === 'allow' || action.actionId === 'deny') {
          onAction(action.actionId, requestId);
          try {
            LocalNotifications.cancel({ notifications: [{ id: action.notification.id }] });
          } catch {}
          try {
            if ((window as any).AndroidHost?.minimizeApp) {
              (window as any).AndroidHost.minimizeApp();
            }
          } catch {}
        }
      });
    }
  } catch {}
}

export const SINGLE_PERSISTENT_NOTIFICATION_ID = 9001;

// Clean raw Markdown symbols, links, and code fences into smooth, human-readable notification text
export function sanitizeNotificationText(raw: string): string {
  if (!raw) return '';
  return raw
    // Convert markdown links [Text](url) -> Text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove raw file URLs (e.g. file:///d:/...)
    .replace(/file:\/\/\/[^\s)]+/g, '')
    // Remove markdown headers #, ##, ###
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italics **text** or *text*
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,3}([^_]+)_{1,3}/g, '$1')
    // Remove inline code backticks `code` -> code
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks ```...``` -> [Code snippet]
    .replace(/```[\s\S]*?```/g, '[Code snippet]')
    // Remove blockquotes >
    .replace(/^>\s+/gm, '')
    // Remove markdown bullets - , * , +
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Remove numbered lists 1. 2.
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Collapse newlines and multiple spaces into clean readable prose
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Updates the ONE single persistent notification in-place (zero notification spam)
export function updatePersistentCompanionNotification(
  title: string,
  content: string,
  requestId?: string,
  isAlert: boolean = false,
  subtext?: string
): void {
  const cleanTitle = sanitizeNotificationText(title);
  const cleanContent = sanitizeNotificationText(content);

  // 1. Android APK: update the ongoing foreground service notification directly
  if (typeof window !== 'undefined' && (window as any).AndroidHost?.updatePersistentNotification) {
    (window as any).AndroidHost.updatePersistentNotification(
      cleanTitle,
      cleanContent,
      requestId || null,
      isAlert,
      subtext || 'Remote Active'
    );
    return;
  }

  // 2. Web / PWA fallback: use the exact same tag 'antigravity-live-status' so it updates in place!
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(cleanTitle, {
        body: cleanContent,
        icon: '/favicon.ico',
        tag: 'antigravity-live-status',
      });
    } catch {}
  }
}

export async function dispatchApprovalNotification(
  requestId: string,
  toolName: string,
  command: string
): Promise<void> {
  playAlertSound();

  const cleanCmd = sanitizeNotificationText(command);
  const body = cleanCmd.length > 100 ? `${cleanCmd.slice(0, 100)}...` : cleanCmd;
  const friendlyTool = toolName ? toolName.replace(/^[a-z_]+:/, '').replace(/_/g, ' ') : 'Action';
  const title = `Approval Required: ${friendlyTool}`;

  // Update the single persistent foreground notification with inline [Allow] [Deny] buttons & alert
  updatePersistentCompanionNotification(title, body, requestId, true, 'Gate Paused');

  // Fallback to LocalNotification with fixed ID (never random) if not in AndroidHost
  if (typeof window === 'undefined' || !(window as any).AndroidHost) {
    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: SINGLE_PERSISTENT_NOTIFICATION_ID,
            actionTypeId: 'PERMISSION_GATE',
            extra: { requestId },
          },
        ],
      });
    } catch {}
  }
}

export function clearApprovalNotification(): void {
  updatePersistentCompanionNotification('Remote Active', 'Supervising workspace — Ready', undefined, false, 'Antigravity IDE');
  try {
    LocalNotifications.cancel({ notifications: [{ id: SINGLE_PERSISTENT_NOTIFICATION_ID }] });
  } catch {}
}
