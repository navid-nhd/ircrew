// Glue between the foreground app and the background runner.
//   • Stores creds + current period into Capacitor Preferences so the
//     background script can read them via CapacitorKV.
//   • Requests notification permission (Android 13+ POST_NOTIFICATIONS).
//   • Creates the "ircrew-roster" Android notification channel.
//   • Schedules a foreground LocalNotification when the on-launch check
//     detects a change (so the user sees a status-bar alert even if the
//     background runner couldn't poll).

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';

const NATIVE = Capacitor.isNativePlatform();

export async function ensureNotificationsReady(): Promise<void> {
  if (!NATIVE) return;
  try {
    // Permission — Android 13+ requires this explicit grant.
    const status = await LocalNotifications.checkPermissions();
    if (status.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;  // user said no — silent fallback
    }
    // Android notification channel — created once, idempotent.
    await LocalNotifications.createChannel({
      id: 'ircrew-roster',
      name: 'تغییرات روستر',
      description: 'اعلان وقتی برنامهٔ پرواز شما تغییر کرد',
      importance: 4,        // HIGH
      visibility: 1,        // PUBLIC
      sound: 'default',
      vibration: true,
    });
  } catch {
    // Plugin missing / unavailable — non-fatal.
  }
}

/** Push creds + currently-watched period into Preferences so the background
 *  runner can fetch on its own. Called whenever the user logs in or picks
 *  a new period on the Roster tab. */
export async function publishBgContext(opts: {
  code: string; pass: string; period: string;
}): Promise<void> {
  if (!NATIVE) return;
  try {
    await Preferences.set({ key: 'bg.creds.code', value: opts.code });
    await Preferences.set({ key: 'bg.creds.pass', value: opts.pass });
    await Preferences.set({ key: 'bg.creds.period', value: opts.period });
  } catch { /* ignore */ }
}

/** Clear bg context on logout so the background runner stops trying. */
export async function clearBgContext(): Promise<void> {
  if (!NATIVE) return;
  try {
    await Preferences.remove({ key: 'bg.creds.code' });
    await Preferences.remove({ key: 'bg.creds.pass' });
    await Preferences.remove({ key: 'bg.creds.period' });
  } catch { /* ignore */ }
}

/** Foreground equivalent of the background notification — fired by the
 *  on-launch / on-focus auditor when it spots a change. Native notification
 *  ends up in the status bar just like the background one. */
export async function notifyChangeFromForeground(changeCount: number): Promise<void> {
  if (!NATIVE) return;
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now() % 1_000_000,
        title: 'برنامهٔ پرواز تغییر کرد',
        body: `${changeCount} تغییر در روستر ماه جاری شما ثبت شد.`,
        channelId: 'ircrew-roster',
      }],
    });
  } catch { /* ignore */ }
}
