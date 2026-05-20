// OM-A 7.4.3 — Reserve rules.
//
// What we encode:
//   • Reserve max length: 168 consecutive hours.
//   • Protected sleep opportunity: at least 8 contiguous hours per calendar day
//     during which the crew member can sleep.
//   • Operator must give ≥10 h advance notice for an assignment.
//   • Contact prohibited 21:00–09:00 local except 60–90 min emergencies.
//
// Crew on this app pick a protected-sleep window when they go on reserve;
// every Iran Air call inside that window (or inside the 21:00–09:00 default
// if no custom window picked) gets logged as a violation incident.

export interface ReserveWindow {
  /** Local ISO when the reserve duty starts. */
  reserveStartIso: string;
  /** Local ISO when the reserve duty ends (max 168h after start). */
  reserveEndIso: string;
  /** Crew-chosen 8h protected-sleep window (per calendar day). */
  protectedSleep: { startLocalHHMM: string; endLocalHHMM: string };
}

export interface ContactEvent {
  id: string;
  /** When the call came in. */
  iso: string;
  /** Optional note from the user (e.g., "همای صدا کرد"). */
  note?: string;
  /** Optional flag — operator declared this an emergency assignment. */
  emergency?: boolean;
}

export interface ReserveViolation {
  contactId: string;
  contactIso: string;
  kind: 'inside-protected-sleep' | 'short-notice' | 'reserve-too-long' | 'inside-quiet-hours';
  message: string;
  /** OM-A reference for citation. */
  reference: string;
}

const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 9;

const isWithinHHMM = (iso: string, startHHMM: string, endHHMM: string): boolean => {
  const d = new Date(iso);
  const m = d.getHours() * 60 + d.getMinutes();
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const s = sh * 60 + (sm || 0);
  const e = eh * 60 + (em || 0);
  // Window may cross midnight (e.g., 22:00–06:00).
  return s <= e ? (m >= s && m < e) : (m >= s || m < e);
};

const isQuietHour = (iso: string): boolean => {
  const h = new Date(iso).getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
};

export function scanReserveContacts(
  window: ReserveWindow,
  contacts: ContactEvent[],
  /** When the operator notified an assignment, separate from random contacts. */
  assignments: Array<{ id: string; notifiedIso: string; reportingIso: string }> = [],
): ReserveViolation[] {
  const out: ReserveViolation[] = [];
  const startMs = new Date(window.reserveStartIso).getTime();
  const endMs = new Date(window.reserveEndIso).getTime();

  if (endMs - startMs > 168 * 3600_000) {
    out.push({
      contactId: '__window',
      contactIso: window.reserveStartIso,
      kind: 'reserve-too-long',
      message: `بازهٔ Reserve از ۱۶۸ ساعت بیشتر است (طول ≈ ${((endMs - startMs) / 3600_000).toFixed(1)}h).`,
      reference: '7.4.3',
    });
  }

  for (const c of contacts) {
    const t = new Date(c.iso).getTime();
    if (t < startMs || t > endMs) continue;
    if (c.emergency) continue;

    const inProtected = isWithinHHMM(c.iso, window.protectedSleep.startLocalHHMM, window.protectedSleep.endLocalHHMM);
    if (inProtected) {
      out.push({
        contactId: c.id,
        contactIso: c.iso,
        kind: 'inside-protected-sleep',
        message: `تماس داخل پنجرهٔ خواب محافظت‌شده (${window.protectedSleep.startLocalHHMM}–${window.protectedSleep.endLocalHHMM}).`,
        reference: '7.4.3',
      });
      continue;
    }
    if (isQuietHour(c.iso)) {
      out.push({
        contactId: c.id,
        contactIso: c.iso,
        kind: 'inside-quiet-hours',
        message: 'تماس داخل پنجرهٔ ۲۱:۰۰–۰۹:۰۰ — طبق ۷.۴.۳ ممنوع مگر در شرایط اضطراری.',
        reference: '7.4.3',
      });
    }
  }

  for (const a of assignments) {
    const notifMs = new Date(a.notifiedIso).getTime();
    const repMs = new Date(a.reportingIso).getTime();
    const hours = (repMs - notifMs) / 3600_000;
    if (hours < 10) {
      out.push({
        contactId: a.id,
        contactIso: a.notifiedIso,
        kind: 'short-notice',
        message: `ابلاغ تنها ${hours.toFixed(1)}h قبل از ریپورت — حداقل ۱۰ ساعت لازم است؛ حق رد دارید.`,
        reference: '7.4.3',
      });
    }
  }

  return out;
}

/** Suggest an 8h protected-sleep window centered around the user's habitual
 *  sleep time. Default: 23:00–07:00. */
export const DEFAULT_PROTECTED_SLEEP = { startLocalHHMM: '23:00', endLocalHHMM: '07:00' };
