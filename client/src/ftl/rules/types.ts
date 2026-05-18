// Types shared across the rules engine and UI.

import type { AircraftBody, CrewKind, FlightScope, RestClass, StationKind } from './tables';

export type Iso = string; // ISO datetime string (with TZ offset)

export type DutyKind =
  | 'fdp'           // Flight Duty Period
  | 'positioning'   // Positioning before/after operating (counts as duty)
  | 'training'      // Simulator/ground training (counts as duty)
  | 'sba'           // SBA Standby (00:00 → 14:00)
  | 'sbb'           // SBB Standby (12:00 → next day 02:00)
  | 'sbf'           // SBF Standby (free start, ≤16h)
  | 'airport_sb'    // Airport Standby
  | 'reserve'       // Reserve
  | 'day_off'       // Day off
  | 'recovery'      // Extended Recovery Rest
  | 'rest'          // ordinary Rest Period (informational)
  | 'admin'         // management/office
  ;

export interface DutyEntry {
  id: string;
  kind: DutyKind;
  /** Reporting / start of the activity (local time of the station). */
  start: Iso;
  /** End of duty / standby / day off. */
  end: Iso;
  /** Number of sectors flown — only relevant when kind = 'fdp'. */
  sectors?: number;
  /** Block hours of FDP (decimal). */
  blockHours?: number;
  /** Whether the duty was a "Night Duty" (encroaches 02:00–04:59 local accl.). */
  isNight?: boolean;
  /** Whether duty was an Early Start (05:00–05:59). */
  isEarly?: boolean;
  /** Whether duty was a Late Finish (23:00–01:59). */
  isLate?: boolean;
  /** TZ diff (hours) between the local time at start and acclimatization base. */
  tzDiffHours?: number;
  /** Was end station Home Base (THR/BND) or away? */
  endStation?: StationKind;
  /** Was start station Home Base or away? */
  startStation?: StationKind;
  /** Was an FDP extension due to in-flight rest used? */
  usedInflightRestExt?: boolean;
  /** Was an extension without in-flight rest used? */
  usedExtensionNoRest?: boolean;
  /** Was a split duty used? */
  usedSplitDuty?: boolean;
  /** Free-text note. */
  note?: string;
  /** For standby that converted to an FDP — the FDP entry id (informational). */
  convertedToFdpId?: string;
  /** True if duty ends at IKA (so Rest starts +2h instead of +1h). */
  endsAtIKA?: boolean;
  /** Pre-FDP same-day Mixed Duty (Simulator/Admin/Training) minutes that count toward FDP (7.1.4.14). */
  preFdpMixedDutyMin?: number;
}

export interface CrewProfile {
  fullName: string;
  role: CrewKind;
  homeBase: 'THR' | 'BND';
  /** Has FRM been implemented for this person? Per OM-A, currently FALSE. */
  hasFRM: boolean;
}

