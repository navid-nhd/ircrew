// OM-A 7.5 — Records: the operator MUST keep 24 months of Block/FDP/Duty/
// Rest/Days-Off/Home Base records and provide a copy on request. This vault
// makes the same records available to the crew member directly, indefinitely,
// and exportable as PDF/CSV — useful when transferring to another operator or
// disputing a "lost" duty.

import type { DutyEntry } from '../ftl/rules/types';

const STORE_PREFIX = 'ircrew.vault.v1.';

const key = (code: string) => `${STORE_PREFIX}${code.toUpperCase()}`;

export interface VaultRecord extends DutyEntry {
  /** When this entry was first imported into the vault (ms). */
  vaultedAt: number;
  /** The period string this entry came from (for traceability). */
  sourcePeriod?: string;
}

interface VaultStore {
  /** Entries keyed by id so re-imports update in place rather than duplicating. */
  records: Record<string, VaultRecord>;
}

const loadStore = (code: string): VaultStore => {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return { records: {} };
    return JSON.parse(raw) as VaultStore;
  } catch { return { records: {} }; }
};

const saveStore = (code: string, store: VaultStore): void => {
  try { localStorage.setItem(key(code), JSON.stringify(store)); }
  catch { /* quota — rare with 24mo of records; if it happens the UI should
              warn and offer "export then trim". */ }
};

/** Merge new entries into the vault. Existing IDs are updated (start/end may
 *  shift if a flight was re-timed), brand-new IDs are vaulted with the current
 *  timestamp. We never delete from the vault automatically. */
export function vaultEntries(
  crewCode: string,
  entries: DutyEntry[],
  sourcePeriod?: string,
): { added: number; updated: number; totalSize: number } {
  const store = loadStore(crewCode);
  let added = 0, updated = 0;
  for (const e of entries) {
    if (store.records[e.id]) {
      updated++;
    } else {
      added++;
    }
    store.records[e.id] = { ...e, vaultedAt: store.records[e.id]?.vaultedAt ?? Date.now(), sourcePeriod };
  }
  saveStore(crewCode, store);
  return { added, updated, totalSize: Object.keys(store.records).length };
}

/** All vaulted records, sorted by start time (oldest first). */
export function listVault(crewCode: string): VaultRecord[] {
  const store = loadStore(crewCode);
  return Object.values(store.records).sort((a, b) =>
    new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
}

/** Records within a date range — used for "export last 24 months". */
export function vaultRange(crewCode: string, fromIso: string, toIso: string): VaultRecord[] {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  return listVault(crewCode).filter((r) => {
    const t = new Date(r.start).getTime();
    return t >= fromMs && t <= toMs;
  });
}

/** Aggregate totals for the dashboard: cumulative FDP, block, etc. */
export interface VaultSummary {
  totalEntries: number;
  fdpCount: number;
  totalBlockHours: number;
  totalDutyHours: number;
  dayOffCount: number;
  reserveCount: number;
  earliestIso: string | null;
  latestIso: string | null;
}

export function summarizeVault(crewCode: string): VaultSummary {
  const list = listVault(crewCode);
  let totalBlock = 0, totalDuty = 0, fdp = 0, off = 0, reserve = 0;
  for (const r of list) {
    if (r.kind === 'fdp') {
      fdp++;
      totalBlock += r.blockHours ?? 0;
    }
    if (r.kind === 'day_off') off++;
    if (r.kind === 'reserve') reserve++;
    const dur = (new Date(r.end).getTime() - new Date(r.start).getTime()) / 3600_000;
    if (['fdp', 'positioning', 'training', 'admin', 'airport_sb'].includes(r.kind)) totalDuty += dur;
  }
  return {
    totalEntries: list.length,
    fdpCount: fdp,
    totalBlockHours: Math.round(totalBlock * 10) / 10,
    totalDutyHours: Math.round(totalDuty * 10) / 10,
    dayOffCount: off,
    reserveCount: reserve,
    earliestIso: list[0]?.start ?? null,
    latestIso: list[list.length - 1]?.start ?? null,
  };
}

/** CSV export — RFC 4180 compatible, with Persian-friendly UTF-8 BOM so Excel
 *  opens it correctly. */
export function exportVaultCsv(crewCode: string): string {
  const list = listVault(crewCode);
  const header = ['vaultedAt', 'kind', 'start', 'end', 'sectors', 'blockHours', 'startStation', 'endStation', 'note'];
  const rows = list.map((r) => header.map((h) => csvCell((r as unknown as Record<string, unknown>)[h])).join(','));
  return '﻿' + header.join(',') + '\n' + rows.join('\n');
}

const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export function downloadBlob(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
