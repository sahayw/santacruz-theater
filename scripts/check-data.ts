/**
 * Dry-run data check: prints show count, performance count, and date range.
 * Run with: npm run check-data
 */
import { getShows, getPerformances } from '../src/lib/data.ts';

const [shows, performances] = await Promise.all([getShows(), getPerformances()]);

const firstDate = performances[0]?.date ?? '—';
const lastDate  = performances[performances.length - 1]?.date ?? '—';

const byCompany: Record<string, number> = {};
const byRun: Record<string, number> = {};
for (const p of performances) {
  byCompany[p.company] = (byCompany[p.company] ?? 0) + 1;
  const key = `${p.company} · ${p.showAbv}`;
  byRun[key] = (byRun[key] ?? 0) + 1;
}

console.log('─────────────────────────────────────────');
console.log(`Shows (runs) loaded : ${shows.length}`);
console.log(`Total performances  : ${performances.length}`);
console.log(`Date range          : ${firstDate} → ${lastDate}`);
console.log('');
console.log('By company:');
for (const [co, n] of Object.entries(byCompany).sort()) {
  console.log(`  ${String(co).padEnd(10)} ${n} performance${n === 1 ? '' : 's'}`);
}
console.log('');
console.log('By run:');
for (const [label, n] of Object.entries(byRun)) {
  console.log(`  ${label.padEnd(34)} ${n}`);
}
console.log('─────────────────────────────────────────');
