import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { callTimecardFunction } from '../lib/supabase';
import { getPayPeriodList } from '../lib/payPeriod';
import { formatHM } from '../lib/formatTime';
import { Download, CalendarRange, Loader2, X } from 'lucide-react';
import type { Staff, ClockLog, BreakLog } from '../lib/types';

const DAY_NAMES = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateShort(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getShiftDateKey(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

interface EmployeePeriodData {
  staffId: string;
  staffName: string;
  employeeNumber: string | null;
  status: string;
  weeks: WeekData[];
  periodTotal: number;
  periodReg: number;
  periodOT: number;
}

interface WeekData {
  startDate: string;
  endDate: string;
  days: DayData[];
  totalMinutes: number;
  regMinutes: number;
  otMinutes: number;
}

interface DayData {
  date: Date;
  dateKey: string;
  dayName: string;
  netMinutes: number;
  regMinutes: number;
  otMinutes: number;
}

function downloadBlob(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function WeeklyReports() {
  const payPeriodOptions = getPayPeriodList();
  const currentPPStart = payPeriodOptions.find(p => p.isCurrent)?.start || payPeriodOptions[0]?.start || '';
  const [periodFilter, setPeriodFilter] = useState<string>(currentPPStart);
  const [employees, setEmployees] = useState<EmployeePeriodData[]>([]);
  const [loading, setLoading] = useState(true);
  const [grandTotal, setGrandTotal] = useState(0);

  // CSV export state
  const [showDateRange, setShowDateRange] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [rangeEnd, setRangeEnd] = useState(() => new Date().toISOString().split('T')[0]);
  const [rangeStaff, setRangeStaff] = useState('');
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [rangeExporting, setRangeExporting] = useState(false);

  const activePeriod = payPeriodOptions.find(p => p.start === periodFilter) || payPeriodOptions[0];

  useEffect(() => {
    loadPayrollData();
  }, [periodFilter]);

  useEffect(() => {
    supabase.from('staff').select('*').order('name').then(({ data }) => {
      if (data) setStaffList(data);
    });
  }, []);

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || '';
  }

  async function loadPayrollData() {
    setLoading(true);
    const token = await getAuthToken();
    const result = await callTimecardFunction('/all', { authToken: token });

    if (!result.success) {
      setLoading(false);
      return;
    }

    const reports = (result.reports || []).filter((r: { pay_periods: { start_date: string } | null }) =>
      r.pay_periods?.start_date === activePeriod.start
    );

    const ppStart = parseLocalDate(activePeriod.start);
    const OT_THRESHOLD = 40 * 60;

    const employeeData: EmployeePeriodData[] = [];

    for (const report of reports) {
      const detailResult = await callTimecardFunction(`/detail/${report.id}`, { authToken: token });
      if (!detailResult.success) continue;

      const { shifts, breaks, corrections } = detailResult;
      const weeks: WeekData[] = [];

      for (let w = 0; w < 2; w++) {
        const weekStart = new Date(ppStart);
        weekStart.setDate(ppStart.getDate() + w * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const days: DayData[] = [];
        let weekNetTotal = 0;

        for (let d = 0; d < 7; d++) {
          const currentDate = new Date(weekStart);
          currentDate.setDate(weekStart.getDate() + d);
          const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

          const dayShifts = (shifts || []).filter((s: { clock_in_time: string }) => getShiftDateKey(s.clock_in_time) === dateKey);
          let netMinutes = 0;

          for (const s of dayShifts) {
            const sCorrection = (corrections || []).find((c: { clock_log_id: string; approval_status: string }) => c.clock_log_id === s.id && c.approval_status === 'approved');
            let shiftMins = sCorrection
              ? Math.max(0, sCorrection.proposed_duration_minutes || 0)
              : Math.max(0, s.duration_minutes || 0);
            const lunchMins = (breaks || [])
              .filter((b: { clock_log_id: string; break_type: string; duration_minutes: number | null }) => b.clock_log_id === s.id && b.break_type === 'lunch' && b.duration_minutes)
              .reduce((sum: number, b: { duration_minutes: number | null }) => sum + (b.duration_minutes || 0), 0);
            shiftMins = Math.max(0, shiftMins - lunchMins);
            netMinutes += shiftMins;
          }

          weekNetTotal += netMinutes;
          days.push({
            date: currentDate,
            dateKey,
            dayName: DAY_NAMES[d],
            netMinutes,
            regMinutes: 0,
            otMinutes: 0,
          });
        }

        const otMinutes = Math.max(0, weekNetTotal - OT_THRESHOLD);
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

        weeks.push({
          startDate: fmtDateKey(weekStart),
          endDate: fmtDateKey(weekEnd),
          days,
          totalMinutes: weekNetTotal,
          regMinutes,
          otMinutes,
        });
      }

      const periodTotal = weeks.reduce((s, w) => s + w.totalMinutes, 0);
      const periodReg = weeks.reduce((s, w) => s + w.regMinutes, 0);
      const periodOT = weeks.reduce((s, w) => s + w.otMinutes, 0);

      employeeData.push({
        staffId: report.staff_id,
        staffName: report.staff?.name || 'Unknown',
        employeeNumber: report.staff?.employee_number || null,
        status: report.status,
        weeks,
        periodTotal,
        periodReg,
        periodOT,
      });
    }

    employeeData.sort((a, b) => a.staffName.localeCompare(b.staffName));
    setEmployees(employeeData);
    setGrandTotal(employeeData.reduce((s, e) => s + e.periodTotal, 0));
    setLoading(false);
  }

  async function exportDateRangeCSV() {
    if (!rangeStart || !rangeEnd) return;
    setRangeExporting(true);

    try {
      const startDate = new Date(rangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(rangeEnd);
      endDate.setHours(23, 59, 59, 999);

      const [staffRes, logsRes, breaksRes, corrRes] = await Promise.all([
        supabase.from('staff').select('*').order('name'),
        supabase.from('clock_logs').select('*').gte('clock_in_time', startDate.toISOString()).lte('clock_in_time', endDate.toISOString()).order('clock_in_time'),
        supabase.from('break_logs').select('*').gte('break_start', startDate.toISOString()).lte('break_start', endDate.toISOString()),
        supabase.from('timecard_corrections').select('clock_log_id, proposed_duration_minutes').eq('approval_status', 'approved').not('clock_log_id', 'is', null),
      ]);

      const allStaff: Staff[] = staffRes.data || [];
      let rangeLogs: ClockLog[] = logsRes.data || [];
      const rangeBreaks: BreakLog[] = breaksRes.data || [];
      const rangeCorrMap = new Map((corrRes.data || []).map((c: { clock_log_id: string; proposed_duration_minutes: number }) => [c.clock_log_id, c.proposed_duration_minutes]));

      if (rangeStaff) {
        rangeLogs = rangeLogs.filter(l => l.staff_id === rangeStaff);
      }

      const staffMap = new Map<string, { staff: Staff; logs: ClockLog[] }>();
      rangeLogs.forEach(log => {
        const staff = allStaff.find(s => s.id === log.staff_id);
        if (!staff) return;
        if (!staffMap.has(staff.id)) staffMap.set(staff.id, { staff, logs: [] });
        staffMap.get(staff.id)!.logs.push(log);
      });

      const rows: string[][] = [
        ['Employee Name', 'Employee #', 'Date', 'Clock In', 'Clock Out', 'Raw Time', 'Break', 'Lunch', 'Final Hours', 'Overtime', 'Week Ending', 'Notes'],
      ];

      let grandTotalHours = 0;
      let grandTotalOvertime = 0;

      const sortedStaff = Array.from(staffMap.values()).sort((a, b) => a.staff.name.localeCompare(b.staff.name));

      sortedStaff.forEach(({ staff, logs: staffLogs }) => {
        const weekGroups = new Map<string, ClockLog[]>();
        staffLogs.forEach(log => {
          const logDate = new Date(log.clock_in_time);
          const day = logDate.getDay();
          const diffToSat = day === 6 ? 0 : -(day + 1);
          const sat = new Date(logDate);
          sat.setDate(logDate.getDate() + diffToSat);
          const weekKey = sat.toISOString().split('T')[0];
          if (!weekGroups.has(weekKey)) weekGroups.set(weekKey, []);
          weekGroups.get(weekKey)!.push(log);
        });

        let staffTotalHours = 0;
        let staffTotalOvertime = 0;

        Array.from(weekGroups.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([, weekLogs]) => {
          let weekTotal = 0;
          weekLogs.forEach(log => {
            const clockIn = new Date(log.clock_in_time);
            const clockOut = log.clock_out_time ? new Date(log.clock_out_time) : null;
            const rawMinutes = clockOut ? (clockOut.getTime() - clockIn.getTime()) / 60000 : 0;

            const logBreaks = rangeBreaks.filter(b => b.clock_log_id === log.id);
            const breakMins = logBreaks.filter(b => b.break_type === 'break').reduce((sum, b) => sum + (b.duration_minutes || 0), 0);
            const lunchMins = logBreaks.filter(b => b.break_type === 'lunch').reduce((sum, b) => sum + (b.duration_minutes || 0), 0);

            const grossMinutes = rangeCorrMap.has(log.id)
              ? Math.max(0, rangeCorrMap.get(log.id) || 0)
              : (log.duration_minutes ? Math.max(0, log.duration_minutes) : 0);
            const finalMinutes = Math.max(0, grossMinutes - lunchMins);
            weekTotal += finalMinutes;

            rows.push([
              staff.name,
              staff.employee_number || '',
              clockIn.toISOString().split('T')[0],
              clockIn.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true }),
              clockOut ? clockOut.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: true }) : 'In Progress',
              rawMinutes > 0 ? formatHM(rawMinutes) : '-',
              breakMins > 0 ? `${breakMins}m` : '',
              lunchMins > 0 ? `${lunchMins}m` : '',
              finalMinutes > 0 ? formatHM(finalMinutes) : '-',
              '',
              '',
              log.notes || '',
            ]);
          });

          const weekOvertime = Math.max(0, weekTotal - 40 * 60);
          staffTotalHours += weekTotal;
          staffTotalOvertime += weekOvertime;
        });

        rows.push([`--- ${staff.name} TOTAL ---`, staff.employee_number || '', '', '', '', '', '', '', staffTotalHours > 0 ? formatHM(staffTotalHours) : '-', staffTotalOvertime > 0 ? formatHM(staffTotalOvertime) : '-', '', '']);
        rows.push(['', '', '', '', '', '', '', '', '', '', '', '']);
        grandTotalHours += staffTotalHours;
        grandTotalOvertime += staffTotalOvertime;
      });

      rows.push(['=== GRAND TOTAL ===', '', `${rangeStart} to ${rangeEnd}`, '', '', '', '', '', grandTotalHours > 0 ? formatHM(grandTotalHours) : '-', grandTotalOvertime > 0 ? formatHM(grandTotalOvertime) : '-', '', '']);

      const csv = rows.map((r, ri) => r.map((c, ci) => {
        if (ri > 0 && ci === 1 && c) return `="${c}"`;
        return `"${c}"`;
      }).join(',')).join('\n');
      const filename = `moja_timesheet_${rangeStart.replace(/-/g, '')}_to_${rangeEnd.replace(/-/g, '')}.csv`;
      downloadBlob(csv, filename);
    } finally {
      setRangeExporting(false);
    }
  }


  return (
    <div className="space-y-5">
      {/* Header + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-moja-blue">Payroll Summary</h2>
        <div className="flex items-center gap-3">
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-9 px-3 pr-8 text-sm font-bold text-moja-blue bg-white border-2 border-moja-blue/20 rounded-lg focus:border-moja-blue focus:outline-none appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%231B3A5C' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            {payPeriodOptions.map(pp => (
              <option key={pp.start} value={pp.start}>{pp.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowDateRange(!showDateRange)}
            className={`inline-flex items-center gap-2 px-4 h-9 border-2 rounded-lg text-sm font-bold transition-all ${
              showDateRange
                ? 'border-moja-aqua bg-moja-aqua/10 text-moja-aqua'
                : 'border-moja-blue/20 text-moja-blue hover:border-moja-aqua hover:text-moja-aqua'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Date Range Export Panel */}
      {showDateRange && (
        <div className="bg-white rounded-xl border-2 border-moja-aqua/30 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-moja-blue">Export Date Range Report</h3>
            <button onClick={() => setShowDateRange(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Start</label>
              <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="h-10 px-3 text-sm font-semibold text-gray-800 border-2 border-gray-200 rounded-lg focus:border-moja-aqua focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">End</label>
              <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="h-10 px-3 text-sm font-semibold text-gray-800 border-2 border-gray-200 rounded-lg focus:border-moja-aqua focus:outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Staff</label>
              <select value={rangeStaff} onChange={(e) => setRangeStaff(e.target.value)} className="h-10 px-3 text-sm font-semibold text-gray-800 border-2 border-gray-200 rounded-lg focus:border-moja-aqua focus:outline-none">
                <option value="">All Staff</option>
                {staffList.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={exportDateRangeCSV}
              disabled={rangeExporting || !rangeStart || !rangeEnd}
              className="inline-flex items-center gap-2 px-5 h-10 bg-moja-aqua text-white rounded-lg text-sm font-bold hover:bg-moja-aqua/90 transition-all disabled:opacity-50"
            >
              {rangeExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {rangeExporting ? 'Generating...' : 'Download'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-3 border-moja-orange border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Pay Period Total Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-gray-900">Pay period total</p>
              <p className="text-xs text-gray-400 mt-0.5">{formatDateShort(activePeriod.start)} - {formatDateShort(activePeriod.end)}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Total hours</p>
              <p className="text-2xl font-bold text-green-700">{formatHM(grandTotal)}</p>
            </div>
          </div>

          {employees.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
              <p className="text-lg font-bold text-gray-400">No timecards for this period</p>
              <p className="text-sm text-gray-300 mt-1">Send timecards from the Timecards tab first.</p>
            </div>
          ) : (
            employees.map(emp => (
              <div key={emp.staffId} className="bg-white rounded-xl border border-gray-200 p-5">
                {/* Employee Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <p className="text-lg font-bold text-gray-900">
                      {emp.employeeNumber && <span className="text-gray-400 font-mono text-sm mr-2">#{emp.employeeNumber}</span>}
                      {emp.staffName}
                    </p>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      emp.status === 'approved' ? 'bg-green-100 text-green-700' :
                      emp.status === 'employee_approved' ? 'bg-emerald-100 text-emerald-700' :
                      emp.status === 'has_notes' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {emp.status === 'approved' ? 'Approved' :
                       emp.status === 'employee_approved' ? 'Employee Approved' :
                       emp.status === 'has_notes' ? 'Has Notes' : 'Pending'}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Total hours</p>
                    <p className="text-xl font-bold text-gray-900">{formatHM(emp.periodTotal)}</p>
                  </div>
                </div>

                {/* Workweek Grids */}
                {emp.weeks.map((week, wi) => (
                  <div key={wi} className={`${wi > 0 ? 'mt-6 pt-6 border-t border-gray-100' : ''}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Workweek</p>
                        <p className="text-base font-bold text-gray-900">{formatDateShort(week.startDate)} - {formatDateShort(week.endDate)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-wide">Total</p>
                        <p className="text-lg font-bold text-gray-900">{formatHM(week.totalMinutes)}</p>
                      </div>
                    </div>

                    {/* Grid Table */}
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-xs min-w-[600px]">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left py-2.5 px-2 font-semibold text-gray-500 w-24">Hours</th>
                            {week.days.map(day => (
                              <th key={day.dateKey} className="text-center py-2.5 px-1 font-semibold text-gray-500 min-w-[70px]">
                                {day.dayName} {day.date.getMonth() + 1}/{day.date.getDate()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-gray-100">
                            <td className="py-3 px-2 font-medium text-gray-700">Regular</td>
                            {week.days.map(day => (
                              <td key={day.dateKey} className={`py-3 px-1 text-center font-medium ${day.regMinutes > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                                {day.regMinutes > 0 ? formatHM(day.regMinutes) : '0h 00m'}
                              </td>
                            ))}
                          </tr>
                          <tr className="border-b border-gray-100">
                            <td className="py-3 px-2 font-medium text-gray-700">Overtime</td>
                            {week.days.map(day => (
                              <td key={day.dateKey} className={`py-3 px-1 text-center font-medium ${day.otMinutes > 0 ? 'text-orange-600' : 'text-gray-300'}`}>
                                {day.otMinutes > 0 ? formatHM(day.otMinutes) : '0h 00m'}
                              </td>
                            ))}
                          </tr>
                          <tr className="border-t-2 border-gray-200">
                            <td className="py-3 px-2 font-bold text-green-700">Total</td>
                            {week.days.map(day => (
                              <td key={day.dateKey} className={`py-3 px-1 text-center font-bold ${day.netMinutes > 0 ? 'text-green-700' : 'text-gray-300'}`}>
                                {day.netMinutes > 0 ? formatHM(day.netMinutes) : '0h 00m'}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Period Summary */}
                <div className="mt-6 pt-4 border-t-2 border-gray-200 flex items-center justify-between">
                  <p className="font-bold text-gray-700">Period Total</p>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-gray-600">Reg: <span className="font-bold">{formatHM(emp.periodReg)}</span></span>
                    {emp.periodOT > 0 && <span className="text-orange-600">OT: <span className="font-bold">{formatHM(emp.periodOT)}</span></span>}
                    <span className="text-green-700 text-base font-bold">{formatHM(emp.periodTotal)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
