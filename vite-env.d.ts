import { getPayPeriodForDate } from "./payPeriod";

function test(label: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${label}`);
  } catch (e: any) {
    console.error(`FAIL: ${label} — ${e.message}`);
    process.exitCode = 1;
  }
}

function assertEqual(actual: string, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected "${expected}", got "${actual}"`);
  }
}

// --- Boundary tests ---

// Cutoff day (Fri Jun 26) belongs to the PREVIOUS period (Jun 13–Jun 26)
test("June 26 (cutoff) maps to previous period ending Jun 26", () => {
  const result = getPayPeriodForDate(new Date("2026-06-26T12:00:00"));
  assertEqual(result.start, "2026-06-13");
  assertEqual(result.end, "2026-06-26");
});

// Day after cutoff (Sat Jun 27) is the start of the NEXT period
test("June 27 (start of new period) maps to Jun 27–Jul 10", () => {
  const result = getPayPeriodForDate(new Date("2026-06-27T12:00:00"));
  assertEqual(result.start, "2026-06-27");
  assertEqual(result.end, "2026-07-10");
});

// Last day of current period (Fri Jul 10) stays in Jun 27–Jul 10
test("July 10 (end of period / cutoff) maps to Jun 27–Jul 10", () => {
  const result = getPayPeriodForDate(new Date("2026-07-10T12:00:00"));
  assertEqual(result.start, "2026-06-27");
  assertEqual(result.end, "2026-07-10");
});

// Day after current period (Sat Jul 11) starts the next period
test("July 11 (start of next period) maps to Jul 11–Jul 24", () => {
  const result = getPayPeriodForDate(new Date("2026-07-11T12:00:00"));
  assertEqual(result.start, "2026-07-11");
  assertEqual(result.end, "2026-07-24");
});

// Mid-period date
test("July 1 (midweek) maps to Jun 27–Jul 10", () => {
  const result = getPayPeriodForDate(new Date("2026-07-01T15:00:00"));
  assertEqual(result.start, "2026-06-27");
  assertEqual(result.end, "2026-07-10");
});

// Period is always exactly 14 days (end - start + 1 = 14)
test("Period length is always 14 days", () => {
  const result = getPayPeriodForDate(new Date("2026-07-05T12:00:00"));
  const start = new Date(result.start + "T00:00:00");
  const end = new Date(result.end + "T00:00:00");
  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) + 1;
  if (days !== 14) throw new Error(`Expected 14 days, got ${days}`);
});

// A shift on cutoff day is NOT counted in the next period
test("Shift on cutoff (Jun 26) is not in the Jun 27–Jul 10 period", () => {
  const shiftDate = new Date("2026-06-26T18:00:00");
  const shiftPeriod = getPayPeriodForDate(shiftDate);
  const currentPeriod = getPayPeriodForDate(new Date("2026-07-01T12:00:00"));
  if (shiftPeriod.start === currentPeriod.start) {
    throw new Error("Shift on cutoff date was incorrectly assigned to next period");
  }
});

console.log("\nAll boundary tests complete.");
