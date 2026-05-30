import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff, ClockLog } from '../lib/types';
import { Users, Clock, UserCheck, UserX } from 'lucide-react';

export function AdminDashboard() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [recentLogs, setRecentLogs] = useState<(ClockLog & { staff: { name: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [staffRes, logsRes] = await Promise.all([
      supabase.from('staff').select('*').order('name'),
      supabase
        .from('clock_logs')
        .select('*, staff(name)')
        .order('clock_in_time', { ascending: false })
        .limit(10),
    ]);

    if (staffRes.data) setStaffList(staffRes.data);
    if (logsRes.data) setRecentLogs(logsRes.data as (ClockLog & { staff: { name: string } })[]);
    setLoading(false);
  }

  const clockedIn = staffList.filter(s => s.is_clocked_in && s.is_active);
  const clockedOut = staffList.filter(s => !s.is_clocked_in && s.is_active);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-moja-blue border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
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
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <Clock className="w-5 h-5 text-moja-aqua" />
          <h2 className="text-lg font-bold text-moja-blue">Currently Clocked In</h2>
        </div>
        {clockedIn.length === 0 ? (
          <div className="p-6 text-center text-moja-blue/40 font-semibold">No staff currently clocked in</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {clockedIn.map(staff => (
              <div key={staff.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-lg font-semibold text-moja-blue">{staff.name}</span>
                </div>
                <span className="text-sm font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                  Active
                </span>
              </div>
            ))}
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
              <div key={log.id} className="px-6 py-3 flex items-center justify-between">
                <div>
                  <span className="font-bold text-moja-blue">{log.staff?.name}</span>
                  <span className="text-moja-blue/30 mx-2">-</span>
                  <span className="text-sm font-semibold text-moja-blue/60">
                    In: {new Date(log.clock_in_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {log.clock_out_time && (
                    <span className="text-sm font-semibold text-moja-blue/60">
                      {' | Out: '}{new Date(log.clock_out_time).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
