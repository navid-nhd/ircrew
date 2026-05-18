import type { CrewProfile, DutyEntry, ProposedFlight, RuleEngineResult } from '../rules/types';
import { evaluate } from '../rules/engine';
import { toJalaali } from 'jalaali-js';

const PERSIAN_MONTHS_SHORT = ['فرو','ارد','خرد','تیر','مرد','شهر','مهر','آبا','آذر','دی','بهم','اسف'];
const toFa = (n: number | string) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d, 10)]);

const fmtJDate = (iso: string): string => {
  const d = new Date(iso);
  const j = toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${toFa(j.jd)} ${PERSIAN_MONTHS_SHORT[j.jm - 1]}`;
};

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return toFa(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
};

interface Props {
  candidates: ProposedFlight[];
  activeIndex: number;
  profile: CrewProfile;
  history: DutyEntry[];
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
}

export default function CandidateBar({
  candidates, activeIndex, profile, history, onSelect, onAdd, onDelete, onDuplicate,
}: Props) {
  return (
    <div className="cand-bar">
      <div className="cand-bar-head">
        <span className="cand-bar-title">پروازهای کاندید</span>
        <button className="btn btn-primary" onClick={onAdd}>+ افزودن پرواز جدید</button>
      </div>
      <div className="cand-pills">
        {candidates.map((c, i) => {
          const r = evaluate({ profile, history, proposed: c });
          const verdict = !r.fitToFly ? 'no-go' : r.hasWarnings ? 'warn' : 'go';
          const label = c.label?.trim() || `پرواز ${toFa(i + 1)}`;
          const dateStr = c.reportingTimeLocal ? fmtJDate(c.reportingTimeLocal) : '';
          const timeStr = c.reportingTimeLocal ? fmtTime(c.reportingTimeLocal) : '';
          return (
            <div key={i}
              className={`cand-pill ${verdict} ${i === activeIndex ? 'active' : ''}`}
              onClick={() => onSelect(i)}
            >
              <div className="cand-row">
                <span className="cand-num">{toFa(i + 1)}</span>
                <span className="cand-label">{label}</span>
                <span className={`cand-verdict v-${verdict}`}>
                  {verdict === 'go' ? '✓' : verdict === 'warn' ? '!' : '✕'}
                </span>
              </div>
              <div className="cand-meta">
                <span>{dateStr} · {timeStr}</span>
                <span className="cand-fdp">
                  {r.estimatedFdpHHMM ? `FDP ~${r.estimatedFdpHHMM}` : ''}
                  {r.fdpAllowedHHMM ? ` / مجاز ${r.fdpAllowedHHMM}` : ''}
                </span>
              </div>
              <div className="cand-actions" onClick={(e) => e.stopPropagation()}>
                <button className="cand-btn" onClick={() => onDuplicate(i)} title="کپی برای روز بعد">📋</button>
                {candidates.length > 1 && (
                  <button className="cand-btn cand-del" onClick={() => onDelete(i)} title="حذف">×</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { RuleEngineResult };
