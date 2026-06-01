import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff, ClockLog } from '../lib/types';
import { Download, Calendar, ArrowUpDown, BarChart3, CalendarRange, X, Loader2 } from 'lucide-react';

function getWeekDates(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMon);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function HoursBarChart({ data }: { data: { name: string; hours: number }[] }) {
  const maxHours = Math.max(...data.map(d => d.hours), 1);

  return (
    <div className="flex items-end gap-2 h-40 px-2">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-bold text-moja-blue/50 font-mono">
            {d.hours > 0 ? d.hours.toFixed(1) : ''}
          </span>
          <div
            className="w-full rounded-t-md bg-moja-aqua/70 transition-all duration-500 min-h-[2px]"
            style={{ height: `${(d.hours / maxHours) * 100}%` }}
          />
          <span className="text-xs font-bold text-moja-blue/40">{d.name}</span>
        </div>
      ))}
    </div>
  );
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
  const [weekOf, setWeekOf] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diff);
    return formatDate(mon);
  });
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [logs, setLogs] = useState<ClockLog[]>([]);
  const [filterStaff, setFilterStaff] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  // Date range export state
  const [showDateRange, setShowDateRange] = useState(false);
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return formatDate(d);
  });
  const [rangeEnd, setRangeEnd] = useState(() => formatDate(new Date()));
  const [rangeStaff, setRangeStaff] = useState('');
  const [rangeExporting, setRangeExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, [weekOf]);

  useEffect(() => {
    const channel = supabase
      .channel('reports-clock-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clock_logs' },
        () => { loadData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [weekOf]);

  async function loadData() {
    setLoading(true);
    const weekStart = new Date(weekOf);
    const { end } = getWeekDates(weekStart);

    const [staffRes, logsRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase
        .from('clock_logs')
        .select('*')
        .gte('clock_in_time', weekStart.toISOString())
        .lte('clock_in_time', end.toISOString())
        .order('clock_in_time'),
    ]);

    if (staffRes.data) setStaffList(staffRes.data);
    if (logsRes.data) setLogs(logsRes.data);
    setLoading(false);
  }

  function getStaffWeekData() {
    let filtered = staffList.filter(s => s.is_active || logs.some(l => l.staff_id === s.id));
    if (filterStaff) filtered = filtered.filter(s => s.id === filterStaff);

    const data = filtered.map(staff => {
      const staffLogs = logs.filter(l => l.staff_id === staff.id);
      const dailyHours = [0, 0, 0, 0, 0, 0, 0];

      staffLogs.forEach(log => {
        if (!log.duration_minutes) return;
        const logDate = new Date(log.clock_in_time);
        let dayIndex = logDate.getDay() - 1;
        if (dayIndex < 0) dayIndex = 6;
        dailyHours[dayIndex] += log.duration_minutes / 60;
      });

      const totalHours = dailyHours.reduce((a, b) => a + b, 0);
      const overtime = Math.max(0, totalHours - 40);
      const regularHours = totalHours - overtime;

      return { staff, dailyHours, totalHours, overtime, regularHours };
    });

    data.sort((a, b) => {
      const cmp = a.staff.name.localeCompare(b.staff.name);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return data;
  }

  function exportCSV() {
    const weekStart = new Date(weekOf);
    const { end } = getWeekDates(weekStart);
    const weekEndingStr = formatDate(end);

    const rows: string[][] = [
      ['Employee Name', 'Date', 'Clock In', 'Clock Out', 'Regular Hours', 'Overtime Hours', 'Break Time (min)', 'Net Hours', 'Week Ending'],
    ];

    let filteredLogs = logs;
    if (filterStaff) filteredLogs = logs.filter(l => l.staff_id === filterStaff);

    const staffTotals = new Map<string, number>();

    filteredLogs.forEach(log => {
      const staff = staffList.find(s => s.id === log.staff_id);
      if (!staff) return;

      const currentTotal = staffTotals.get(staff.id) || 0;
      const hoursWorked = log.duration_minutes ? log.duration_minutes / 60 : 0;
      const newTotal = currentTotal + hoursWorked;
      staffTotals.set(staff.id, newTotal);

      const clockIn = new Date(log.clock_in_time);
      const clockOut = log.clock_out_time ? new Date(log.clock_out_time) : null;

      let regularHrs = hoursWorked;
      let overtimeHrs = 0;

      if (newTotal > 40) {
        const overAmount = newTotal - 40;
        if (overAmount >= hoursWorked) {
          overtimeHrs = hoursWorked;
          regularHrs = 0;
        } else {
          overtimeHrs = overAmount;
          regularHrs = hoursWorked - overAmount;
        }
      }

      rows.push([
        staff.name,
        formatDate(clockIn),
        clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        clockOut ? clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '',
        regularHrs.toFixed(2),
        overtimeHrs.toFixed(2),
        '0',
        hoursWorked.toFixed(2),
        weekEndingStr,
      ]);
    });

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    downloadBlob(csv, `moja_timesheet_week_${weekOf.replace(/-/g, '')}.csv`);
  }

  async function exportDateRangeCSV() {
    if (!rangeStart || !rangeEnd) return;
    setRangeExporting(true);

    try {
      const startDate = new Date(rangeStart);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(rangeEnd);
      endDate.setHours(23, 59, 59, 999);

      const [staffRes, logsRes] = await Promise.all([
        supabase.from('staff').select('*').order('name'),
        supabase
          .from('clock_logs')
          .select('*')
          .gte('clock_in_time', startDate.toISOString())
          .lte('clock_in_time', endDate.toISOString())
          .order('clock_in_time'),
      ]);

      const allStaff: Staff[] = staffRes.data || [];
      let rangeLogs: ClockLog[] = logsRes.data || [];

      if (rangeStaff) {
        rangeLogs = rangeLogs.filter(l => l.staff_id === rangeStaff);
      }

      // Group logs by staff, then by week
      const staffMap = new Map<string, { staff: Staff; logs: ClockLog[] }>();
      rangeLogs.forEach(log => {
        const staff = allStaff.find(s => s.id === log.staff_id);
        if (!staff) return;
        if (!staffMap.has(staff.id)) {
          staffMap.set(staff.id, { staff, logs: [] });
        }
        staffMap.get(staff.id)!.logs.push(log);
      });

      const rows: string[][] = [
        ['Employee Name', 'Date', 'Clock In', 'Clock Out', 'Hours Worked', 'Overtime', 'Week Ending', 'Notes'],
      ];

      let grandTotalHours = 0;
      let grandTotalOvertime = 0;

      // Sort staff alphabetically
      const sortedStaff = Array.from(staffMap.values()).sort((a, b) =>
        a.staff.name.localeCompare(b.staff.name)
      );

      sortedStaff.forEach(({ staff, logs: staffLogs }) => {
        // Group by week for overtime calculation
        const weekGroups = new Map<string, ClockLog[]>();
        staffLogs.forEach(log => {
          const { start } = getWeekDates(new Date(log.clock_in_time));
          const weekKey = formatDate(start);
          if (!weekGroups.has(weekKey)) weekGroups.set(weekKey, []);
          weekGroups.get(weekKey)!.push(log);
        });

        let staffTotalHours = 0;
        let staffTotalOvertime = 0;

        // Sort weeks chronologically
        const sortedWeeks = Array.from(weekGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        sortedWeeks.forEach(([, weekLogs]) => {
          let weekTotal = 0;
          weekLogs.forEach(log => {
            const hoursWorked = log.duration_minutes ? log.duration_minutes / 60 : 0;
            weekTotal += hoursWorked;
            const clockIn = new Date(log.clock_in_time);
            const clockOut = log.clock_out_time ? new Date(log.clock_out_time) : null;
            const { end: weekEnd } = getWeekDates(clockIn);

            rows.push([
              staff.name,
              formatDate(clockIn),
              clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
              clockOut ? clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : 'In Progress',
              hoursWorked.toFixed(2),
              '',
              formatDate(weekEnd),
              log.notes || '',
            ]);
          });

          const weekOvertime = Math.max(0, weekTotal - 40);
          staffTotalHours += weekTotal;
          staffTotalOvertime += weekOvertime;

          // Mark overtime on last entry of the week
          if (weekOvertime > 0 && weekLogs.length > 0) {
            rows[rows.length - 1][5] = weekOvertime.toFixed(2);
          }
        });

        // Staff subtotal row
        rows.push([
          `--- ${staff.name} TOTAL ---`,
          '',
          '',
          '',
          staffTotalHours.toFixed(2),
          staffTotalOvertime.toFixed(2),
          '',
          '',
        ]);
        rows.push(['', '', '', '', '', '', '', '']);

        grandTotalHours += staffTotalHours;
        grandTotalOvertime += staffTotalOvertime;
      });

      // Grand total
      rows.push([
        '=== GRAND TOTAL ===',
        `${rangeStart} to ${rangeEnd}`,
        '',
        '',
        grandTotalHours.toFixed(2),
        grandTotalOvertime.toFixed(2),
        '',
        '',
      ]);

      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const filename = `moja_timesheet_${rangeStart.replace(/-/g, '')}_to_${rangeEnd.replace(/-/g, '')}.csv`;
      downloadBlob(csv, filename);
    } finally {
      setRangeExporting(false);
    }
  }

  const weekData = getStaffWeekData();
  const weekStart = new Date(weekOf);
  const { end: weekEnd } = getWeekDates(weekStart);

  const dailyTotals = DAY_NAMES.map((name, i) => ({
    name,
    hours: weekData.reduce((sum, d) => sum + d.dailyHours[i], 0),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-moja-blue">Weekly Time Report</h2>
        <p className="text-sm font-semibold text-moja-blue/50 mt-1">
          Week of {weekStart.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} - {weekEnd.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-moja-blue/50" />
          <input
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
            className="h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
          />
        </div>
        <select
          value={filterStaff}
          onChange={(e) => setFilterStaff(e.target.value)}
          className="h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
        >
          <option value="">All Staff</option>
          {staffList.filter(s => s.is_active).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={() => setViewMode(v => v === 'table' ? 'chart' : 'table')}
          className="h-12 px-4 inline-flex items-center gap-2 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl hover:border-moja-aqua hover:text-moja-aqua transition-colors"
        >
          <BarChart3 className="w-4 h-4" />
          {viewMode === 'table' ? 'Chart' : 'Table'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowDateRange(!showDateRange)}
            className={`inline-flex items-center gap-2 px-5 h-12 border-2 rounded-xl font-bold active:scale-[0.98] transition-all touch-manipulation ${
              showDateRange
                ? 'border-moja-aqua bg-moja-aqua/10 text-moja-aqua'
                : 'border-moja-blue/20 text-moja-blue hover:border-moja-aqua hover:text-moja-aqua'
            }`}
          >
            <CalendarRange className="w-5 h-5" />
            Date Range
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-6 h-12 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all touch-manipulation"
          >
            <Download className="w-5 h-5" />
            Export Week
          </button>
        </div>
      </div>

      {/* Date Range Export Panel */}
      {showDateRange && (
        <div className="bg-white rounded-xl border-2 border-moja-aqua/30 p-6 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-moja-blue">Download Date Range Report</h3>
            <button
              onClick={() => setShowDateRange(false)}
              className="p-2 rounded-lg text-moja-blue/40 hover:text-moja-blue hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-moja-blue/60 uppercase tracking-wide">Start Date</label>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                className="h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-aqua focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-moja-blue/60 uppercase tracking-wide">End Date</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-aqua focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-moja-blue/60 uppercase tracking-wide">Staff Member</label>
              <select
                value={rangeStaff}
                onChange={(e) => setRangeStaff(e.target.value)}
                className="h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-aqua focus:outline-none"
              >
                <option value="">All Staff</option>
                {staffList.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={exportDateRangeCSV}
              disabled={rangeExporting || !rangeStart || !rangeEnd}
              className="inline-flex items-center gap-2 px-6 h-12 bg-moja-aqua text-white rounded-xl font-bold hover:bg-moja-aqua/90 active:scale-[0.98] transition-all touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rangeExporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              {rangeExporting ? 'Generating...' : 'Download CSV'}
            </button>
          </div>
          <p className="text-xs text-moja-blue/40 mt-3 font-medium">
            Report includes per-employee entries grouped by week with overtime calculations and subtotals.
          </p>
        </div>
      )}

      {/* Chart View */}
      {viewMode === 'chart' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-moja-blue/60 mb-4 uppercase tracking-wide">Daily Hours (All Staff)</h3>
          <HoursBarChart data={dailyTotals} />

          {weekData.length > 1 && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-bold text-moja-blue/60 mb-4 uppercase tracking-wide">By Staff Member</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {weekData.filter(d => d.totalHours > 0).map(d => (
                  <div key={d.staff.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-moja-blue">{d.staff.name}</span>
                      <span className="text-sm font-bold text-moja-blue font-mono">{d.totalHours.toFixed(1)}h</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${d.overtime > 0 ? 'bg-moja-orange' : 'bg-moja-aqua'}`}
                        style={{ width: `${Math.min(100, (d.totalHours / 40) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-moja-blue border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-moja-blue">
                    <th className="text-left px-4 py-4 text-sm font-bold text-white">
                      <button
                        onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                        className="inline-flex items-center gap-1 hover:text-moja-aqua transition-colors"
                      >
                        Staff Name
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    {DAY_NAMES.map(day => (
                      <th key={day} className="text-center px-3 py-4 text-sm font-bold text-white">{day}</th>
                    ))}
                    <th className="text-center px-3 py-4 text-sm font-bold text-white">Reg</th>
                    <th className="text-center px-3 py-4 text-sm font-bold text-white">OT</th>
                    <th className="text-center px-3 py-4 text-sm font-bold text-white">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {weekData.map(({ staff, dailyHours, totalHours, overtime, regularHours }, idx) => (
                    <tr key={staff.id} className={idx % 2 === 1 ? 'bg-gray-50/50' : ''}>
                      <td className="px-4 py-3 font-bold text-moja-blue">{staff.name}</td>
                      {dailyHours.map((h, i) => (
                        <td key={i} className="text-center px-3 py-3 text-sm font-semibold text-moja-blue/70 font-mono">
                          {h > 0 ? h.toFixed(1) : '-'}
                        </td>
                      ))}
                      <td className="text-center px-3 py-3 font-bold text-moja-blue font-mono">
                        {regularHours.toFixed(1)}
                      </td>
                      <td className={`text-center px-3 py-3 font-bold font-mono ${overtime > 0 ? 'text-moja-orange bg-moja-orange/10' : 'text-moja-blue/30'}`}>
                        {overtime > 0 ? overtime.toFixed(1) : '-'}
                      </td>
                      <td className="text-center px-3 py-3 font-bold text-moja-blue font-mono bg-moja-blue/5">
                        {totalHours.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {weekData.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-moja-blue/40 font-semibold">
                        No data for this week
                      </td>
                    </tr>
                  )}
                  {weekData.length > 0 && (
                    <tr className="bg-moja-blue/5 font-bold">
                      <td className="px-4 py-3 text-moja-blue">Totals</td>
                      {DAY_NAMES.map((_, i) => (
                        <td key={i} className="text-center px-3 py-3 text-sm text-moja-blue font-mono">
                          {weekData.reduce((s, d) => s + d.dailyHours[i], 0).toFixed(1)}
                        </td>
                      ))}
                      <td className="text-center px-3 py-3 text-moja-blue font-mono">
                        {weekData.reduce((s, d) => s + d.regularHours, 0).toFixed(1)}
                      </td>
                      <td className="text-center px-3 py-3 text-moja-orange font-mono">
                        {weekData.reduce((s, d) => s + d.overtime, 0).toFixed(1)}
                      </td>
                      <td className="text-center px-3 py-3 text-moja-blue font-mono">
                        {weekData.reduce((s, d) => s + d.totalHours, 0).toFixed(1)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
