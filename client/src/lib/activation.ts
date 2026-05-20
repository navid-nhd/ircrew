// Offline activation codes.
//
// MENTAL MODEL
// ─────────────
// Codes are derived from a single MASTER_SECRET via HMAC-SHA256 — one code
// per "sequence number" (1..N). The developer mints them up-front with the
// matching CLI script and hands one out per colleague (writing down which
// number went to whom in a private spreadsheet). The app validates by
// regenerating every possible code in range and checking for a match.
//
// Once a code is accepted on a device, we store `activated` in localStorage
// and never prompt again on that device. If the device is wiped or the app
// is reinstalled, the developer re-enters the same (or a different) code.
//
// This is intentionally NOT one-device-bound — that requires a server. What
// it gives you instead:
//   • Each code can be tracked in a spreadsheet (who got which sequence #).
//   • You can rotate codes (mint a new batch, retire the old) by re-shipping
//     the app with a higher MIN_SEQUENCE bound.
//   • Codes are unpredictable without MASTER_SECRET — colleagues can't guess.

// 32-char random secret. CHANGE THIS BEFORE FIRST RELEASE and never put the
// real value in a public repo. After change, every code minted earlier
// becomes invalid (which is one way to revoke a batch).
const MASTER_SECRET = 'ircrew-v1-2026-do-NOT-commit-real-secret';

// Total number of codes that can ever be generated. Increase if you exceed it.
const TOTAL_CODES = 5000;
// Optional: bump this on a rotation to retire all codes < MIN_SEQUENCE.
const MIN_SEQUENCE = 1;

const STORE_KEY = 'ircrew.activation.v1';

// HMAC-SHA256 implementation that runs in the browser (uses the Web Crypto API).
async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(sig);
}

// Base32-ish encoder using a 32-char unambiguous alphabet (no 0/O, 1/I, etc).
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function toBase32(bytes: Uint8Array, length: number): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  return out;
}

/** Produce the canonical code for a given sequence number. Format: XXXX-XXXX. */
export async function codeFor(seq: number): Promise<string> {
  const sig = await hmacSha256(MASTER_SECRET, `IRCREW#${seq}`);
  const s = toBase32(sig, 8);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

/** Strip the user's input down to comparable form (case-insensitive, dashes
 *  optional, whitespace stripped). */
const normalise = (input: string): string =>
  input.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Is this code valid against any sequence in [MIN_SEQUENCE, TOTAL_CODES]? */
export async function isValidCode(input: string): Promise<boolean> {
  const target = normalise(input);
  if (target.length !== 8) return false;
  // For typical TOTAL_CODES=5000 this runs in well under 100ms on any phone.
  for (let i = MIN_SEQUENCE; i <= TOTAL_CODES; i++) {
    const candidate = normalise(await codeFor(i));
    if (candidate === target) return true;
  }
  return false;
}

export interface ActivationRecord {
  activated: true;
  code: string;          // the user-facing dashed form, kept for support
  activatedAt: number;
}

export const activationStore = {
  isActivated(): boolean {
    try { return !!localStorage.getItem(STORE_KEY); }
    catch { return false; }
  },
  read(): ActivationRecord | null {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as ActivationRecord) : null;
    } catch { return null; }
  },
  save(code: string): void {
    const rec: ActivationRecord = { activated: true, code, activatedAt: Date.now() };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
  },
  clear(): void {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  },
};
