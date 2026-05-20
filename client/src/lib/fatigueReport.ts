// OM-A 7.1.1 + 7.3.2 + 7.3.3 + 7.7 — Fatigue Report builder.
//
// When a crew member declares unfit-to-fly, uses Commander's Discretion, or
// notes a fatigue-relevant event, OM-A requires an individual Fatigue Report
// be filed with Flight Safety & Ops Standard. This generator pre-fills the
// report from the user's roster context and produces a PDF + email-ready
// clipboard text, so the crew member can submit on the spot instead of
// hunting for the form at 03:00.

import { jsPDF } from 'jspdf';

export type FatigueReason =
  | 'commander-discretion'   // 7.3.3
  | 'unfit-to-fly'            // 7.1.1
  | 'roster-overload'         // cumulative breach
  | 'short-rest'              // 7.1.4.13
  | 'standby-abuse'           // 7.4.x
  | 'other';

export interface FatigueReportInput {
  /** Reporter's identity. */
  crewCode: string;
  crewName?: string;
  crewRole?: string;          // 'مهماندار' / 'کاپیتان' …
  contactEmail?: string;
  /** The flight or event being reported on. */
  flightNo?: string;
  flightDateIso?: string;
  depStation?: string;
  arrStation?: string;
  fdpHHMM?: string;
  /** Reason class + free-text detail. */
  reason: FatigueReason;
  detail: string;
  /** Optional context the engine produced (FDP cap, rest available, etc.). */
  fdpCapHHMM?: string;
  restAvailableHours?: number;
  restRequiredHours?: number;
  woclEncroachmentHours?: number;
  /** Whether Commander's Discretion was actually used + by how many minutes. */
  cdUsedMinutes?: number;
}

const REASON_FA: Record<FatigueReason, { title: string; refs: string[] }> = {
  'commander-discretion': { title: 'اعمال اختیار کاپیتان (Commander’s Discretion)', refs: ['7.3.2', '7.3.3'] },
  'unfit-to-fly':         { title: 'اعلام Unfit to Fly',                                refs: ['7.1.1'] },
  'roster-overload':      { title: 'تجاوز از سقف Cumulative Duty / Block',              refs: ['7.1.4.1', '7.1.4.2'] },
  'short-rest':           { title: 'کمبود Rest قبل از FDP',                              refs: ['7.1.4.13'] },
  'standby-abuse':        { title: 'تخلف Standby / Reserve',                             refs: ['7.4.2', '7.4.3'] },
  'other':                { title: 'سایر — توضیح در متن',                                refs: ['7.7'] },
};

/** Render the report as plain text — copy-paste into email body for FS&OS. */
export function renderFatigueReportText(r: FatigueReportInput): string {
  const meta = REASON_FA[r.reason];
  const date = r.flightDateIso ? new Date(r.flightDateIso).toLocaleDateString('fa-IR') : '—';
  const lines: string[] = [];
  lines.push('Fatigue Report — Iran Air OM-A Ch. 7');
  lines.push('=========================================');
  lines.push('');
  lines.push(`نوع گزارش: ${meta.title}`);
  lines.push(`مراجع OM-A: ${meta.refs.join(', ')}`);
  lines.push('');
  lines.push('— مشخصات خدمه —');
  lines.push(`کد خدمه: ${r.crewCode}`);
  if (r.crewName) lines.push(`نام: ${r.crewName}`);
  if (r.crewRole) lines.push(`نقش: ${r.crewRole}`);
  if (r.contactEmail) lines.push(`ایمیل تماس: ${r.contactEmail}`);
  lines.push('');
  lines.push('— مشخصات پرواز / رویداد —');
  if (r.flightNo) lines.push(`پرواز: ${r.flightNo}`);
  lines.push(`تاریخ: ${date}`);
  if (r.depStation || r.arrStation) lines.push(`مسیر: ${r.depStation ?? '?'} → ${r.arrStation ?? '?'}`);
  if (r.fdpHHMM) lines.push(`طول FDP: ${r.fdpHHMM}`);
  if (r.fdpCapHHMM) lines.push(`سقف مجاز FDP: ${r.fdpCapHHMM}`);
  if (r.restAvailableHours != null) lines.push(`Rest در دسترس: ${r.restAvailableHours.toFixed(1)}h`);
  if (r.restRequiredHours != null) lines.push(`Rest موردنیاز: ${r.restRequiredHours.toFixed(1)}h`);
  if (r.woclEncroachmentHours != null) lines.push(`پوشش WOCL: ${r.woclEncroachmentHours.toFixed(1)}h`);
  if (r.cdUsedMinutes != null) lines.push(`Commander Discretion: ${Math.floor(r.cdUsedMinutes / 60)}h ${r.cdUsedMinutes % 60}min`);
  lines.push('');
  lines.push('— شرح رویداد —');
  lines.push(r.detail || '(خدمه باید توضیح تکمیلی اضافه کند)');
  lines.push('');
  lines.push('— تأیید —');
  lines.push('این گزارش طبق OM-A 7.1.1 / 7.3.x توسط خدمهٔ مذکور ثبت شده');
  lines.push(`و در ${new Date().toLocaleString('fa-IR')} ساخته شده.`);
  return lines.join('\n');
}

/** Build a PDF (LTR; Persian-aware fonts in jsPDF require an embedded font,
 *  which would balloon the bundle — for v1 we output English-headed PDF with
 *  Persian text inside; readers render Persian via OS fallback fonts which is
 *  acceptable for an email attachment.). */
export function buildFatigueReportPdf(r: FatigueReportInput): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Fatigue Report', W / 2, 50, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Iran Air — OM-A Chapter 7', W / 2, 68, { align: 'center' });

  doc.setDrawColor(180);
  doc.line(40, 82, W - 40, 82);

  const lines = renderFatigueReportText(r).split('\n');
  let y = 100;
  doc.setFontSize(11);
  for (const line of lines) {
    if (y > 800) { doc.addPage(); y = 50; }
    if (line === '' || line.startsWith('—') || line.startsWith('===')) {
      doc.setFont('helvetica', 'bold');
      doc.text(line, 50, y);
      doc.setFont('helvetica', 'normal');
    } else {
      doc.text(line, 50, y, { maxWidth: W - 100 });
    }
    y += 16;
  }

  // Footer with generation timestamp.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(140);
    doc.text(`Generated by IRCrew · ${new Date().toISOString()}`, W / 2, 820, { align: 'center' });
    doc.text(`Page ${i} / ${total}`, W - 40, 820, { align: 'right' });
  }

  return doc.output('blob');
}

export function downloadFatigueReportPdf(r: FatigueReportInput): void {
  const blob = buildFatigueReportPdf(r);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `FatigueReport_${r.crewCode}_${ts}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const reasonLabel = (r: FatigueReason) => REASON_FA[r].title;
