import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff, ClockLog } from '../lib/types';
import { Download, Calendar, ArrowUpDown } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
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

      return { staff, dailyHours, totalHours, overtime };
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
      ['Employee Name', 'Date', 'Clock In Time', 'Clock Out Time', 'Hours Worked', 'Week Ending'],
    ];

    let filteredLogs = logs;
    if (filterStaff) filteredLogs = logs.filter(l => l.staff_id === filterStaff);

    filteredLogs.forEach(log => {
      const staff = staffList.find(s => s.id === log.staff_id);
      if (!staff) return;

      const clockIn = new Date(log.clock_in_time);
      const clockOut = log.clock_out_time ? new Date(log.clock_out_time) : null;
      const hours = log.duration_minutes ? (log.duration_minutes / 60).toFixed(2) : '';

      rows.push([
        staff.name,
        formatDate(clockIn),
        clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
        clockOut ? clockOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '',
        hours,
        weekEndingStr,
      ]);
    });

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moja_timesheet_week_${weekOf.replace(/-/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const weekData = getStaffWeekData();
  const weekStart = new Date(weekOf);
  const { end: weekEnd } = getWeekDates(weekStart);

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
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-moja-blue/50" />
          <input
            type="date"
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
            className="h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
          />
        </div>
        <div>
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
        </div>
        <button
          onClick={exportCSV}
          className="ml-auto inline-flex items-center gap-2 px-6 h-14 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all touch-manipulation min-h-[70px]"
        >
          <Download className="w-5 h-5" />
          Download CSV for Viventium
        </button>
      </div>

      {/* Report Table */}
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
                  <th className="text-center px-3 py-4 text-sm font-bold text-white">Total</th>
                  <th className="text-center px-3 py-4 text-sm font-bold text-white">OT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weekData.map(({ staff, dailyHours, totalHours, overtime }, idx) => (
                  <tr key={staff.id} className={idx % 2 === 1 ? 'bg-gray-50/50' : ''}>
                    <td className="px-4 py-3 font-bold text-moja-blue">{staff.name}</td>
                    {dailyHours.map((h, i) => (
                      <td key={i} className="text-center px-3 py-3 text-sm font-semibold text-moja-blue/70 font-mono">
                        {h > 0 ? h.toFixed(1) : '-'}
                      </td>
                    ))}
                    <td className="text-center px-3 py-3 font-bold text-moja-blue font-mono">
                      {totalHours.toFixed(1)}
                    </td>
                    <td className={`text-center px-3 py-3 font-bold font-mono ${overtime > 0 ? 'text-moja-blue bg-moja-yellow/30' : 'text-moja-blue/30'}`}>
                      {overtime > 0 ? overtime.toFixed(1) : '-'}
                    </td>
                  </tr>
                ))}
                {weekData.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-moja-blue/40 font-semibold">
                      No data for this week
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
