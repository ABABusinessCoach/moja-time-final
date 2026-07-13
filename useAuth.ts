/**
 * Maps a date to its bi-weekly pay period (Saturday start, Friday end).
 * Reference anchor: Saturday June 27, 2026 is a known period start.
 * Cutoff is the last day (Friday) of each period — a shift on the cutoff date
 * belongs to the period ENDING that day, not the next one.
 */
export function getPayPeriodForDate(date: Date): { start: string; end: string } {
  const refDate = new Date("2026-06-27T00:00:00");

  // Convert to EST calendar date
  const estStr = date.toLocaleString("en-US", { timeZone: "America/New_York" });
  const now = new Date(estStr);
  now.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();
  const daysSinceSat = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
  const currentWeekSat = new Date(now);
  currentWeekSat.setDate(now.getDate() - daysSinceSat);

  const msSinceRef = currentWeekSat.getTime() - refDate.getTime();
  const weeksSinceRef = Math.round(msSinceRef / (7 * 24 * 60 * 60 * 1000));
  const isSecondWeek = weeksSinceRef % 2 !== 0;

  const payPeriodStart = new Date(currentWeekSat);
  if (isSecondWeek) {
    payPeriodStart.setDate(payPeriodStart.getDate() - 7);
  }
  const payPeriodEnd = new Date(payPeriodStart);
  payPeriodEnd.setDate(payPeriodStart.getDate() + 13);

  const fmtDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return { start: fmtDate(payPeriodStart), end: fmtDate(payPeriodEnd) };
}
