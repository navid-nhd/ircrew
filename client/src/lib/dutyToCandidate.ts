// Convert FDP entries (built from a real imported roster) into ProposedFlight
// candidates for the FTL Checker. We pick upcoming FDPs first (so the user
// sees what's about to happen), falling back to the most recent ones if no
// future flights remain in the imported month.

import type { DutyEntry, ProposedFlight } from '../ftl/rules/types';

const MAX_CANDIDATES = 5;

const toHHMM = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const fdpToCandidate = (e: DutyEntry): ProposedFlight => {
  const start = new Date(e.start);
  return {
    label: e.note ? `پرواز ${e.note}` : 'پرواز',
    reportingTimeLocal: e.start,
    estimatedDepartureLocal: e.start,
    estimatedArrivalLocal: e.end,
    referenceTimeHHMM: toHHMM(start),
    sectors: e.sectors ?? 1,
    scope: 'international',
    body: 'narrow',
    departureStation: e.startStation ?? 'home',
    arrivalStation: e.endStation ?? 'away',
    augmentedExtraFlightCrew: 0,
    restFacilityClass: 0,
    includesLongSector: false,
    useExtensionNoRest: false,
    useSplitDuty: false,
    splitDutyBreakMin: 180,
    splitDutyAccommodation: 'none',
    acclimState: 'B',
    cabinReportsEarlierByMin: 0,
    woclEncroachmentHours: 0,
    precededByStandbyType: 'none',
    precededByStandbyHours: 0,
    standbyStartedAtNight: false,
    tzDiffHours: e.tzDiffHours ?? 0,
    travellingMinOneWay: 30,
    delayMinutesFromReporting: 0,
    delayNotificationsCount: 0,
    modelCommanderDiscretion: true,
  };
};

/** Pick the most useful FDPs from an imported month and turn them into
 *  candidate flights. Prefers upcoming flights (start ≥ now), then falls back
 *  to the most-recent flights so the user always sees something to work with. */
export function fdpsToCandidates(entries: DutyEntry[]): ProposedFlight[] {
  const now = Date.now();
  const fdps = entries
    .filter((e) => e.kind === 'fdp')
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  if (fdps.length === 0) return [];

  const upcoming = fdps.filter((e) => new Date(e.start).getTime() >= now);
  const pick = upcoming.length > 0
    ? upcoming.slice(0, MAX_CANDIDATES)
    : fdps.slice(-MAX_CANDIDATES);

  return pick.map(fdpToCandidate);
}
