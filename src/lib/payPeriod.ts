/**
 * Maps a date to its bi-weekly pay period (Saturday start, Friday end).
 * Reference anchor: Saturday June 27, 2026 is a known period start (PP13).
 * PP1 starts Saturday January 10, 2026.
 * Cutoff is the last day (Friday) of each period — a shift on the cutoff date
 * belongs to the period ENDING that day, not the next one.
 */

const REF_DATE = new Date("2026-06-27T00:00:00");
const REF_PP_NUMBER = 14;

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getPayPeriodForDate(date: Date): { start: string; end: string } {
  const estStr = date.toLocaleString("en-US", { timeZone: "America/New_York" });
  const now = new Date(estStr);
  now.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();
  const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const currentWeekSat = new Date(now);
  currentWeekSat.setDate(now.getDate() - daysSinceSat);

  const msSinceRef = currentWeekSat.getTime() - REF_DATE.getTime();
  const weeksSinceRef = Math.round(msSinceRef / (7 * 24 * 60 * 60 * 1000));
  const isSecondWeek = weeksSinceRef % 2 !== 0;

  const payPeriodStart = new Date(currentWeekSat);
  if (isSecondWeek) {
    payPeriodStart.setDate(payPeriodStart.getDate() - 7);
  }
  const payPeriodEnd = new Date(payPeriodStart);
  payPeriodEnd.setDate(payPeriodStart.getDate() + 13);

  return { start: fmtDate(payPeriodStart), end: fmtDate(payPeriodEnd) };
}

export interface PayPeriodOption {
  number: number;
  start: string;
  end: string;
  label: string;
  isCurrent: boolean;
}

export function getPayPeriodList(): PayPeriodOption[] {
  const current = getPayPeriodForDate(new Date());

  const periods: PayPeriodOption[] = [];
  for (let pp = 12; pp <= 26; pp++) {
    const offset = (pp - REF_PP_NUMBER) * 14;
    const start = new Date(REF_DATE);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(start.getDate() + 13);

    const startStr = fmtDate(start);
    const endStr = fmtDate(end);
    const isCurrent = startStr === current.start;

    const fmtShort = (d: Date) => {
      const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
      if (d.getFullYear() !== 2026) opts.year = "numeric";
      return d.toLocaleDateString("en-US", opts);
    };

    const label = `${isCurrent ? "Current | " : ""}PP${pp} (${fmtShort(start)} \u2013 ${fmtShort(end)})`;

    periods.push({ number: pp, start: startStr, end: endStr, label, isCurrent });
  }

  return periods;
}
