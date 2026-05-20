// OM-A 7.1.4.6 — Cabin Crew may report up to 60 minutes earlier than the
// cockpit reporting time. The FDP cap (Table 7.2 etc.) is computed against
// the COCKPIT reporting time, but the actual cabin FDP starts at the EARLIER
// cabin reporting time — so the cabin's effective FDP is up to 60 min longer.
// The corresponding check-out (FDP end + 30 min, per 7.1.4.12) is unchanged.

const MAX_EARLY_MIN = 60;

export interface CabinReportPlan {
  /** Cockpit reporting (input). */
  cockpitReportIso: string;
  /** Cabin reporting earlier-by minutes (0–60). Clamped. */
  earlyMinClamped: number;
  /** Resulting cabin reporting time. */
  cabinReportIso: string;
  /** Cockpit-frame FDP cap from the engine (caller passes in HH:MM). */
  cockpitFdpCap: string;
  /** Effective cabin FDP length (cap + earlyMin). */
  cabinFdpLengthHHMM: string;
  /** Latest legal cabin check-out time. */
  cabinCheckoutIso: string;
  /** Latest legal cabin block-on (check-out − 30 min). */
  cabinBlockOnIso: string;
  /** Was the early request clamped? */
  clamped: boolean;
  /** Persian explanatory note for the UI. */
  note: string;
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return h * 60 + (m || 0);
};
const fmtH = (mins: number): string =>
  `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

export function computeCabinReportWindow(
  cockpitReportIso: string,
  earlyMinRequested: number,
  cockpitFdpCap: string,
): CabinReportPlan {
  const clamped = earlyMinRequested > MAX_EARLY_MIN;
  const earlyMin = Math.max(0, Math.min(MAX_EARLY_MIN, Math.floor(earlyMinRequested)));

  const cockpitMs = new Date(cockpitReportIso).getTime();
  const cabinReportMs = cockpitMs - earlyMin * 60_000;

  const capMin = toMin(cockpitFdpCap);
  // Cabin FDP = cap (cockpit-frame) + early offset (cabin started earlier).
  const cabinFdpMin = capMin + earlyMin;

  // Check-out = FDP end + 30 min (7.1.4.12).
  const checkoutMs = cabinReportMs + cabinFdpMin * 60_000 + 30 * 60_000;
  const blockOnMs = checkoutMs - 30 * 60_000;

  const note = clamped
    ? `درخواست ${earlyMinRequested} دقیقه به سقف ${MAX_EARLY_MIN} دقیقه محدود شد (۷.۱.۴.۶).`
    : `${earlyMin} دقیقه زودتر از کاکپیت — FDP کابین = FDP کاکپیت + ${earlyMin}min.`;

  return {
    cockpitReportIso,
    earlyMinClamped: earlyMin,
    cabinReportIso: new Date(cabinReportMs).toISOString(),
    cockpitFdpCap,
    cabinFdpLengthHHMM: fmtH(cabinFdpMin),
    cabinCheckoutIso: new Date(checkoutMs).toISOString(),
    cabinBlockOnIso: new Date(blockOnMs).toISOString(),
    clamped,
    note,
  };
}