export interface ProposedFlight {
  /** Optional human label for the candidate ("پرواز فردا THR-DXB"). */
  label?: string;
  /** Estimated Time of Departure (Block-off) — local. */
  estimatedDepartureLocal?: Iso;
  /** Estimated Time of Arrival (Block-on) at final destination — local. */
  estimatedArrivalLocal?: Iso;
  /** Date/time of reporting at the designated reporting point (local). */
  reportingTimeLocal: Iso;
  /** Local time of FDP reference time (often same as reporting). HH:MM only. */
  referenceTimeHHMM: string;
  /** Number of sectors planned in this FDP. */
  sectors: number;
  /** Domestic vs international. */
  scope: FlightScope;
  /** Aircraft body. */
  body: AircraftBody;
  /** Departure station (home / away). */
  departureStation: StationKind;
  /** Arrival/end station for this FDP (home / away). */
  arrivalStation: StationKind;
  /** Will this FDP use augmentation with extra flight crew (1 or 2 extra)?  */
  augmentedExtraFlightCrew: 0 | 1 | 2;
  /** Rest facility class for in-flight rest, if any. 0 = no in-flight rest. */
  restFacilityClass: 0 | RestClass;
  /** Includes a sector longer than 9h continuous and ≤2 sectors? Picks Table 7.5. */
  includesLongSector: boolean;
  /** Use extension WITHOUT in-flight rest? Picks Table 7.3. */
  useExtensionNoRest: boolean;
  /** Use Split Duty? */
  useSplitDuty: boolean;
  /** Break duration during split duty (minutes). */
  splitDutyBreakMin?: number;
  /** Was Suitable Accommodation provided during the split-duty break? */
  splitDutyAccommodation?: 'suitable' | 'accommodation' | 'none';
  /** Crew acclimatization at start of FDP. */
  acclimState: 'B' | 'D' | 'X';
  /** Cabin reports earlier than flight crew? minutes (≤60). 0 if not. */
  cabinReportsEarlierByMin?: number;
  /** Hours of WOCL (02:00–05:59) encroached by FDP, used for table 7.3 sector cap. */
  woclEncroachmentHours: number;
  /** Connected to a preceding standby (other than airport)? Hours of standby actually elapsed before reporting. */
  precededByStandbyHours?: number;
  /** Type of preceding standby (if any). */
  precededByStandbyType?: 'airport' | 'home' | 'hotel' | 'none';
  /** Did the standby start between 23:00 and 07:00? (those hours don't shrink FDP) */
  standbyStartedAtNight?: boolean;
  /** TZ difference (h) between Reference Time at this FDP and the acclim base. */
  tzDiffHours: number;
  /** Travelling time (one-way) from suitable accommodation to reporting point, minutes. */
  travellingMinOneWay?: number;
  /** Delay (minutes) from announced reporting time. Used for 7.2.4 calculation. */
  delayMinutesFromReporting?: number;
  /** How many times has IRAN AIR notified delayed reporting (max 3 per 7.2.1). */
  delayNotificationsCount?: number;
  /** Whether to use Commander's Discretion modeling (7.3.3). */
  modelCommanderDiscretion?: boolean;
  /** Pre-FDP same-day Mixed Duty (Simulator/Admin/Training) minutes that should be added to FDP (7.1.4.14). */
  preFdpMixedDutyMin?: number;
}

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info';

export interface CheckResult {
  id: string;
  reference: string;
  title: string;
  status: CheckStatus;
  message: string;
  details?: string;
  /** Numeric value found, for UI display (e.g., "current cumulative duty hours"). */
  value?: string;
  /** Limit value for UI context. */
  limit?: string;
  /** Step-by-step calculation breakdown shown to the user. */
  calculation?: CalculationStep[];
}

export interface CalculationStep {
  label: string;       // What this step is (e.g., "طول Duty قبلی")
  formula?: string;    // The formula (e.g., "Reporting → Check-out")
  value: string;       // The numeric result (e.g., "12:50")
  note?: string;       // Optional rule note (e.g., "max(prev, 12h)")
}

/** Detailed analysis of a failed/warning rule, generated for the user. */
export interface AnalysisDetail {
  ruleId: string;            // e.g., 'cumulative-Cumulative Duty / 7d'
  reference: string;         // e.g., '7.1.4.1'
  title: string;             // human title
  status: CheckStatus;       // fail/warn
  rule: string;              // the rule itself, in Persian
  violation: string;         // what specifically failed, with numbers
  remedy: string;            // suggested remedies, in Persian
  quote?: string;            // optional original-text reference
  calculation?: CalculationStep[];  // step-by-step breakdown
}

export interface RuleEngineResult {
  fdpAllowedHHMM: string | null;        // computed maximum FDP for the proposed flight
  fdpRequiredHHMM: string | null;       // an estimated required FDP from sectors+departure (informational)
  /** FDP allowed if Commander uses discretion (7.3.3). null if not allowed. */
  fdpWithCommanderDiscretionHHMM: string | null;
  /** Effective FDP given delayed reporting (7.2.4). */
  fdpAfterDelayHHMM: string | null;
  /** Notes about delay handling for the user. */
  delayNote?: string;
  /** Estimated FDP duration based on ETD/ETA (HH:MM). */
  estimatedFdpHHMM: string | null;
  /** Estimated Block Time based on ETD/ETA (HH:MM). */
  estimatedBlockHHMM: string | null;
  /** Over-duty margin in minutes. >0 means flight needs more FDP than allowed. */
  overDutyMinutes: number;
  /** True if over-duty can be covered by Commander's Discretion (within +2h/+3h). */
  coverableByCmdDiscretion: boolean;
  /** Plain-Persian over-duty status string. */
  overDutyStatus: string;
  checks: CheckResult[];
  /** Detailed Persian explanations of each FAIL and WARN. */
  analysis: AnalysisDetail[];
  fitToFly: boolean;                    // TRUE if no fail
  hasWarnings: boolean;
}
