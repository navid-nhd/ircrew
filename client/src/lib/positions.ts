// Persian + English labels for the crew-position codes we have observed on
// crew.iranair.com. Keep classifications data-driven so we never have to
// hard-code "Captain" anywhere; if we can't recognise the code we fall back to
// a neutral title rather than guessing a rank.

export type PosTier =
  | 'INSTRUCTOR' | 'CAPTAIN' | 'FIRST_OFFICER'
  | 'CHIEF_PURSER' | 'PURSER' | 'CABIN'
  | 'UNKNOWN';

export interface PosTheme {
  bg: string;
  text: string;
  ring: string;
}

const THEMES: Record<PosTier, PosTheme> = {
  INSTRUCTOR:    { bg: 'bg-fuchsia-500', text: 'text-fuchsia-700 dark:text-fuchsia-300', ring: 'ring-fuchsia-500/30' },
  CAPTAIN:       { bg: 'bg-rose-500',    text: 'text-rose-700 dark:text-rose-300',       ring: 'ring-rose-500/30'    },
  FIRST_OFFICER: { bg: 'bg-indigo-500',  text: 'text-indigo-700 dark:text-indigo-300',   ring: 'ring-indigo-500/30'  },
  CHIEF_PURSER:  { bg: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-300',     ring: 'ring-amber-500/30'   },
  PURSER:        { bg: 'bg-orange-500',  text: 'text-orange-700 dark:text-orange-300',   ring: 'ring-orange-500/30'  },
  CABIN:         { bg: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', ring: 'ring-emerald-500/30' },
  UNKNOWN:       { bg: 'bg-slate-500',   text: 'text-slate-700 dark:text-slate-200',     ring: 'ring-slate-500/20'   },
};

export interface PosInfo {
  tier: PosTier;
  /** Persian role label suitable for the user-facing card body. */
  labelFa: string;
  /** Latin role label (kept for the position chip on crew rows). */
  labelEn: string;
  theme: PosTheme;
}

const NEUTRAL: PosInfo = {
  tier: 'UNKNOWN',
  labelFa: 'خدمهٔ پرواز',
  labelEn: 'Crew Member',
  theme: THEMES.UNKNOWN,
};

// Order matters: the most specific patterns win. Codes like SFP2/IFP2 must
// match the purser tier *before* falling through to the bare "FP" rule.
const RULES: Array<{ re: RegExp; tier: PosTier; labelFa: string; labelEn: string }> = [
  { re: /^(IP|TRI|TRE|INST)/,           tier: 'INSTRUCTOR',    labelFa: 'خلبان مربی',          labelEn: 'Instructor Pilot' },
  { re: /^(CMD|CPT|CAP|CAPT|PIC)/,      tier: 'CAPTAIN',       labelFa: 'کاپیتان',             labelEn: 'Captain' },
  { re: /^(SIC|FO|F\/?O|COP)/,          tier: 'FIRST_OFFICER', labelFa: 'کمک‌خلبان',           labelEn: 'First Officer' },
  { re: /^(SFP|SCCM|CHF|CHIEF)/,        tier: 'CHIEF_PURSER',  labelFa: 'سرمهماندار ارشد',     labelEn: 'Chief Purser' },
  { re: /^(IFP|FP|PUR|PURSER)/,         tier: 'PURSER',        labelFa: 'سرمهماندار',          labelEn: 'Purser' },
  { re: /^(FA|CCM|FLIGHT.?ATTEND|CA)/,  tier: 'CABIN',         labelFa: 'مهماندار',            labelEn: 'Flight Attendant' },
];

export function classifyPosition(raw: string | null | undefined): PosInfo {
  const p = (raw ?? '').toUpperCase().trim();
  if (!p) return NEUTRAL;
  for (const r of RULES) {
    if (r.re.test(p)) {
      return { tier: r.tier, labelFa: r.labelFa, labelEn: r.labelEn, theme: THEMES[r.tier] };
    }
  }
  // Code unrecognised — keep the raw code as the visible English label so we
  // still surface useful info, but the Persian label stays neutral.
  return { ...NEUTRAL, labelEn: p };
}

/** Persian honorific title (e.g. for the header greeting) inferred from the
 *  user's own position. Falls back to a neutral "همکار" when unknown. */
export function honorificFromPosition(raw: string | null | undefined): string {
  const info = classifyPosition(raw);
  switch (info.tier) {
    case 'INSTRUCTOR':    return 'خلبان مربی';
    case 'CAPTAIN':       return 'کاپیتان';
    case 'FIRST_OFFICER': return 'کمک‌خلبان';
    case 'CHIEF_PURSER':  return 'سرمهماندار ارشد';
    case 'PURSER':        return 'سرمهماندار';
    case 'CABIN':         return 'مهماندار';
    default:              return 'همکار';
  }
}
