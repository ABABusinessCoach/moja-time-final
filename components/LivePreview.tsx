import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getPayPeriodList } from '../lib/payPeriod';
import { formatHM } from '../lib/formatTime';
import { Clock, ChevronRight, ArrowLeft, Radio, RefreshCw, Users, AlertTriangle } from 'lucide-react';

const TZ = 'America/New_York';
const OT_THRESHOLD_MIN = 40 * 60;
const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface StaffMember {
  id: string;
  name: string;
  email: string;
  employee_number: string | null;
  is_clocked_in: boolean;
}

interface ShiftLog {
  id: string;
  staff_id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  duration_minutes: number | null;
}

interface BreakLog {
  clock_log_id: string;
  break_start: string;
  break_end: string | null;
  duration_minutes: number | null;
  break_type: string;
}

interface StaffSummary {
  staff: StaffMember;
  shifts: ShiftLog[];
  breaks: BreakLog[];
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  shiftCount: number;
  hasOpenShift: boolean;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getShiftDateKey(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: TZ });
}

function formatTimeEST(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit',
  });
}

function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface DayRow {
  dateKey: string;
  dayName: string;
  shifts: ShiftLog[];
  breaks: BreakLog[];
  netMinutes: number;
  regMinutes: number;
  otMinutes: number;
  hasOpen: boolean;
}

interface WeekBlock {
  label: string;
  dateRange: string;
  days: DayRow[];
  totalMinutes: number;
  regMinutes: number;
  otMinutes: number;
}

function buildWeeks(staffSummary: StaffSummary, periodStart: string): WeekBlock[] {
  const ppStart = parseLocalDate(periodStart);
  const weeks: WeekBlock[] = [];

  for (let w = 0; w < 2; w++) {
    const weekStart = new Date(ppStart);
    weekStart.setDate(ppStart.getDate() + w * 7);

    const days: DayRow[] = [];
    let weekNetTotal = 0;

    for (let d = 0; d < 7; d++) {
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + d);
      const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

      const dayShifts = staffSummary.shifts.filter(s => getShiftDateKey(s.clock_in_time) === dateKey);
      const dayBreaks = staffSummary.breaks.filter(b => dayShifts.some(s => s.id === b.clock_log_id));

      let netMinutes = 0;
      for (const shift of dayShifts) {
        const shiftBreaks = staffSummary.breaks.filter(b => b.clock_log_id === shift.id);
        let shiftMins = Math.max(0, shift.duration_minutes || 0);
        // If shift is still open, calculate live duration
        if (!shift.clock_out_time) {
          const clockIn = new Date(shift.clock_in_time).getTime();
          shiftMins = Math.max(0, Math.round((Date.now() - clockIn) / 60000));
        }
        const lunchMins = shiftBreaks
          .filter(b => b.break_type === 'lunch' && b.duration_minutes)
          .reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
        shiftMins = Math.max(0, shiftMins - lunchMins);
        netMinutes += shiftMins;
      }

      weekNetTotal += netMinutes;
      days.push({
        dateKey,
        dayName: DAY_NAMES[d],
        shifts: dayShifts,
        breaks: dayBreaks,
        netMinutes,
        regMinutes: 0,
        otMinutes: 0,
        hasOpen: dayShifts.some(s => !s.clock_out_time),
      });
    }

    const otMinutes = Math.max(0, weekNetTotal - OT_THRESHOLD_MIN);
    const regMinutes = weekNetTotal - otMinutes;

    let remainingReg = regMinutes;
    for (const day of days) {
      if (day.netMinutes > 0) {
        if (remainingReg >= day.netMinutes) {
          day.regMinutes = day.netMinutes;
          day.otMinutes = 0;
          remainingReg -= day.netMinutes;
        } else {
          day.regMinutes = remainingReg;
          day.otMinutes = day.netMinutes - remainingReg;
          remainingReg = 0;
        }
      }
    }

    const fmtDateKey = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    weeks.push({
      label: `Week ${w + 1}`,
      dateRange: `${formatDateShort(fmtDateKey(weekStart))} - ${formatDateShort(fmtDateKey(weekEnd))}`,
      days,
      totalMinutes: weekNetTotal,
      regMinutes,
      otMinutes,
    });
  }

  return weeks;
}

