import type { RuleEngineResult, CheckResult, AnalysisDetail, ProposedFlight, CalculationStep } from '../rules/types';
import { toJalaali } from 'jalaali-js';

interface Props {
  result: RuleEngineResult;
  candidates?: ProposedFlight[];
  allResults?: RuleEngineResult[];
  activeIndex?: number;
}

const ICON: Record<CheckResult['status'], string> = {
  pass: '✓', fail: '✕', warn: '!', info: 'i',
};

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

export default function ResultsPanel({ result, candidates, allResults, activeIndex }: Props) {
  const fails = result.checks.filter(c => c.status === 'fail');
  const warns = result.checks.filter(c => c.status === 'warn');
  const passes = result.checks.filter(c => c.status === 'pass');
  const infos = result.checks.filter(c => c.status === 'info');

  const verdict =
    !result.fitToFly ? 'no-go' :
    result.hasWarnings ? 'warn' :
    'go';

  const verdictText =
    verdict === 'go' ? 'GO — مجاز برای پرواز' :
    verdict === 'warn' ? 'GO با هشدار' :
    'NO-GO — غیرمجاز';

  const failAnalysis = result.analysis.filter(a => a.status === 'fail');
  const warnAnalysis = result.analysis.filter(a => a.status === 'warn');

  const hasMultipleCandidates = candidates && allResults && candidates.length > 1;

  // Over-Duty strip status
  let overDutyClass: 'safe' | 'cmd' | 'danger' | null = null;
  if (result.estimatedFdpHHMM && result.fdpAllowedHHMM) {
    if (result.overDutyMinutes <= 0) overDutyClass = 'safe';
    else if (result.coverableByCmdDiscretion) overDutyClass = 'cmd';
    else overDutyClass = 'danger';
  }

  return (
    <div>
      {/* Comparison cards when multiple candidates — mobile-friendly grid */}
      {hasMultipleCandidates && (
        <div className="compare-grid">
          <h3 className="compare-title">مقایسهٔ پروازهای کاندید</h3>
          <div className="compare-cards">
            {candidates!.map((c, i) => {
              const r = allResults![i];
              const v = !r.fitToFly ? 'no-go' : r.hasWarnings ? 'warn' : 'go';
              const issues = r.checks
                .filter(ch => ch.status === 'fail' || ch.status === 'warn')
                .slice(0, 3)
                .map(ch => ch.title);
              const overMin = r.overDutyMinutes;
              const overDuty =
                overMin > 0
                  ? `+${toFa(Math.floor(overMin / 60))}:${toFa(String(overMin % 60).padStart(2, '0'))}`
                  : overMin < 0
                    ? `−${toFa(Math.floor(Math.abs(overMin) / 60))}:${toFa(String(Math.abs(overMin) % 60).padStart(2, '0'))}`
                    : '—';
              return (
                <div key={i} className={`cmp-card ${v} ${i === activeIndex ? 'active' : ''}`}>
                  <div className="cmp-head">
                    <span className="cmp-num">{toFa(i + 1)}</span>
                    <span className="cmp-label">{c.label?.trim() || `پرواز ${toFa(i + 1)}`}</span>
                    <span className={`verdict-badge ${v}`}>
                      {v === 'go' ? 'GO' : v === 'warn' ? 'WARN' : 'NO-GO'}
                    </span>
                  </div>
                  <div className="cmp-date">
                    <span className="cmp-l">📅 Reporting:</span>
                    <span className="num">{fmtJDate(c.reportingTimeLocal)} · {fmtTime(c.reportingTimeLocal)}</span>
                  </div>
                  <div className="cmp-stats">
                    <div className="cmp-stat">
                      <span className="l">FDP موردنیاز</span>
                      <span className="v">{r.estimatedFdpHHMM ?? '—'}</span>
                    </div>
                    <div className="cmp-stat">
                      <span className="l">FDP مجاز</span>
                      <span className="v">{r.fdpAllowedHHMM ?? '—'}</span>
                    </div>
                    <div className="cmp-stat">
                      <span className="l">Over-Duty</span>
                      <span className={`v ${overMin > 0 ? 'over' : overMin < 0 ? 'under' : ''}`}>{overDuty}</span>
                    </div>
                  </div>
                  {issues.length > 0 && (
                    <div className="cmp-issues">
                      <span className="cmp-l">⚠️ مشکلات:</span>
                      <ul>{issues.map((t, j) => <li key={j}>{t}</li>)}</ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="help" style={{ marginTop: 10, fontSize: '9.5pt' }}>
            کارت برجسته‌شده پرواز فعلی است. برای دیدن جزئیات هر پرواز روی pill آن در بالا کلیک کن.
          </div>
        </div>
      )}

      {/* Main verdict strip */}
      <div className={`fdp-result ${verdict}`}>
        <div>
          <div className="lbl">{verdictText}</div>
          <div className="small">
            {hasMultipleCandidates ? `پرواز فعال: ${candidates![activeIndex!].label?.trim() || `پرواز ${toFa(activeIndex! + 1)}`}` :
              'براساس قواعد فصل ۷ OM-A — این یک محاسبهٔ کمکی است؛ مرجع نهایی Crew Scheduling و Flight Safety است.'}
          </div>
        </div>
        <div style={{ textAlign: 'left' }}>
          <div className="small">FDP حداکثر مجاز</div>
          <div className="val">{result.fdpAllowedHHMM ?? '—'}</div>
        </div>
      </div>

      {/* Over-Duty strip */}
      {overDutyClass && (
        <div className={`overduty-strip ${overDutyClass}`}>
          <div className="h">
            <span>
              {overDutyClass === 'safe' && '✓ Over-Duty نداری — پرواز در محدودهٔ مجاز است'}
              {overDutyClass === 'cmd' && '⚠️ Over-Duty قابل پوشش با اختیار کاپیتان'}
              {overDutyClass === 'danger' && '✕ Over-Duty خارج از سقف مطلق — این پرواز نباید پذیرفته شود'}
            </span>
          </div>
          <div className="v" dangerouslySetInnerHTML={{ __html: result.overDutyStatus }} />
          <div className="grid">
            <div className="cell">
              <div className="l">FDP موردنیاز (تخمینی)</div>
              <div className="v">{result.estimatedFdpHHMM ?? '—'}</div>
            </div>
            <div className="cell">
              <div className="l">FDP حداکثر مجاز</div>
              <div className="v">{result.fdpAllowedHHMM ?? '—'}</div>
            </div>
            <div className="cell">
              <div className="l">Block Time تخمینی</div>
              <div className="v">{result.estimatedBlockHHMM ?? '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Commander's Discretion strip */}
      {result.fdpWithCommanderDiscretionHHMM && (
        <div className="cmd-discretion">
          <div>
            <div className="lbl">با اختیار کاپیتان (Commander's Discretion)</div>
            <div className="small">
              ۷.۳.۳ — این سقف <b>مطلق</b> است و فقط در شرایط پیش‌بینی‌نشده پس از Reporting قابل استفاده است.
              {' '}Rest پس از این FDP <em>هرگز</em> کمتر از ۱۰ ساعت نباشد.
              {' '}برای افزایش بیش از ۱h، گزارش به CAA.IRI ظرف ۲۸ روز.
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div className="small">FDP با اختیار کاپیتان</div>
            <div className="val">{result.fdpWithCommanderDiscretionHHMM}</div>
          </div>
        </div>
      )}

      {/* Delay strip */}
      {result.delayNote && (
        <div className="delay-strip">
          <div className="h">۷.۲.۴ — تأثیر تأخیر بر FDP</div>
          <div className="v">{result.delayNote}</div>
          {result.fdpAfterDelayHHMM && result.fdpAfterDelayHHMM !== result.fdpAllowedHHMM && (
            <div className="v" style={{ marginTop: 6 }}>
              <b>FDP پس از تأخیر:</b> <span className="num" style={{ direction: 'ltr', display: 'inline-block' }}>{result.fdpAfterDelayHHMM}</span>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="summary-grid">
        <div className={`stat ${fails.length ? 'fail' : 'pass'}`}>
          <div className="lbl">FAIL</div>
          <div className="val">{fails.length}</div>
          <div className="sub">قواعد نقض‌شده</div>
        </div>
        <div className={`stat ${warns.length ? 'warn' : 'pass'}`}>
          <div className="lbl">WARN</div>
          <div className="val">{warns.length}</div>
          <div className="sub">هشدارها</div>
        </div>
        <div className="stat pass">
          <div className="lbl">PASS</div>
          <div className="val">{passes.length}</div>
          <div className="sub">قواعد رعایت‌شده</div>
        </div>
        <div className="stat">
          <div className="lbl">INFO</div>
          <div className="val">{infos.length}</div>
          <div className="sub">اطلاعات</div>
        </div>
      </div>

      {/* Detailed Analysis */}
      {failAnalysis.length > 0 && (
        <div className="card">
          <h2 style={{ color: 'var(--fail)', borderColor: 'var(--fail)' }}>
            تحلیل تفصیلی — چرا پرواز ممنوع است؟
          </h2>
          <div className="help" style={{ background: '#fff5f4', borderColor: '#e26a6a', color: '#9a2820' }}>
            هر بلوک زیر <b>یک</b> قاعدهٔ نقض‌شده را توضیح می‌دهد: متن قاعده، نقض دقیق با اعداد، و راه‌حل پیشنهادی.
            مرجع OM-A در گوشهٔ بالا قابل ارجاع به سند رسمی است.
          </div>
          {failAnalysis.map((a, idx) => <AnalysisBlock key={a.ruleId} a={a} idx={idx + 1} />)}
        </div>
      )}

      {warnAnalysis.length > 0 && (
        <div className="card">
          <h2 style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>
            هشدارها — توجه به این موارد
          </h2>
          {warnAnalysis.map((a, idx) => <AnalysisBlock key={a.ruleId} a={a} idx={idx + 1} />)}
        </div>
      )}

      {/* All checks list */}
      <div className="card">
        <h2>تمام بررسی‌ها</h2>
        {result.checks.map(c => <CheckRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}

function AnalysisBlock({ a, idx }: { a: AnalysisDetail; idx: number }) {
  return (
    <div className={`analysis-block ${a.status === 'warn' ? 'warn' : ''}`}>
      <div className="a-head">
        <div className="num">{idx}</div>
        <div className="a-title">{a.title}</div>
        <div className="a-ref">OM-A {a.reference}</div>
      </div>

      <div className="a-section rule">
        <h4>📘 قاعده</h4>
        <p>{a.rule}</p>
      </div>

      <div className="a-section violation">
        <h4>⚠️ نقض دقیق</h4>
        <p>{a.violation}</p>
      </div>

      <div className="a-section remedy">
        <h4>✅ راه‌حل پیشنهادی</h4>
        <p>{a.remedy}</p>
      </div>

      {a.calculation && a.calculation.length > 0 && (
        <div className="a-section calc">
          <h4>📊 تفکیک محاسبه — گام‌به‌گام</h4>
          <CalcTable steps={a.calculation} />
        </div>
      )}

      {a.quote && (
        <div className="a-vals" style={{ marginTop: 6 }}>
          📖 {a.quote}
        </div>
      )}
    </div>
  );
}

function CalcTable({ steps }: { steps: CalculationStep[] }) {
  return (
    <table className="calc-table">
      <thead>
        <tr>
          <th>#</th>
          <th>مرحله</th>
          <th>فرمول/توضیح</th>
          <th>مقدار</th>
          <th>قاعده</th>
        </tr>
      </thead>
      <tbody>
        {steps.map((s, i) => (
          <tr key={i} className={i === steps.length - 1 ? 'final' : ''}>
            <td className="num">{i + 1}</td>
            <td className="label">{s.label}</td>
            <td className="formula">{s.formula ?? '—'}</td>
            <td className="value">{s.value}</td>
            <td className="ref">{s.note ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CheckRow({ c }: { c: CheckResult }) {
  return (
    <div className={`check ${c.status}`}>
      <div className="header">
        <div className="icon">{ICON[c.status]}</div>
        <div className="title-row">
          <span className="title">{c.title}</span>
          <span className="ref">{c.reference}</span>
        </div>
      </div>
      <div className="msg">{c.message}</div>
      {(c.value || c.limit) && (
        <div className="vals">{c.value ?? ''}{c.limit ? ` / ${c.limit}` : ''}</div>
      )}
      {c.details && <div className="msg" style={{ fontSize: '9.5pt', marginTop: 4 }}>{c.details}</div>}
      {c.calculation && c.calculation.length > 0 && (
        <details className="calc-details">
          <summary>📊 محاسبهٔ تفصیلی</summary>
          <CalcTable steps={c.calculation} />
        </details>
      )}
    </div>
  );
}
