import { useState } from 'react';
import type { ProposedFlight } from '../rules/types';
import PersianDateTime from './PersianDateTime';
import Tooltip from './Tooltip';

interface Props {
  proposed: ProposedFlight;
  onChange: (next: ProposedFlight) => void;
}

export default function ProposedFlightPanel({ proposed, onChange }: Props) {
  // Default to "ساده" so new users see only the essential 5-6 fields.
  // The advanced sections cover edge cases that don't apply to most flights.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const set = <K extends keyof ProposedFlight>(k: K, v: ProposedFlight[K]) =>
    onChange({ ...proposed, [k]: v });

  const onReport = (iso: string) => {
    const d = new Date(iso);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    onChange({ ...proposed, reportingTimeLocal: iso, referenceTimeHHMM: hhmm });
  };

  return (
    <div className="card">
      <h2>۳. مشخصات پرواز پیشنهادی</h2>
      <div className="help" style={{ lineHeight: 1.85 }}>
        <b>راهنما:</b> برای محاسبهٔ اولیه فقط چهار چیز لازم است — <b>زمان حضور</b>،
        <b> ETD</b>، <b>ETA</b> و <b>تعداد سکتور</b>. بقیهٔ تنظیمات (Augmentation،
        Extension، Standby، Acclimatization) پیش‌فرض دارند و اگر پروازت موارد خاص ندارد
        می‌توانی نادیده‌شان بگیری. روی علامت <b>?</b> کنار هر فیلد بزن تا توضیح کامل ببینی.
      </div>

      <h3>برچسب و زمان‌های پرواز</h3>
      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="برچسب پرواز" text={<>یک نام کوتاه برای این پرواز کاندید (مثلاً <b>«پرواز فردا THR→DXB»</b> یا <b>«آماده‌باش پنج‌شنبه»</b>) تا در مقایسهٔ چند پرواز قابل‌تشخیص باشد.</>} />
            برچسب (دلخواه)
          </label>
          <input type="text" value={proposed.label ?? ''} onChange={e => set('label', e.target.value)} placeholder="مثلاً پرواز فردا THR-DXB" />
        </div>
        <div className="field">
          <label>
            <Tooltip title="زمان تخمینی Departure (ETD)" text={<>
              لحظهٔ <b>Block-off</b> = حرکت هواپیما از Parking برای Take-off.
              <br /><br />از این لحظه تا <b>Block-on</b> در مقصد، <b>Block Time</b> پرواز است که روی سقف‌های ۱۰۰h/۲۸روز و ۹۰۰h/سال اثر می‌گذارد.
              <br /><br />برای محاسبهٔ <b>Over-Duty</b>، اپ از <code>ETA + ۳۰min Check-out − Reporting</code> طول واقعی FDP موردنیاز را محاسبه می‌کند.
            </>} />
            ETD — زمان تخمینی حرکت
          </label>
          <PersianDateTime value={proposed.estimatedDepartureLocal ?? proposed.reportingTimeLocal} onChange={iso => set('estimatedDepartureLocal', iso)} />
        </div>
        <div className="field">
          <label>
            <Tooltip title="زمان تخمینی Arrival (ETA)" text={<>
              لحظهٔ <b>Block-on</b> در مقصد نهایی FDP — توقف کامل هواپیما در پارکینگ تعیین‌شده پس از Landing آخرین سکتور.
              <br /><br />FDP <b>۳۰ دقیقه پس از این لحظه</b> پایان می‌یابد (Check-out طبق ۷.۱.۴.۱۲).
              <br /><br />اگر این زمان به‌علاوهٔ ۳۰ دقیقهٔ Check-out از زمان شروع FDP بیشتر شود، اپ Over-Duty را با تفاوت سقف مجاز محاسبه می‌کند.
            </>} />
            ETA — زمان تخمینی رسیدن
          </label>
          <PersianDateTime value={proposed.estimatedArrivalLocal ?? proposed.reportingTimeLocal} onChange={iso => set('estimatedArrivalLocal', iso)} />
        </div>
      </div>

      <h3>زمان و مسیر</h3>
      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="زمان حضور (Reporting Time)" text={<>
              <b>Reporting Time</b> = ساعت رسمی حضور تو در نقطهٔ حضور (Designated Reporting Point):
              <br />— برای مهماندار در THR: اتاق بریفینگ مهمانداران
              <br />— برای خلبان در THR: محوطهٔ Flight Control
              <br />— برای ایستگاه‌های دیگر: دفتر ایستگاه ایران‌ایر
              <br /><br /><b>FDP از این لحظه شروع به شمارش می‌کند</b> (مگر اینکه Pre-flight Duty بیشتری وجود داشته باشد).
              <br /><br />فاصلهٔ معمول از Departure: داخلی NB <code>1:00</code>، داخلی WB <code>1:30</code>، بین‌المللی <code>2:00</code> (طبق جدول ۷.۷).
            </>} />
            <span className="ref">7.1.4.11</span> زمان حضور
          </label>
          <PersianDateTime value={proposed.reportingTimeLocal} onChange={onReport} />
        </div>
        <div className="field">
          <label>
            <Tooltip title="Reference Time" text={<>
              <b>Reference Time</b> = وقت محلی نقطهٔ حضور در یک نوار زمانی ۲ ساعته اطراف وقت Acclimatization.
              <br /><br />برای محاسبهٔ <b>FDP پایه</b> (جدول ۷.۲) و Extension (جدول ۷.۳)، ساعت شروع FDP در Reference Time مهم است. این فیلد به‌طور خودکار از Reporting Time گرفته می‌شود اما می‌توانی اصلاح کنی.
            </>} />
            Reference Time (HH:MM)
          </label>
          <input type="text" value={proposed.referenceTimeHHMM} onChange={e => set('referenceTimeHHMM', e.target.value)} placeholder="07:30" />
        </div>
        <div className="field">
          <label>
            <Tooltip title="تعداد سکتور" text={<>
              تعداد <b>Sector</b>های پرواز عملیاتی در این FDP. هر Sector = از حرکت برای Take-off تا توقف در پارکینگ بعد از Landing.
              <br /><br />با هر سکتور اضافه، حداکثر FDP <b>۳۰ دقیقه</b> کم می‌شود (جدول ۷.۲).
              <br /><br />Positioning Sector جزو Sectors این FDP <b>نیست</b> اما زمان آن جزو FDP حساب می‌شود.
            </>} />
            <span className="ref">7.1.4.5</span> تعداد سکتور
          </label>
          <input type="number" min={1} max={10} value={proposed.sectors} onChange={e => set('sectors', Number(e.target.value))} />
        </div>
      </div>

      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="Scope (داخلی/بین‌المللی)" text={<>پروازهای <b>بین‌المللی</b> Reporting Time طولانی‌تری دارند (به‌خاطر گمرک، پاسپورت، بریفینگ‌های اضافی). جدول ۷.۷: داخلی <code>1:00</code> برای Cabin، بین‌المللی <code>2:00</code> برای Cabin (در Home Base).</>} />
            Scope
          </label>
          <select value={proposed.scope} onChange={e => set('scope', e.target.value as ProposedFlight['scope'])}>
            <option value="domestic">داخلی</option>
            <option value="international">بین‌المللی</option>
          </select>
        </div>
        <div className="field">
          <label>
            <Tooltip title="نوع بدنهٔ هواپیما" text={<>
              <b>Narrow Body</b> (NB): تک‌راهرو، مثل B737، A320، A321.
              <br /><b>Wide Body</b> (WB): دوراهرو، مثل A330، B747، B777.
              <br /><br />Reporting Time بریفینگ Cabin برای WB طولانی‌تر است (جدول ۷.۷).
            </>} />
            Aircraft Body
          </label>
          <select value={proposed.body} onChange={e => set('body', e.target.value as ProposedFlight['body'])}>
            <option value="narrow">Narrow Body</option>
            <option value="wide">Wide Body</option>
          </select>
        </div>
        <div className="field">
          <label>
            <Tooltip title="ایستگاه شروع" text={<><b>Home Base</b> = THR یا BND (طبق پروفایل). در شرایط عادی شرکت مسئول اقامت تو در Home Base نیست. حداقل Rest در Home Base: ≥ Duty قبلی یا ۱۲ ساعت.</>} />
            ایستگاه شروع
          </label>
          <select value={proposed.departureStation} onChange={e => set('departureStation', e.target.value as 'home' | 'away')}>
            <option value="home">Home Base</option>
            <option value="away">خارج از بیس</option>
          </select>
        </div>
        <div className="field">
          <label>
            <Tooltip title="ایستگاه پایان" text={<>اگر FDP در <b>خارج از Home Base</b> پایان یابد، Rest حداقل ≥ Duty قبلی یا ۱۰ ساعت + ۸ ساعت Sleep + ۱ ساعت Physiological + Travelling.</>} />
            ایستگاه پایان
          </label>
          <select value={proposed.arrivalStation} onChange={e => set('arrivalStation', e.target.value as 'home' | 'away')}>
            <option value="home">Home Base</option>
            <option value="away">خارج از بیس</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 4px' }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          style={{
            padding: '8px 14px', borderRadius: 12,
            border: '1px solid var(--brand-2)',
            background: showAdvanced ? 'var(--brand)' : 'transparent',
            color: showAdvanced ? '#fff' : 'var(--brand-2)',
            fontFamily: 'IRANSans', fontWeight: 800, fontSize: 12.5,
            cursor: 'pointer', flex: 1,
          }}
        >
          {showAdvanced ? '⬆ بستن تنظیمات پیشرفته' : '⬇ نمایش تنظیمات پیشرفته'}
        </button>
      </div>
      <div className="help" style={{ marginTop: 6, marginBottom: 12, fontSize: 11.5 }}>
        تنظیمات پیشرفته شامل: <b>Augmentation</b>، <b>Extension</b>، <b>Standby قبل از پرواز</b>،
        <b> تأخیر</b>، <b>Acclimatization و TZ</b>. فقط اگر پروازت شامل یکی از اینها است باز کن.
      </div>

      {showAdvanced && (<>

      <h3>Augmentation و In-flight Rest</h3>
      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="خدمهٔ افزایش‌یافته (Augmented)" text={<>
              <b>Augmented Crew</b> = خدمهٔ کاکپیت با تعداد بیشتر از حداقل لازم برای پرواز هواپیما، تا هر خلبان بتواند پست خود را برای Rest حین پرواز ترک کند.
              <br /><br /><b>+۱ خلبان</b>: تا FDP <code>16:00</code> با Class 1 (یا <code>17:00</code> با ۱ سکتور ≥۹h).
              <br /><b>+۲ خلبان</b>: تا FDP <code>17:00</code> با Class 1 (یا <code>18:00</code> با ۱ سکتور ≥۹h).
              <br /><br />Augmented بودن همچنین برای استفاده از Commander's Discretion +۳h (به‌جای +۲h) لازم است.
            </>} />
            <span className="ref">7.1.4.8</span> Flight Crew اضافی
          </label>
          <select value={proposed.augmentedExtraFlightCrew} onChange={e => set('augmentedExtraFlightCrew', Number(e.target.value) as 0 | 1 | 2)}>
            <option value={0}>۰ — Augmented نیست</option>
            <option value={1}>+۱ خلبان</option>
            <option value={2}>+۲ خلبان</option>
          </select>
        </div>
        <div className="field">
          <label>
            <Tooltip title="کلاس Rest Facility" text={<>
              <b>Class 1</b> — تخت کامل (Bunk): زاویهٔ Recline ≥ ۸۰°، مستقل از کاکپیت و کابین، کنترل نور و عایق صدا.
              <br /><b>Class 2</b> — صندلی پیشرفته: ≥ ۴۵°، Pitch ≥ ۵۵″، عرض ≥ ۲۰″، با تکیه‌گاه پا و پرده.
              <br /><b>Class 3</b> — صندلی استراحت: ≥ ۴۰°، با تکیه‌گاه پا، جدا از مسافر.
              <br /><br />ایران‌ایر: A330 → Zone A بسته (Class 3)، B747 → بخشی از Upper Deck (Class 2).
              <br /><br />بدون In-flight Rest: <code>۰</code>.
            </>} />
            <span className="ref">7.1.4.8.1</span> Class Rest Facility
          </label>
          <select value={proposed.restFacilityClass} onChange={e => set('restFacilityClass', Number(e.target.value) as 0 | 1 | 2 | 3)}>
            <option value={0}>بدون In-flight Rest</option>
            <option value={1}>Class 1 — تخت کامل</option>
            <option value={2}>Class 2 — صندلی پیشرفته</option>
            <option value={3}>Class 3 — صندلی استراحت</option>
          </select>
        </div>
        <div className="field inline">
          <label>
            <Tooltip title="سکتور طولانی" text={<>اگر FDP شامل <b>یک سکتور با ≥ ۹ ساعت پرواز پیوسته</b> و حداکثر ۲ سکتور باشد، از جدول ۷.۵ استفاده می‌شود (FDP طولانی‌تر مجاز).</>} />
            <input type="checkbox" checked={proposed.includesLongSector}
              onChange={e => set('includesLongSector', e.target.checked)} />
            شامل سکتور ≥ ۹h پیوسته
          </label>
        </div>
      </div>

      <h3>Extension و Split Duty</h3>
      <div className="row">
        <div className="field inline">
          <label>
            <Tooltip title="Extension بدون In-flight Rest" text={<>
              FDP پایه را تا <b>۱ ساعت</b> اضافه می‌کند، حداکثر <b>۲ بار در ۷ روز</b>. نیازمند Rest اضافی: ۲h قبل و بعد، یا ۴h بعد.
              <br /><br />سقف سکتور: ۵ بدون پوشش WOCL، ۴ با پوشش ≤۲h، ۲ با پوشش بیش از ۲h.
              <br /><br /><b>ترکیب</b> با In-flight Rest یا Split Duty <b>ممنوع</b>.
            </>} />
            <input type="checkbox" checked={proposed.useExtensionNoRest}
              onChange={e => set('useExtensionNoRest', e.target.checked)} />
            <span className="ref">7.1.4.7</span> Extension بدون In-flight Rest
          </label>
        </div>
        <div className="field inline">
          <label>
            <Tooltip title="Split Duty" text={<>
              FDP را با گنجاندن یک <b>Break پیوستهٔ ≥ ۳ ساعت</b> روی زمین تمدید می‌کند. زمان Pre/Post-flight و Travelling از Break کسر می‌شود.
              <br /><br />تمام Break به‌عنوان FDP حساب می‌شود.
              <br /><br />با Suitable Accommodation: +۵۰٪ Break به FDP. با Accommodation: +۵۰٪ بخش غیرپوشانندهٔ WOCL، حداکثر ۳ ساعت.
            </>} />
            <input type="checkbox" checked={proposed.useSplitDuty}
              onChange={e => set('useSplitDuty', e.target.checked)} />
            <span className="ref">7.1.4.10</span> Split Duty
          </label>
        </div>
        <div className="field">
          <label>
            <Tooltip title="WOCL Encroachment" text={<>
              <b>WOCL</b> (Window of Circadian Low) = بازهٔ <code>02:00–05:59</code> به وقت Acclimatization تو — حساس‌ترین پنجرهٔ خواب طبیعی بدن.
              <br /><br />تعداد ساعتی که FDP این پنجره را پوشش می‌دهد، روی سقف Extension (سکتور و ساعت) اثر مستقیم دارد.
            </>} />
            WOCL Encroachment (h)
          </label>
          <input type="number" step="0.5" value={proposed.woclEncroachmentHours}
            onChange={e => set('woclEncroachmentHours', Number(e.target.value))} />
        </div>
      </div>

      {proposed.useSplitDuty && (
        <div className="row">
          <div className="field">
            <label>
              <Tooltip title="طول Break" text={<>طول وقفهٔ زمینی به دقیقه. حداقل <b>۱۸۰ دقیقه</b> پیوسته. زمان موردنیاز برای Pre-flight، Post-flight و رفت‌وآمد جداگانه است.</>} />
              طول Break (دقیقه)
            </label>
            <input type="number" min={0} value={proposed.splitDutyBreakMin ?? 180}
              onChange={e => set('splitDutyBreakMin', Number(e.target.value))} />
          </div>
          <div className="field">
            <label>
              <Tooltip title="نوع اقامتگاه طول Break" text={<>
                <b>Suitable Accommodation</b>: اتاق جداگانه برای هر خدمه، تخت، تهویه، نور/دما قابل تنظیم، غذا/نوشیدنی → +۵۰٪ Break به FDP.
                <br /><b>Accommodation</b>: مکان آرام، خصوصی، با امکان خواب → +۵۰٪ بخش غیر-WOCL Break، حداکثر ۳ ساعت.
                <br /><b>بدون</b>: Break صرفاً Duty شمرده می‌شود اما FDP افزایش نمی‌یابد.
              </>} />
              نوع اقامتگاه
            </label>
            <select value={proposed.splitDutyAccommodation ?? 'none'}
              onChange={e => set('splitDutyAccommodation', e.target.value as ProposedFlight['splitDutyAccommodation'])}>
              <option value="none">بدون اقامتگاه</option>
              <option value="accommodation">Accommodation</option>
              <option value="suitable">Suitable Accommodation</option>
            </select>
          </div>
        </div>
      )}

      <h3>Standby پیش از پرواز</h3>
      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="نوع Standby" text={<>
              اگر این FDP بلافاصله پس از یک Standby آغاز می‌شود، نوع آن را انتخاب کن:
              <br /><br /><b>Airport</b>: حداکثر ۱۲h، تماماً Duty. اگر FDP در طول آن آغاز شود، FDP به اندازهٔ SB بیش از ۴h کاهش می‌یابد.
              <br /><b>Home</b>: ۹۰ دقیقه مهلت رسیدن به نقطهٔ حضور. ۲۵٪ به‌عنوان Duty حساب می‌شود.
              <br /><b>Hotel</b>: ۶۰ دقیقه مهلت ترک هتل. ۲۵٪ به‌عنوان Duty حساب می‌شود.
              <br /><br />برای SB غیر-Airport، اگر SB بیش از ۶ ساعت پایان یابد (یا بیش از ۸h با IFR/Split)، FDP به اندازهٔ زمان اضافی کاهش می‌یابد.
            </>} />
            <span className="ref">7.4</span> نوع Standby قبل
          </label>
          <select value={proposed.precededByStandbyType ?? 'none'}
            onChange={e => set('precededByStandbyType', e.target.value as ProposedFlight['precededByStandbyType'])}>
            <option value="none">پیش از پرواز Standby نبوده</option>
            <option value="airport">Airport Standby</option>
            <option value="home">Standby در منزل</option>
            <option value="hotel">Standby در هتل</option>
          </select>
        </div>
        <div className="field">
          <label>
            <Tooltip title="طول Standby" text={<>طول Standby در ساعت — از شروع تا لحظهٔ Reporting در نقطهٔ حضور. این عدد بر کاهش FDP و سقف ۱۸h Awake Time اثر می‌گذارد.</>} />
            طول Standby (h)
          </label>
          <input type="number" step="0.5" value={proposed.precededByStandbyHours ?? 0}
            onChange={e => set('precededByStandbyHours', Number(e.target.value))} />
        </div>
        <div className="field inline">
          <label>
            <Tooltip title="شروع شبانه" text={<>اگر Standby بین <code>23:00–07:00</code> شروع شده، آن بازه تا لحظهٔ تماس شرکت در کاهش FDP حساب نمی‌شود.</>} />
            <input type="checkbox" checked={!!proposed.standbyStartedAtNight}
              onChange={e => set('standbyStartedAtNight', e.target.checked)} />
            Standby در ۲۳:۰۰–۰۷:۰۰ شروع شده
          </label>
        </div>
      </div>

      <h3>تأخیر در پرواز (Delayed Reporting)</h3>
      <div className="help">
        اگر شرکت پس از Reporting Time برنامه‌ریزی‌شده، پرواز را به تأخیر بیندازد، طبق <b>۷.۲.۴</b> محاسبهٔ FDP تغییر می‌کند.
      </div>
      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="مدت تأخیر" text={<>
              مقدار تأخیر اعلام‌شده توسط شرکت پس از Reporting Time برنامه‌ریزی‌شده، به دقیقه.
              <br /><br /><b>تأخیر &lt; ۴ ساعت</b>: حداکثر FDP بر اساس Reporting اصلی، شمارش FDP از Reporting جدید آغاز می‌شود.
              <br /><b>تأخیر ≥ ۴ ساعت</b>: حداکثر FDP بر اساس <em>محدودکننده‌تر</em> از اصلی یا جدید.
              <br /><b>تأخیر ≥ ۱۰ ساعت</b>: اگر شرکت دیگر مزاحمتی ایجاد نکند، این به‌عنوان Rest Period محسوب می‌شود (طبق ۷.۲.۵).
            </>} />
            <span className="ref">7.2.4</span> مدت تأخیر (دقیقه)
          </label>
          <input type="number" min={0} step={15} value={proposed.delayMinutesFromReporting ?? 0}
            onChange={e => set('delayMinutesFromReporting', Number(e.target.value))} />
        </div>
        <div className="field">
          <label>
            <Tooltip title="تعداد ابلاغ‌های تأخیر" text={<>
              طبق ۷.۲.۱، حداکثر <b>۳ بار</b> ابلاغ تأخیر در یک پرواز مجاز است. اگر بیشتر شد، پرواز باید کنسل و دوباره برنامه‌ریزی شود.
              <br /><br />اگر بیش از یک بار اعلام شد، شمارش FDP از <b>۱ ساعت پس از اعلام دوم</b> یا Reporting Time جدید (هرکدام زودتر) آغاز می‌شود.
            </>} />
            <span className="ref">7.2.1</span> تعداد ابلاغ
          </label>
          <input type="number" min={0} max={5} value={proposed.delayNotificationsCount ?? 0}
            onChange={e => set('delayNotificationsCount', Number(e.target.value))} />
        </div>
        <div className="field inline">
          <label>
            <Tooltip title="مدل‌سازی Commander's Discretion" text={<>
              با فعال‌سازی این گزینه، اپ <b>سقف FDP با اختیار کاپیتان</b> را هم محاسبه می‌کند:
              <br />— Non-Augmented: تا +۲ ساعت
              <br />— Augmented: تا +۳ ساعت
              <br /><br />نیازمند مشورت با همهٔ خدمه و — جز در موارد استثنایی — تأیید قبلی DMD/GD است. Rest پس از آن هرگز کمتر از ۱۰ ساعت نباشد. در صورت افزایش بیش از ۱h، گزارش به CAA.IRI ظرف ۲۸ روز.
            </>} />
            <input type="checkbox" checked={!!proposed.modelCommanderDiscretion}
              onChange={e => set('modelCommanderDiscretion', e.target.checked)} />
            <span className="ref">7.3.3</span> محاسبهٔ سقف Commander's Discretion
          </label>
        </div>
      </div>

      <h3>Acclimatization و Time Zone</h3>
      <div className="row">
        <div className="field">
          <label>
            <Tooltip title="وضعیت Acclimatization" text={<>
              <b>B</b> — Acclimatized با وقت محلی <em>مبدأ</em> (همان منطقه‌ای که از آن آمده‌ای).
              <br /><b>D</b> — Acclimatized با وقت محلی محل شروع وظیفهٔ <em>بعدی</em> (مقصد).
              <br /><b>X</b> — وضعیت <em>نامعلوم</em> (هنوز نه با مبدأ نه با مقصد همگام نشده‌ای).
              <br /><br />برای تعیین B/D/X از جدول ۷.۱ استفاده کن: ورودی‌ها = اختلاف ساعت + زمان سپری‌شده از Reporting در Reference Time.
              <br /><br />اگر <b>X</b> بود، FDP باید با رویکرد محافظه‌کارانه محاسبه شود.
            </>} />
            <span className="ref">7.1.3</span> Acclimatization
          </label>
          <select value={proposed.acclimState} onChange={e => set('acclimState', e.target.value as 'B' | 'D' | 'X')}>
            <option value="B">B — تطابق با مبدأ</option>
            <option value="D">D — تطابق با مقصد</option>
            <option value="X">X — نامعلوم</option>
          </select>
        </div>
        <div className="field">
          <label>
            <Tooltip title="اختلاف TZ" text={<>اختلاف ساعتی بین Reference Time این FDP و وقت Acclimatization پایه. اگر ≥ ۴h، Rest پس از این FDP حداقل ۱۴h می‌شود (در خارج از Home Base).</>} />
            اختلاف TZ (h)
          </label>
          <input type="number" step="0.5" value={proposed.tzDiffHours} onChange={e => set('tzDiffHours', Number(e.target.value))} />
        </div>
        <div className="field">
          <label>
            <Tooltip title="Cabin زودتر از Cockpit" text={<>اگر Cabin برای بریفینگ زمان بیشتری نیاز دارد، می‌تواند تا <b>۶۰ دقیقه</b> زودتر از Flight Crew Reporting کند. سقف FDP بر اساس Reporting کاکپیت محاسبه می‌شود اما شمارش از Reporting کابین آغاز می‌شود — یعنی کابین در عمل ۱ ساعت بیشتر در FDP است.</>} />
            <span className="ref">7.1.4.6</span> Cabin زودتر (دقیقه)
          </label>
          <input type="number" min={0} max={120} value={proposed.cabinReportsEarlierByMin ?? 0}
            onChange={e => set('cabinReportsEarlierByMin', Number(e.target.value))} />
        </div>
        <div className="field">
          <label>
            <Tooltip title="Travelling" text={<>زمان <b>یک‌طرفه</b> از اقامتگاه (هتل) تا نقطهٔ حضور به دقیقه. در خارج از Home Base، اگر کل رفت‌وآمد (× ۲) از ۶۰ دقیقه بیشتر شود، Rest باید به همان میزان <em>اضافه</em> طولانی‌تر شود.</>} />
            Travelling یک‌طرفه (دقیقه)
          </label>
          <input type="number" min={0} value={proposed.travellingMinOneWay ?? 30}
            onChange={e => set('travellingMinOneWay', Number(e.target.value))} />
        </div>
      </div>

      </>)}
    </div>
  );
}