export function LivePreview() {
  const payPeriodOptions = getPayPeriodList();
  const currentPPStart = payPeriodOptions.find(p => p.isCurrent)?.start || payPeriodOptions[0]?.start || '';
  const [periodFilter, setPeriodFilter] = useState(currentPPStart);
  const [staffSummaries, setStaffSummaries] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffSummary | null>(null);

  useEffect(() => {
    loadLiveData();
  }, [periodFilter]);

  async function loadLiveData() {
    setLoading(true);
    const period = payPeriodOptions.find(p => p.start === periodFilter);
    if (!period) { setLoading(false); return; }

    const [staffRes, shiftsRes, breaksRes] = await Promise.all([
      supabase.from('staff').select('id, name, email, employee_number, is_clocked_in').eq('is_active', true).order('name'),
      supabase.from('clock_logs')
        .select('id, staff_id, clock_in_time, clock_out_time, duration_minutes')
        .gte('clock_in_time', period.start + 'T00:00:00')
        .lte('clock_in_time', period.end + 'T23:59:59')
        .order('clock_in_time', { ascending: true }),
      supabase.from('break_logs')
        .select('clock_log_id, break_start, break_end, duration_minutes, break_type'),
    ]);

    const staffList: StaffMember[] = staffRes.data || [];
    const allShifts: ShiftLog[] = shiftsRes.data || [];
    const allBreaks: BreakLog[] = breaksRes.data || [];

    const shiftIds = new Set(allShifts.map(s => s.id));
    const relevantBreaks = allBreaks.filter(b => shiftIds.has(b.clock_log_id));

    const summaries: StaffSummary[] = staffList.map(staff => {
      const shifts = allShifts.filter(s => s.staff_id === staff.id);
      const breaks = relevantBreaks.filter(b => shifts.some(s => s.id === b.clock_log_id));

      let totalMinutes = 0;
      for (const shift of shifts) {
        let mins = Math.max(0, shift.duration_minutes || 0);
        if (!shift.clock_out_time) {
          mins = Math.max(0, Math.round((Date.now() - new Date(shift.clock_in_time).getTime()) / 60000));
        }
        const lunchMins = breaks
          .filter(b => b.clock_log_id === shift.id && b.break_type === 'lunch' && b.duration_minutes)
          .reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
        totalMinutes += Math.max(0, mins - lunchMins);
      }

      const overtimeMinutes = Math.max(0, totalMinutes - OT_THRESHOLD_MIN);
      const regularMinutes = totalMinutes - overtimeMinutes;
      const hasOpenShift = shifts.some(s => !s.clock_out_time);

      return {
        staff,
        shifts,
        breaks,
        totalMinutes,
        regularMinutes,
        overtimeMinutes,
        shiftCount: shifts.length,
        hasOpenShift,
      };
    });

    summaries.sort((a, b) => b.totalMinutes - a.totalMinutes);
    setStaffSummaries(summaries);
    setLoading(false);
  }

  const totalAllMinutes = useMemo(() => staffSummaries.reduce((s, x) => s + x.totalMinutes, 0), [staffSummaries]);
  const totalOTMinutes = useMemo(() => staffSummaries.reduce((s, x) => s + x.overtimeMinutes, 0), [staffSummaries]);
  const activeCount = useMemo(() => staffSummaries.filter(s => s.shiftCount > 0).length, [staffSummaries]);
  const liveCount = useMemo(() => staffSummaries.filter(s => s.hasOpenShift).length, [staffSummaries]);

  // Detail view for a single staff member
  if (selectedStaff) {
    const weeks = buildWeeks(selectedStaff, periodFilter);
    const grandTotal = weeks.reduce((s, w) => s + w.totalMinutes, 0);
    const grandReg = weeks.reduce((s, w) => s + w.regMinutes, 0);
    const grandOT = weeks.reduce((s, w) => s + w.otMinutes, 0);

    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedStaff(null)}
          className="inline-flex items-center gap-2 text-sm font-bold text-moja-blue hover:text-moja-orange transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Live Preview
        </button>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-moja-blue to-moja-blue/90 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-xs font-bold uppercase tracking-wide">Live Hours Preview</p>
                <h3 className="text-white text-xl font-bold mt-1">
                  {selectedStaff.staff.employee_number && <span className="text-white/40 font-mono text-sm mr-2">#{selectedStaff.staff.employee_number}</span>}
                  {selectedStaff.staff.name}
                </h3>
              </div>
              {selectedStaff.hasOpenShift && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-300 rounded-full text-xs font-bold">
                  <Radio className="w-3 h-3 animate-pulse" /> Currently Clocked In
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {weeks.map((week, wi) => (
              <div key={wi}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-bold text-moja-blue">{week.label}</h4>
                    <p className="text-xs text-gray-400">{week.dateRange}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-moja-blue">{formatHM(week.totalMinutes)}</p>
                    {week.otMinutes > 0 && (
                      <p className="text-xs text-orange-500 font-semibold">+{formatHM(week.otMinutes)} OT</p>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-bold">Day</th>
                        <th className="text-left px-3 py-2 font-bold">Date</th>
                        <th className="text-left px-3 py-2 font-bold">In</th>
                        <th className="text-left px-3 py-2 font-bold">Out</th>
                        <th className="text-right px-3 py-2 font-bold">Hours</th>
                        <th className="text-right px-3 py-2 font-bold">OT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {week.days.map((day) => {
                        const shift = day.shifts[0];
                        return (
                          <tr key={day.dateKey} className={`border-t border-gray-50 ${day.hasOpen ? 'bg-green-50/50' : ''}`}>
                            <td className="px-3 py-2.5 font-bold text-gray-600">{day.dayName}</td>
                            <td className="px-3 py-2.5 text-gray-500">{formatDateShort(day.dateKey)}</td>
                            <td className="px-3 py-2.5 text-gray-700">
                              {shift ? formatTimeEST(shift.clock_in_time) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-gray-700">
                              {shift ? (
                                shift.clock_out_time ? formatTimeEST(shift.clock_out_time) : (
                                  <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                                    <Radio className="w-3 h-3 animate-pulse" /> Live
                                  </span>
                                )
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-moja-blue">
                              {day.netMinutes > 0 ? formatHM(day.regMinutes) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-orange-500">
                              {day.otMinutes > 0 ? formatHM(day.otMinutes) : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Grand totals */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-500">Period Total</span>
              <div className="text-right">
                <span className="text-lg font-bold text-moja-blue">{formatHM(grandReg)} reg</span>
                {grandOT > 0 && (
                  <span className="ml-3 text-lg font-bold text-orange-500">+{formatHM(grandOT)} OT</span>
                )}
                <p className="text-xs text-gray-400 mt-0.5">{formatHM(grandTotal)} gross</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-5">
      {/* Period selector + refresh */}
      <div className="flex items-center gap-3">
        <select
          value={periodFilter}
          onChange={e => setPeriodFilter(e.target.value)}
          className="h-9 px-3 pr-8 text-sm font-bold text-moja-blue bg-white border-2 border-moja-blue/20 rounded-lg focus:border-moja-blue focus:outline-none appearance-none cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231B3A5C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          {payPeriodOptions.map(pp => (
            <option key={pp.start} value={pp.start}>{pp.label}</option>
          ))}
        </select>
        <button
          onClick={loadLiveData}
          className="p-2 text-gray-400 hover:text-moja-blue rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-3.5 h-3.5 text-moja-blue/40" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Active Staff</p>
          </div>
          <p className="text-2xl font-bold text-moja-blue">{activeCount}<span className="text-sm text-gray-400 ml-1">/ {staffSummaries.length}</span></p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-3.5 h-3.5 text-moja-blue/40" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Hours</p>
          </div>
          <p className="text-2xl font-bold text-moja-blue">{formatHM(totalAllMinutes)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Overtime</p>
          </div>
          <p className="text-2xl font-bold text-orange-500">{formatHM(totalOTMinutes)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-3.5 h-3.5 text-green-500" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Clocked In</p>
          </div>
          <p className="text-2xl font-bold text-green-600">{liveCount}</p>
        </div>
      </div>

      {/* Staff list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-moja-orange border-t-transparent rounded-full animate-spin" />
        </div>
      ) : staffSummaries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-lg font-bold text-gray-400">No active staff found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staffSummaries.map(summary => (
            <button
              key={summary.staff.id}
              onClick={() => setSelectedStaff(summary)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-moja-blue/30 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  summary.hasOpenShift ? 'bg-green-100' :
                  summary.shiftCount > 0 ? 'bg-blue-50' : 'bg-gray-50'
                }`}>
                  {summary.hasOpenShift ? (
                    <Radio className="w-4 h-4 text-green-600 animate-pulse" />
                  ) : (
                    <Clock className="w-4 h-4 text-moja-blue/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-gray-800 truncate">
                      {summary.staff.employee_number && <span className="text-gray-400 font-mono text-xs mr-1.5">#{summary.staff.employee_number}</span>}
                      {summary.staff.name}
                    </p>
                    {summary.hasOpenShift && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold flex-shrink-0">
                        <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">
                    {summary.shiftCount} shift{summary.shiftCount !== 1 ? 's' : ''} this period
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-moja-blue">{formatHM(summary.totalMinutes)}</p>
                  {summary.overtimeMinutes > 0 && (
                    <span className="text-xs text-orange-500 font-semibold">+{formatHM(summary.overtimeMinutes)} OT</span>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-moja-blue transition-colors flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
