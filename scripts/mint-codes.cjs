#!/usr/bin/env node
/* eslint-disable */
// Mint IRCrew activation codes from the MASTER_SECRET.
//
// Usage:
//   node scripts/mint-codes.cjs                  → prints codes 1..20
//   node scripts/mint-codes.cjs 30               → prints codes 1..30
//   node scripts/mint-codes.cjs 50 100           → prints codes 50..100
//   node scripts/mint-codes.cjs --check 23PQ-K8H4  → validates one code
//
// IMPORTANT: MASTER_SECRET below must match the value in
// client/src/lib/activation.ts. If you ever rotate it, ALL previously issued
// codes will stop working — pick a new range for the next batch.

const crypto = require('node:crypto');

// ────────────────────────────────────────────────────────────────────────
// KEEP IN SYNC with client/src/lib/activation.ts
// ────────────────────────────────────────────────────────────────────────
const MASTER_SECRET = 'ircrew-v1-2026-do-NOT-commit-real-secret';
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// ────────────────────────────────────────────────────────────────────────

function toBase32(buf, length) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  return out;
}

function codeFor(seq) {
  const sig = crypto.createHmac('sha256', MASTER_SECRET).update(`IRCREW#${seq}`).digest();
  const s = toBase32(sig, 8);
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

function normalise(s) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ─── main ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args[0] === '--check' && args[1]) {
  const target = normalise(args[1]);
  if (target.length !== 8) {
    console.log(`code "${args[1]}" → must be 8 chars (got ${target.length})`);
    process.exit(2);
  }
  for (let i = 1; i <= 5000; i++) {
    if (normalise(codeFor(i)) === target) {
      console.log(`code "${args[1]}" → VALID (sequence #${i})`);
      process.exit(0);
    }
  }
  console.log(`code "${args[1]}" → INVALID (not found in 1..5000)`);
  process.exit(1);
}

let from = 1, to = 20;
if (args.length === 1) to = parseInt(args[0], 10);
if (args.length === 2) { from = parseInt(args[0], 10); to = parseInt(args[1], 10); }
if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to > 5000 || from > to) {
  console.error('Usage: node scripts/mint-codes.cjs [from [to]]');
  console.error('       node scripts/mint-codes.cjs --check CODE');
  process.exit(64);
}

console.log('seq\tcode');
console.log('---\t----');
for (let i = from; i <= to; i++) {
  console.log(`${i}\t${codeFor(i)}`);
}
