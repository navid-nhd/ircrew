// Builds detailed Persian explanations for every FAIL/WARN check produced
// by the rules engine. Lookup is by check id; falls back to a generic builder.

import type { CheckResult, AnalysisDetail } from './types';

interface AnalysisRule {
  rule: string;     // The regulation in plain Persian
  remedy: string;   // What to do to make it pass
  quote?: string;   // OM-A reference paragraph, paraphrased
}

const RULES: Record<string, AnalysisRule> = {
  // 7.1.4.1
  'cumulative-Cumulative Duty / 7d': {
    rule: 'مجموع ساعت‌های وظیفه (Duty) که می‌توان در ۷ روز متوالی به یک عضو خدمه تخصیص داد، حداکثر ۶۰ ساعت است. این شامل FDP، Positioning، Training، Admin، Airport Standby کامل و ۲۵٪ سایر Standbyها می‌شود.',
    remedy: 'برای رفع، یا یک FDP/Positioning از ۷ روز اخیر را حذف کن، یا تاریخ پرواز پیشنهادی را به جلو بکش تا یکی از Dutyهای قبلی از پنجرهٔ ۷ روزه خارج شود.',
    quote: 'OM-A 7.1.4.1: ≤ 60 duty hours in any 7 consecutive days.',
  },
  'cumulative-Cumulative Duty / 14d': {
    rule: 'مجموع ساعت‌های Duty در ۱۴ روز متوالی نباید از ۱۱۰ ساعت بیشتر شود.',
    remedy: 'پنجرهٔ ۱۴ روزه را با اضافه کردن Day Off یا کاهش Duty تنظیم کن.',
    quote: 'OM-A 7.1.4.1: ≤ 110 duty hours in any 14 consecutive days.',
  },
  'cumulative-Cumulative Duty / 28d': {
    rule: 'مجموع Duty در ۲۸ روز متوالی نباید از ۱۹۰ ساعت بیشتر شود — این پنجره باید تا حد ممکن یکنواخت پخش شود.',
    remedy: 'پرواز پیشنهادی را به ماه بعد منتقل کن یا Duty قبلی را با Day Off جایگزین کن.',
    quote: 'OM-A 7.1.4.1: ≤ 190 duty hours in any 28 consecutive days, spread as evenly as practicable.',
  },
  'cumulative-block-28': {
    rule: 'مجموع Block Time برای پروازهایی که خدمه به‌عنوان Operating Crew شرکت می‌کند، در هر ۲۸ روز متوالی نباید از ۱۰۰ ساعت بیشتر شود.',
    remedy: 'پروازی با Block کوتاه‌تر برنامه‌ریزی کن، یا یکی از پروازهای قبلی را از پنجرهٔ ۲۸ روزه خارج کن.',
    quote: 'OM-A 7.1.4.2: ≤ 100 block hours in any 28 consecutive days.',
  },
  'cumulative-block-365': {
    rule: 'مجموع Block Time در ۱۲ ماه تقویمی متوالی نباید از ۱۰۰۰ ساعت بیشتر شود.',
    remedy: 'این یک سقف بزرگ است؛ Crew Scheduling باید ماهانه آن را پایش کند. در صورت رسیدن به این سقف، حداقل تا انتهای ماه پروازی به تو تخصیص نمی‌دهد.',
    quote: 'OM-A 7.1.4.2: ≤ 1000 block hours in any 12 consecutive calendar months.',
  },
  'cumulative-block-year': {
    rule: 'مجموع Block Time در یک سال تقویمی (۱ ژانویه تا ۳۱ دسامبر) نباید از ۹۰۰ ساعت بیشتر شود.',
    remedy: 'برنامه‌ریزی پرواز برای سال جاری را به ماه‌های اول سال آینده منتقل کن.',
    quote: 'OM-A 7.1.4.2: ≤ 900 block hours in a calendar year.',
  },
  'days-off-month': {
    rule: 'در هر ماه تقویمی، خدمه باید حداقل ۷ روز آزاد (Day Off) شامل ۲ شب محلی داشته باشد. روزهای آزاد باید معمولاً در Home Base برنامه‌ریزی شوند.',
    remedy: 'با Crew Scheduling برای افزودن Day Off هماهنگ کن. اگر هنوز در ماه فرصت داری، روزهای آزاد جدید بگذار.',
    quote: 'OM-A 7.1.4.3: ≥ 7 days off (incl. 2 local nights) in each calendar month.',
  },
  'night-sectors': {
    rule: 'در Night Duty (دوره‌ای که با ۰۲:۰۰–۰۴:۵۹ همپوشانی دارد)، تعداد سکتور به حداکثر ۴ محدود است.',
    remedy: 'تعداد سکتور Night Duty را کاهش بده یا با تغییر زمان شروع، آن را از Night Duty خارج کن.',
    quote: 'OM-A 7.1.4.4: max 4 sectors per consecutive night duty.',
  },
  'night-10h': {
    rule: 'چون FRM (مدیریت ریسک خستگی) در ایران‌ایر هنوز پیاده‌سازی نشده، Night Dutyهای متوالی بیش از ۱۰ ساعت باید اجتناب شوند.',
    remedy: 'یا Duration پرواز شب را زیر ۱۰ ساعت نگه دار، یا قبلش حداقل یک Recovery Rest واجد شرایط بگذار.',
    quote: 'OM-A 7.1.4.4: avoid consecutive night duties of more than 10 hours.',
  },
  'fdp-base': {
    rule: 'FDP پایه براساس Reference Time (ساعت شروع) و تعداد سکتور از جدول ۷.۲ محاسبه می‌شود.',
    remedy: 'Reporting Time و تعداد سکتور را با مقادیر داخل جدول ۷.۲ تطبیق بده.',
    quote: 'OM-A 7.1.4.5 + Table 7.2.',
  },
  'cabin-earlier': {
    rule: 'اگر Cabin Crew برای بریفینگ زمان بیشتری از Flight Crew لازم داشته باشد، می‌توان Reporting Cabin را تا حداکثر ۶۰ دقیقه زودتر شروع کرد.',
    remedy: 'اختلاف زمان بین Cabin و Cockpit را به ۶۰ دقیقه یا کمتر کاهش بده.',
    quote: 'OM-A 7.1.4.6: difference shall not exceed 1 hour.',
  },
  'ext-no-rest-count': {
    rule: 'Extension بدون In-flight Rest می‌تواند حداکثر ۲ بار در هر ۷ روز متوالی استفاده شود.',
    remedy: 'پرواز را به‌گونه‌ای تنظیم کن که Extension استفاده نشود، یا تاریخ را به جلو بکش تا یکی از Extensionهای قبلی از پنجرهٔ ۷ روزه خارج شود.',
    quote: 'OM-A 7.1.4.7.a: not more than twice in any 7 consecutive days.',
  },
  'ext-no-rest-sectors': {
    rule: 'سقف تعداد سکتور هنگام استفاده از Extension بدون In-flight Rest: ۵ سکتور بدون پوشش WOCL، ۴ سکتور با پوشش ≤ ۲ ساعت، ۲ سکتور با پوشش > ۲ ساعت.',
    remedy: 'تعداد سکتور را تا حد مجاز کاهش بده یا زمان شروع را طوری تغییر بده که WOCL پوشانده نشود.',
    quote: 'OM-A 7.1.4.7.c.',
  },
  'ext-no-rest-table': {
    rule: 'برای ساعت شروع مشخص و تعداد سکتور خاص، Extension بدون In-flight Rest در جدول ۷.۳ "Not allowed" است.',
    remedy: 'زمان شروع را به بازه‌ای منتقل کن که در جدول ۷.۳ مجاز است (مثلاً ۰۷:۰۰–۱۳:۲۹ به‌ترتیب اوج مجاز را می‌دهد).',
    quote: 'OM-A 7.1.4.7 + Table 7.3.',
  },
  'ext-no-rest-mix': {
    rule: 'Extension بدون In-flight Rest را نمی‌توان با Extension با In-flight Rest یا Split Duty در یک Duty Period ترکیب کرد.',
    remedy: 'یکی از این سه روش را انتخاب کن — همزمانی ممنوع است.',
    quote: 'OM-A 7.1.4.7.d.',
  },
  'ifr-augmented': {
    rule: 'برای استفاده از Extension با In-flight Rest، خدمهٔ کاکپیت باید Augmented باشد (حداقل ۱ یا ۲ خلبان اضافی).',
    remedy: 'یا Augmentation به پرواز اضافه کن، یا گزینهٔ In-flight Rest را غیرفعال کن.',
    quote: 'OM-A 7.1.4.8 + Definition "Augmented Flight Crew".',
  },
  'ifr-sectors': {
    rule: 'با استفاده از Extension با In-flight Rest، تعداد سکتور به ۳ محدود است.',
    remedy: 'پرواز را به‌گونه‌ای برنامه‌ریزی کن که حداکثر ۳ سکتور داشته باشد.',
    quote: 'OM-A 7.1.4.8.2.',
  },
  'ifr-long-sector': {
    rule: 'برای FDPهایی که شامل یک سکتور بیش از ۹ ساعت پیوسته است، تعداد کل سکتور به ۲ محدود است.',
    remedy: 'تعداد سکتور را به ≤ ۲ کاهش بده.',
    quote: 'OM-A 7.1.4.8.3.',
  },
  'ifr-cabin-min': {
    rule: 'حداقل In-flight Rest برای کابین براساس طول FDP و کلاس Rest Facility از جدول ۷.۶ تعیین می‌شود. در طول FDPهای بسیار طولانی، Class 3 پاسخگو نیست.',
    remedy: 'پرواز را به Class 1 یا Class 2 منتقل کن، یا از تجهیزات بهتری برای استراحت کابین استفاده کن.',
    quote: 'OM-A 7.1.4.8.4 + Table 7.6.',
  },
  'split-mix': {
    rule: 'Split Duty را نمی‌توان با Extension بدون In-flight Rest یا Extension با In-flight Rest ترکیب کرد.',
    remedy: 'یکی از این روش‌ها را انتخاب کن — همزمانی ممنوع است.',
    quote: 'OM-A 7.1.4.10.',
  },
  'split-break': {
    rule: 'وقفهٔ زمینی (Break) در Split Duty باید حداقل ۳ ساعت پیوسته باشد. زمان Pre-flight و Post-flight و رفت‌وآمد به اقامتگاه از این Break کسر می‌شود.',
    remedy: 'Break را تا حداقل ۱۸۰ دقیقه افزایش بده.',
    quote: 'OM-A 7.1.4.10.',
  },
  'rest-before': {
    rule: 'حداقل دورهٔ Rest قبل از FDP: در Home Base ≥ Duty قبلی یا ۱۲ ساعت (هرکدام بزرگ‌تر)؛ خارج از Home Base ≥ Duty قبلی یا ۱۰ ساعت + ۸ ساعت فرصت خواب + ۱ ساعت نیازهای فیزیولوژیکی + Travelling. اگر FDP قبلی Extension با In-flight Rest داشت یا اختلاف TZ ≥ ۴ ساعت بود، حداقل ۱۴ ساعت.',
    remedy: 'تاریخ پرواز پیشنهادی را عقب بنداز تا Rest بیشتری بین Duty قبلی و این پرواز ایجاد شود.',
    quote: 'OM-A 7.1.4.13.1 / 7.1.4.13.2 / 7.1.4.13.5.',
  },
  'recovery-168': {
    rule: 'فاصلهٔ زمانی بین پایان یک Extended Recovery Rest و شروع Recovery بعدی نباید از ۱۶۸ ساعت بیشتر شود (Recovery باید ≥ ۳۶ ساعت + ۲ شب محلی باشد).',
    remedy: 'یک Recovery Rest کامل (۳۶ ساعت + ۲ شب محلی) قبل از این پرواز برنامه‌ریزی کن.',
    quote: 'OM-A 7.1.4.13.4.',
  },
  'disruptive-60h': {
    rule: 'اگر بین دو Recovery Rest، خدمه ۴ یا بیشتر Night Duty / Early Start / Late Finish داشته باشد، Recovery دوم باید به ۶۰ ساعت گسترش یابد.',
    remedy: 'Recovery قبل از این پرواز را تا ۶۰ ساعت طولانی‌تر کن.',
    quote: 'OM-A 7.1.4.13.7.',
  },
  'rot-east-west': {
    rule: 'در گذار بین یک روتیشن با ≥ ۶ منطقهٔ زمانی در یک جهت و یک روتیشن با ≥ ۴ منطقهٔ زمانی در جهت مخالف، باید حداقل ۳ شب محلی Rest در Home Base وجود داشته باشد.',
    remedy: '۳ شب محلی Rest کامل در Home Base قبل از این پرواز اضافه کن.',
    quote: 'OM-A 7.1.4.13.6.',
  },
  'sb-airport': {
    rule: 'Airport Standby حداکثر ۱۲ ساعت است. هرگاه FDP در طول Airport Standby آغاز شود، حداکثر FDP به اندازهٔ زمان Standby بیش از ۴ ساعت کاهش می‌یابد و مجموع Airport Standby + FDP نباید از ۱۶ ساعت بیشتر شود.',
    remedy: 'یا Airport Standby را کوتاه‌تر برنامه‌ریزی کن، یا FDP را کوتاه‌تر بگیر.',
    quote: 'OM-A 7.4.1.',
  },
  'sb-awake-18': {
    rule: 'مجموع زمان Standby + FDP نباید بیش از ۱۸ ساعت Awake Time را به دنبال داشته باشد. Break در Split Duty و In-flight Rest این بازه را پایان می‌دهند.',
    remedy: 'یا Standby را کوتاه‌تر کن، یا FDP را با کاهش سکتور یا تغییر زمان شروع کوتاه‌تر کن، یا از Augmented Crew با In-flight Rest استفاده کن.',
    quote: 'OM-A 7.4.2.b.',
  },
  'cmd-discretion-rest': {
    rule: 'Rest پس از FDP که با اختیار کاپیتان طولانی شده، نباید کمتر از ۱۰ ساعت باشد.',
    remedy: 'Rest پس از پرواز را حداقل ۱۰ ساعت تنظیم کن.',
    quote: 'OM-A 7.3.3.',
  },
  'delay-3-notifications': {
    rule: 'حداکثر ۳ بار ابلاغ تأخیر Reporting در یک پرواز مجاز است.',
    remedy: 'این پرواز باید کنسل و دوباره برنامه‌ریزی شود.',
    quote: 'OM-A 7.2.1.',
  },
  'over-duty': {
    rule: 'مدت زمان تخمینی FDP (از Reporting Time تا ۳۰ دقیقه پس از Block-on آخرین سکتور) نباید از حداکثر FDP مجاز بیشتر شود. اگر بیشتر شد، یا باید سقف کاهش داده شود (سکتور کم‌تر، Augmentation، In-flight Rest)، یا کاپیتان از اختیار خود استفاده کند (سقف مطلق +۲h غیر-Augmented، +۳h Augmented).',
    remedy: 'گزینه‌ها: ۱) کاهش سکتور — جدول ۷.۲ سقف بالاتری می‌دهد. ۲) Augmented Crew + In-flight Rest — جدول ۷.۴/۷.۵. ۳) Split Duty با Suitable Accommodation. ۴) جابه‌جایی Reporting Time به بازه‌ای با FDP بزرگ‌تر. ۵) اعمال Commander\'s Discretion (در صورت مجاز بودن).',
    quote: 'OM-A 7.1.4.5 + 7.3.3 (سقف‌های مطلق Discretion).',
  },
};

const fallback: AnalysisRule = {
  rule: 'این بررسی به بخش مرتبط فصل ۷ OM-A اشاره دارد.',
  remedy: 'به سند رسمی OM-A فصل ۷ مراجعه کن یا با Crew Scheduling تماس بگیر.',
};

export const buildAnalysis = (checks: CheckResult[]): AnalysisDetail[] => {
  const out: AnalysisDetail[] = [];
  for (const c of checks) {
    if (c.status !== 'fail' && c.status !== 'warn') continue;
    const key = c.id in RULES ? c.id : c.id;
    const r = RULES[key] ?? fallback;
    out.push({
      ruleId: c.id,
      reference: c.reference,
      title: c.title,
      status: c.status,
      rule: r.rule,
      violation: c.value || c.limit ? `${c.message} (${c.value ?? '—'} / ${c.limit ?? '—'})` : c.message,
      remedy: r.remedy,
      quote: r.quote,
      calculation: c.calculation,
    });
  }
  return out;
};
