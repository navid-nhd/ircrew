import { useState } from 'react';
import type { DutyEntry, DutyKind } from '../rules/types';
import PersianDateTime from './PersianDateTime';
import Tooltip from './Tooltip';

interface Props {
  history: DutyEntry[];
  onChange: (next: DutyEntry[]) => void;
}

const KIND_LABELS: Record<DutyKind, string> = {
  fdp: 'FDP — پرواز عملیاتی',
  positioning: 'Positioning (DHC)',
  training: 'Training / Simulator',
  sba: 'Standby SBA (00:00–14:00)',
  sbb: 'Standby SBB (12:00–02:00 next)',
  sbf: 'Standby SBF (دلخواه ≤16h)',
  airport_sb: 'Airport Standby',
  reserve: 'Reserve',
  day_off: 'Day Off',
  recovery: 'Extended Recovery Rest',
  rest: 'Rest Period',
  admin: 'Admin / Office',
};

const newId = () => Math.random().toString(36).slice(2, 10);

const blankEntry = (): DutyEntry => {
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 3600_000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 8 * 3600_000);
  return {
    id: newId(),
    kind: 'fdp',
    start: start.toISOString(),
    end: end.toISOString(),
    sectors: 2,
    blockHours: 4,
    isNight: false, isEarly: false, isLate: false,
    tzDiffHours: 0,
    startStation: 'home', endStation: 'home',
  };
};


