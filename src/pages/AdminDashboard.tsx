import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff, ClockLog } from '../lib/types';
import { Users, Clock, UserCheck, UserX, AlertTriangle, LogOut } from 'lucide-react';
import { Toast } from '../components/Toast';

function ElapsedTimer({ clockInTime }: { clockInTime: string }) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    function update() {
      const diff = Date.now() - new Date(clockInTime).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setElapsed(`${h}h ${m}m`);
    }
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [clockInTime]);

  return <span className="text-sm font-mono font-bold text-moja-blue/60">{elapsed}</span>;
}

export function AdminDashboard() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [recentLogs, setRecentLogs] = useState<(ClockLog & { staff: { name: string } })[]>([]);
  const [openLogs, setOpenLogs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [forceClockingOut, setForceClockingOut] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [maxShiftHours, setMaxShiftHours] = useState(12);

  const loadData = useCallback(async () => {
    const [staffRes, logsRes, settingsRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase
        .from('clock_logs')
        .select('*, staff(name)')
        .order('clock_in_time', { ascending: false })
        .limit(20),
      supabase
        .from('app_settings')
        .select('key, value')
        .eq('key', 'max_shift_hours')
        .maybeSingle(),
    ]);

    if (staffRes.data) setStaffList(staffRes.data);
    if (logsRes.data) {
      setRecentLogs(logsRes.data as (ClockLog & { staff: { name: string } })[]);
      const map = new Map<string, string>();
      logsRes.data.forEach((log: ClockLog) => {
        if (!log.clock_out_time) {
          map.set(log.staff_id, log.clock_in_time);
        }
      });
      setOpenLogs(map);
    }
    if (settingsRes.data) {
      setMaxShiftHours(Number(settingsRes.data.value) || 12);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscription
  useEffect(() => {
    const staffChannel = supabase
      .channel('dashboard-staff')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff' },
        () => { loadData(); }
      )
      .subscribe();

    const logsChannel = supabase
      .channel('dashboard-logs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clock_logs' },
        () => { loadData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(staffChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [loadData]);

  async function handleForceClockOutAll() {
    setForceClockingOut(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setToast({ message: 'Not authenticated', type: 'error' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/force-clock-out-all`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reason: 'End of day force clock out' }),
        }
      );

      const result = response.ok ? await response.json() : { success: false };
      if (result.success) {
        setToast({ message: result.message, type: 'success' });
        loadData();
      } else {
        setToast({ message: result.message || 'Failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setForceClockingOut(false);
    }
  }

  const clockedIn = staffList.filter(s => s.is_clocked_in && s.is_active);
  const clockedOut = staffList.filter(s => !s.is_clocked_in && s.is_active);

  function isLongShift(staffId: string): boolean {
    const clockIn = openLogs.get(staffId);
    if (!clockIn) return false;
    const hours = (Date.now() - new Date(clockIn).getTime()) / 3600000;
    return hours >= maxShiftHours;
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-moja-blue/10 rounded-xl flex items-center justify-center">
              <Users className="w-7 h-7 text-moja-blue" />
            </div>
            <div>
              <div className="text-3xl font-bold text-moja-blue">{staffList.filter(s => s.is_active).length}</div>
              <div className="text-sm font-semibold text-moja-blue/50">Total Staff</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-green-50 rounded-xl flex items-center justify-center">
              <UserCheck className="w-7 h-7 text-green-600" />
            </div>
            <div>
              <div className="text-3xl font-bold text-green-700">{clockedIn.length}</div>
              <div className="text-sm font-semibold text-moja-blue/50">Clocked In</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center">
              <UserX className="w-7 h-7 text-gray-500" />
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-600">{clockedOut.length}</div>
              <div className="text-sm font-semibold text-moja-blue/50">Clocked Out</div>
            </div>
          </div>
        </div>
      </div>

      {/* Currently Clocked In */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-moja-aqua" />
            <h2 className="text-lg font-bold text-moja-blue">Currently Clocked In</h2>
            <span className="text-xs font-bold text-moja-aqua/70 bg-moja-aqua/10 px-2 py-1 rounded-full">Live</span>
          </div>
          {clockedIn.length > 0 && (
            <button
              onClick={handleForceClockOutAll}
              disabled={forceClockingOut}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {forceClockingOut ? 'Processing...' : 'Force Clock Out All'}
            </button>
          )}
        </div>
        {clockedIn.length === 0 ? (
          <div className="p-6 text-center text-moja-blue/40 font-semibold">No staff currently clocked in</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {clockedIn.map(staff => {
              const longShift = isLongShift(staff.id);
              return (
                <div key={staff.id} className={`px-6 py-4 flex items-center justify-between ${longShift ? 'bg-red-50/50' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${staff.is_on_break ? 'bg-amber-400' : 'bg-green-500 animate-pulse'}`} />
                    <span className="text-lg font-semibold text-moja-blue">{staff.name}</span>
                    {staff.is_on_break && (
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">On Break</span>
                    )}
                    {longShift && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                        <AlertTriangle className="w-3 h-3" />
                        Long Shift
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {openLogs.has(staff.id) && (
                      <ElapsedTimer clockInTime={openLogs.get(staff.id)!} />
                    )}
                    <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                      Active
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-moja-blue">Recent Activity</h2>
        </div>
        {recentLogs.length === 0 ? (
          <div className="p-6 text-center text-moja-blue/40 font-semibold">No recent activity</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentLogs.map(log => (
              <div key={log.id} className={`px-6 py-3 flex items-center justify-between ${log.flagged ? 'bg-red-50/30' : ''}`}>
                <div>
                  <span className="font-bold text-moja-blue">{log.staff?.name}</span>
                  <span className="text-moja-blue/30 mx-2">-</span>
                  <span className="text-sm font-semibold text-moja-blue/60">
                    In: {new Date(log.clock_in_time).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {log.clock_out_time && (
                    <span className="text-sm font-semibold text-moja-blue/60">
                      {' | Out: '}{new Date(log.clock_out_time).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {log.notes && (
                    <span className="text-xs text-moja-blue/40 ml-2 italic">{log.notes}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {log.flagged && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  {log.duration_minutes != null && (
                    <span className="text-sm font-bold text-moja-blue/50 font-mono">
                      {Math.floor(log.duration_minutes / 60)}h {Math.round(log.duration_minutes % 60)}m
                    </span>
                  )}
                  {!log.clock_out_time && (
                    <span className="text-xs font-bold text-moja-aqua bg-moja-aqua/10 px-2 py-1 rounded-full">
                      In Progress
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
