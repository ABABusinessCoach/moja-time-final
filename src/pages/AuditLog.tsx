import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { AuditLogEntry } from '../lib/types';
import { History, Edit3, Plus, Trash2, LogOut } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string; icon: typeof Edit3 }> = {
  manual_edit: { label: 'Edited', color: 'bg-blue-50 text-blue-700', icon: Edit3 },
  manual_add: { label: 'Added', color: 'bg-green-50 text-green-700', icon: Plus },
  manual_delete: { label: 'Deleted', color: 'bg-red-50 text-red-700', icon: Trash2 },
  force_clock_out: { label: 'Force Clock Out', color: 'bg-amber-50 text-amber-700', icon: LogOut },
};

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/audit-log`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) return;

      const result = await response.json();
      if (result.success) {
        setLogs(result.logs);
      }
    } catch {
      // Network error — leave logs empty
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <History className="w-6 h-6 text-moja-blue" />
        <h2 className="text-2xl font-bold text-moja-blue">Audit Log</h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-moja-blue/40 font-semibold">No audit entries yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map(log => {
              const actionConfig = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-50 text-gray-700', icon: Edit3 };
              const Icon = actionConfig.icon;

              return (
                <div key={log.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full ${actionConfig.color}`}>
                        <Icon className="w-3 h-3" />
                        {actionConfig.label}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-moja-blue">
                          {log.staff?.name || 'Unknown staff'}
                        </p>
                        <p className="text-xs font-semibold text-moja-blue/50 mt-0.5">
                          By {log.admins?.name || 'Admin'} - {log.reason}
                        </p>
                        {log.old_values && log.action === 'manual_edit' && (
                          <div className="mt-2 text-xs font-mono text-moja-blue/40 bg-gray-50 rounded-lg p-2 max-w-md">
                            <span className="text-red-500">- </span>
                            In: {log.old_values.clock_in_time ? new Date(log.old_values.clock_in_time as string).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?'}
                            {log.old_values.clock_out_time && (
                              <> | Out: {new Date(log.old_values.clock_out_time as string).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}</>
                            )}
                            <br />
                            <span className="text-green-500">+ </span>
                            {log.new_values?.clock_in_time && <>In: {new Date(log.new_values.clock_in_time as string).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}
                            {log.new_values?.clock_out_time && <> | Out: {new Date(log.new_values.clock_out_time as string).toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}</>}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-moja-blue/30 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