export default function HistoryPanel({ history, onChange }: Props) {
  const [editing, setEditing] = useState<DutyEntry | null>(null);

  const addEntry = () => setEditing(blankEntry());
  const editEntry = (e: DutyEntry) => setEditing({ ...e });
  const deleteEntry = (id: string) => onChange(history.filter(h => h.id !== id));
  const saveEntry = (entry: DutyEntry) => {
    const idx = history.findIndex(h => h.id === entry.id);
    if (idx >= 0) {
      const next = [...history];
      next[idx] = entry;
      onChange(next);
    } else {
      onChange([...history, entry].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    }
    setEditing(null);
  };

  const seedSample = () => {
    const now = new Date();
    const at = (daysBack: number, hh: number, mm = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysBack);
      d.setHours(hh, mm, 0, 0);
      return d.toISOString();
    };
    const sample: DutyEntry[] = [
      { id: newId(), kind: 'recovery', start: at(20, 8), end: at(18, 20), startStation: 'home', endStation: 'home' },
      { id: newId(), kind: 'fdp', start: at(15, 6), end: at(15, 14), sectors: 4, blockHours: 5.5, startStation: 'home', endStation: 'home' },
      { id: newId(), kind: 'day_off', start: at(14, 0), end: at(13, 23, 59) },
      { id: newId(), kind: 'fdp', start: at(10, 5, 30), end: at(10, 16), sectors: 2, blockHours: 8, isEarly: true, startStation: 'home', endStation: 'away', tzDiffHours: 3 },
      { id: newId(), kind: 'fdp', start: at(8, 23), end: at(8, 23 + 9), sectors: 2, blockHours: 7.5, isNight: true, startStation: 'away', endStation: 'home', tzDiffHours: 3 },
      { id: newId(), kind: 'day_off', start: at(7, 0), end: at(6, 23, 59) },
      { id: newId(), kind: 'sba', start: at(5, 0), end: at(5, 14), startStation: 'home', endStation: 'home' },
      { id: newId(), kind: 'fdp', start: at(3, 9), end: at(3, 19), sectors: 6, blockHours: 6.5, startStation: 'home', endStation: 'home' },
    ];
    onChange(sample);
  };

  return (
    <div className="card">
      <h2>۲. سابقهٔ وظایف خدمه (۲۸ روز اخیر)</h2>
      <div className="help">
        تمام Duty/Block/Standby/Day Off ۲۸ روز اخیر را وارد کن. این داده‌ها برای محاسبهٔ سقف‌های تجمعی،
        Recovery Rest، Acclimatization و Disruptive Schedule لازم است. <b>دقت در زمان شروع/پایان بسیار مهم است.</b>
      </div>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={addEntry}>+ افزودن ورودی</button>
        <button className="btn btn-secondary" onClick={seedSample}>نمونهٔ آزمایشی پر کن</button>
        <button className="btn btn-ghost" onClick={() => onChange([])}>پاک کردن همه</button>
      </div>

      {history.length === 0 ? (
        <div className="empty">هنوز هیچ ورودی ثبت نشده است.</div>
      ) : (
        <table className="entries">
          <thead>
            <tr>
              <th>نوع</th><th>شروع</th><th>پایان</th>
              <th className="num">طول</th><th className="num">سکتور</th><th className="num">Block</th>
              <th>پرچم</th><th>مبدا/مقصد</th><th></th>
            </tr>
          </thead>
          <tbody>
            {history.map(e => {
              const dur = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 3600_000;
              const fmtDate = (iso: string) => {
                const d = new Date(iso);
                return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              };
              const flags = [
                e.isNight && 'N', e.isEarly && 'E', e.isLate && 'L',
                e.usedInflightRestExt && 'IFR', e.usedExtensionNoRest && 'EXT',
                e.usedSplitDuty && 'SPL',
              ].filter(Boolean).join(' ');
              return (
                <tr key={e.id}>
                  <td><span className={`kind-badge kind-${e.kind}`}>{KIND_LABELS[e.kind].split(' —')[0]}</span></td>
                  <td className="num">{fmtDate(e.start)}</td>
                  <td className="num">{fmtDate(e.end)}</td>
                  <td className="num">{dur.toFixed(1)}h</td>
                  <td className="num">{e.sectors ?? '—'}</td>
                  <td className="num">{e.blockHours?.toFixed(1) ?? '—'}</td>
                  <td className="num">{flags || '—'}</td>
                  <td className="num">{`${e.startStation?.[0] ?? '?'}→${e.endStation?.[0] ?? '?'}${e.tzDiffHours ? ` ΔTZ${e.tzDiffHours}` : ''}`}</td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => editEntry(e)}>ویرایش</button>
                    <button className="btn btn-ghost" onClick={() => deleteEntry(e.id)} style={{ color: 'var(--fail)' }}>حذف</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editing && (
        <EntryEditor entry={editing} onSave={saveEntry} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

function EntryEditor({ entry, onSave, onCancel }:
  { entry: DutyEntry; onSave: (e: DutyEntry) => void; onCancel: () => void }) {
  const [e, setE] = useState<DutyEntry>(entry);
  const set = <K extends keyof DutyEntry>(k: K, v: DutyEntry[K]) => setE({ ...e, [k]: v });

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(13,27,42,.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'auto', margin: 0 }}>
        <h2>ویرایش ورودی</h2>
        <div className="row">
          <div className="field">
            <label>
              <Tooltip title="نوع ورودی" text={<>
                <b>FDP</b>: پرواز عملیاتی Operating با حداقل یک سکتور.<br />
                <b>Positioning (DHC)</b>: جابه‌جایی غیرعملیاتی به دستور شرکت — Duty حساب می‌شود اما Sector نیست.<br />
                <b>Training/Simulator</b>: آموزش یا چک — جزو Duty Period است.<br />
                <b>SBA</b>: <code>00:00–14:00</code>؛ <b>SBB</b>: <code>12:00–02:00</code> روز بعد؛ <b>SBF</b>: شروع آزاد، تا حداکثر ۱۶ ساعت.<br />
                <b>Airport Standby</b>: حداکثر ۱۲ ساعت، تماماً Duty.<br />
                <b>Reserve</b>: بازهٔ در دسترس بودن — تخصیص حداقل ۱۰ ساعت قبل اعلام می‌شود.<br />
                <b>Day Off</b> و <b>Recovery</b>: روز کامل آزاد + شب‌های محلی.
              </>} />
              نوع
            </label>
            <select value={e.kind} onChange={ev => set('kind', ev.target.value as DutyKind)}>
              {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>
              <Tooltip title="زمان شروع وظیفه" text={<>زمان <b>Reporting</b> یا شروع وظیفه به وقت محلی (تاریخ شمسی). برای FDP این همان لحظه‌ای است که در نقطهٔ حضور تعیین‌شده ثبت‌نام کرده‌ای. برای Standby، شروع بازهٔ Standby. برای Day Off، ابتدای روز.</>} />
              شروع
            </label>
            <PersianDateTime value={e.start} onChange={iso => set('start', iso)} />
          </div>
          <div className="field">
            <label>
              <Tooltip title="زمان پایان" text={<>زمان <b>پایان وظیفه</b> به وقت محلی. برای FDP این لحظهٔ Block-on آخرین سکتور Operating + ۳۰ دقیقهٔ Check-out است. برای Standby، پایان بازهٔ آماده‌باش.</>} />
              پایان
            </label>
            <PersianDateTime value={e.end} onChange={iso => set('end', iso)} />
          </div>
        </div>

        {e.kind === 'fdp' && (
          <>
            <div className="row">
              <div className="field">
                <label>
                  <Tooltip title="تعداد سکتور" text={<>تعداد <b>Sector</b>هایی که در این FDP پرواز شده. هر Sector = از حرکت برای Take-off تا توقف در پارکینگ بعد از Landing. (Positioning Sector شمرده <b>نمی‌شود</b>.)</>} />
                  تعداد سکتور
                </label>
                <input type="number" min={1} max={10} value={e.sectors ?? ''}
                  onChange={ev => set('sectors', Number(ev.target.value))} />
              </div>
              <div className="field">
                <label>
                  <Tooltip title="Block Time" text={<><b>Block Hours</b> = از لحظهٔ حرکت هواپیما از Parking تا توقف کامل و خاموشی موتور‌ها. این عدد روی سقف‌های ۱۰۰h/۲۸روز، ۹۰۰h/سال و ۱۰۰۰h/۱۲ ماه اثر می‌گذارد. به‌صورت دسیمال وارد کن (مثلاً <code>5.5</code> = ۵ ساعت و ۳۰ دقیقه).</>} />
                  Block Hours (دسیمال)
                </label>
                <input type="number" step="0.1" value={e.blockHours ?? ''}
                  onChange={ev => set('blockHours', Number(ev.target.value))} />
              </div>
              <div className="field">
                <label>
                  <Tooltip title="اختلاف منطقهٔ زمانی" text={<>اختلاف ساعتی بین وقت محلی <b>محل پرواز</b> و وقت Acclimatization تو. مثلاً اگر در THR (UTC+۳:۳۰) Acclimatized هستی و به DXB (UTC+۴) رفتی، ΔTZ = <code>0.5</code>. اگر ≥ ۴h باشد، استراحت بعد از پرواز حداقل ۱۴h می‌شود.</>} />
                  اختلاف TZ (h)
                </label>
                <input type="number" step="0.5" value={e.tzDiffHours ?? 0}
                  onChange={ev => set('tzDiffHours', Number(ev.target.value))} />
              </div>
            </div>

            <div className="row">
              <div className="field">
                <label>ایستگاه شروع</label>
                <select value={e.startStation ?? 'home'} onChange={ev => set('startStation', ev.target.value as 'home' | 'away')}>
                  <option value="home">Home Base</option>
                  <option value="away">خارج از بیس</option>
                </select>
              </div>
              <div className="field">
                <label>
                  <Tooltip title="ایستگاه پایان" text={<>اگر FDP در <b>خارج از Home Base</b> پایان یافت، Rest حداقل = max(Duty قبلی، ۱۰h) + ۸h Sleep + ۱h Physiological + Travelling. اگر در Home Base پایان یافت، Rest حداقل = max(Duty قبلی، ۱۲h).</>} />
                  ایستگاه پایان
                </label>
                <select value={e.endStation ?? 'home'} onChange={ev => set('endStation', ev.target.value as 'home' | 'away')}>
                  <option value="home">Home Base</option>
                  <option value="away">خارج از بیس</option>
                </select>
              </div>
              <div className="field inline">
                <label>
                  <Tooltip title="پایان در IKA" text={<>طبق Note <b>۷.۱.۴.۱۳.۱</b>: شروع رسمی Rest در THR/BND <b>۱ ساعت</b> پس از پایان Duty است؛ ولی در IKA <b>۲ ساعت</b>. اگر پروازت در IKA لند کرد، این چک‌باکس را فعال کن — اپ ۱h اضافه به تأخیر شروع Rest اعمال می‌کند.</>} />
                  <input type="checkbox" checked={!!e.endsAtIKA} onChange={ev => set('endsAtIKA', ev.target.checked)} />
                  پایان در IKA (شروع Rest +۲h به‌جای +۱h)
                </label>
              </div>
            </div>

            <div className="row">
              <div className="field inline"><label><input type="checkbox" checked={!!e.isNight} onChange={ev => set('isNight', ev.target.checked)} /> Night Duty (۰۲:۰۰–۰۴:۵۹)</label></div>
              <div className="field inline"><label><input type="checkbox" checked={!!e.isEarly} onChange={ev => set('isEarly', ev.target.checked)} /> Early Start (۰۵:۰۰–۰۵:۵۹)</label></div>
              <div className="field inline"><label><input type="checkbox" checked={!!e.isLate} onChange={ev => set('isLate', ev.target.checked)} /> Late Finish (۲۳:۰۰–۰۱:۵۹)</label></div>
            </div>

            <div className="row">
              <div className="field inline"><label><input type="checkbox" checked={!!e.usedInflightRestExt} onChange={ev => set('usedInflightRestExt', ev.target.checked)} /> Extension با In-flight Rest استفاده شد</label></div>
              <div className="field inline"><label><input type="checkbox" checked={!!e.usedExtensionNoRest} onChange={ev => set('usedExtensionNoRest', ev.target.checked)} /> Extension بدون In-flight Rest استفاده شد</label></div>
              <div className="field inline"><label><input type="checkbox" checked={!!e.usedSplitDuty} onChange={ev => set('usedSplitDuty', ev.target.checked)} /> Split Duty استفاده شد</label></div>
            </div>
          </>
        )}

        <div className="field">
          <label>یادداشت</label>
          <textarea rows={2} value={e.note ?? ''} onChange={ev => set('note', ev.target.value)} />
        </div>

        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => onSave(e)}>ذخیره</button>
          <button className="btn btn-secondary" onClick={onCancel}>انصراف</button>
        </div>
      </div>
    </div>
  );
}
