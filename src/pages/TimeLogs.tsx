import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Staff, ClockLog } from '../lib/types';
import { Edit3, Plus, Trash2, X, History } from 'lucide-react';
import { Toast } from '../components/Toast';

export function TimeLogs() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [logs, setLogs] = useState<(ClockLog & { staff: { name: string } })[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modal state
  const [editLog, setEditLog] = useState<ClockLog | null>(null);
  const [addingLog, setAddingLog] = useState(false);
  const [deleteLog, setDeleteLog] = useState<ClockLog | null>(null);

  // Form state
  const [editForm, setEditForm] = useState({ clock_in_time: '', clock_out_time: '', reason: '' });
  const [addForm, setAddForm] = useState({ staff_id: '', clock_in_time: '', clock_out_time: '', reason: '' });
  const [deleteReason, setDeleteReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
        .limit(50),
    ]);

    if (staffRes.data) setStaffList(staffRes.data);
    if (logsRes.data) setLogs(logsRes.data as (ClockLog & { staff: { name: string } })[]);
    setLoading(false);
  }

  function openEdit(log: ClockLog) {
    setEditLog(log);
    setEditForm({
      clock_in_time: log.clock_in_time.slice(0, 16),
      clock_out_time: log.clock_out_time?.slice(0, 16) || '',
      reason: '',
    });
  }

  async function submitEdit() {
    if (!editLog || !editForm.reason.trim()) {
      setToast({ message: 'Reason is required', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/edit-log`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            log_id: editLog.id,
            clock_in_time: editForm.clock_in_time ? new Date(editForm.clock_in_time).toISOString() : undefined,
            clock_out_time: editForm.clock_out_time ? new Date(editForm.clock_out_time).toISOString() : undefined,
            reason: editForm.reason,
          }),
        }
      );

      const result = response.ok ? await response.json() : { success: false };
      if (result.success) {
        setToast({ message: 'Log entry updated', type: 'success' });
        setEditLog(null);
        loadData();
      } else {
        setToast({ message: result.message || 'Update failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAdd() {
    if (!addForm.staff_id || !addForm.clock_in_time || !addForm.reason.trim()) {
      setToast({ message: 'Staff, clock-in time, and reason are required', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/add-log`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            staff_id: addForm.staff_id,
            clock_in_time: new Date(addForm.clock_in_time).toISOString(),
            clock_out_time: addForm.clock_out_time ? new Date(addForm.clock_out_time).toISOString() : null,
            reason: addForm.reason,
          }),
        }
      );

      const result = response.ok ? await response.json() : { success: false };
      if (result.success) {
        setToast({ message: 'Log entry added', type: 'success' });
        setAddingLog(false);
        setAddForm({ staff_id: '', clock_in_time: '', clock_out_time: '', reason: '' });
        loadData();
      } else {
        setToast({ message: result.message || 'Add failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDelete() {
    if (!deleteLog || !deleteReason.trim()) {
      setToast({ message: 'Reason is required', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/delete-log`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ log_id: deleteLog.id, reason: deleteReason }),
        }
      );

      const result = response.ok ? await response.json() : { success: false };
      if (result.success) {
        setToast({ message: 'Log entry deleted', type: 'success' });
        setDeleteLog(null);
        setDeleteReason('');
        loadData();
      } else {
        setToast({ message: result.message || 'Delete failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-moja-blue">Time Logs</h2>
        <button
          onClick={() => setAddingLog(true)}
          className="inline-flex items-center gap-2 px-5 py-3 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all touch-manipulation"
        >
          <Plus className="w-5 h-5" />
          Add Entry
        </button>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-moja-blue">
                <th className="text-left px-4 py-3 text-sm font-bold text-white">Staff</th>
                <th className="text-left px-4 py-3 text-sm font-bold text-white">Date</th>
                <th className="text-left px-4 py-3 text-sm font-bold text-white">Clock In</th>
                <th className="text-left px-4 py-3 text-sm font-bold text-white">Clock Out</th>
                <th className="text-center px-4 py-3 text-sm font-bold text-white">Duration</th>
                <th className="text-left px-4 py-3 text-sm font-bold text-white">Notes</th>
                <th className="text-right px-4 py-3 text-sm font-bold text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log, idx) => (
                <tr key={log.id} className={`${idx % 2 === 1 ? 'bg-gray-50/50' : ''} ${log.flagged ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3 font-bold text-moja-blue text-sm">{log.staff?.name}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-moja-blue/70">
                    {new Date(log.clock_in_time).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-moja-blue/70 font-mono">
                    {new Date(log.clock_in_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-moja-blue/70 font-mono">
                    {log.clock_out_time
                      ? (() => {
                          const inDate = new Date(log.clock_in_time).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
                          const outDate = new Date(log.clock_out_time).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
                          const outTime = new Date(log.clock_out_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
                          if (inDate !== outDate) {
                            const outShort = new Date(log.clock_out_time).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
                            return <span>{outShort} {outTime}</span>;
                          }
                          return outTime;
                        })()
                      : <span className="text-moja-aqua font-bold">Active</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-bold text-moja-blue/60 font-mono">
                    {log.duration_minutes != null
                      ? (log.duration_minutes / 60).toFixed(2)
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-3 text-xs text-moja-blue/40 max-w-[200px]" title={log.notes || ''}>
                    {log.notes ? <span className="whitespace-pre-line line-clamp-2">{log.notes}</span> : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(log)}
                        className="p-2 text-moja-blue/40 hover:text-moja-orange hover:bg-moja-orange/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteLog(log)}
                        className="p-2 text-moja-blue/40 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-moja-blue">Edit Time Entry</h3>
              <button onClick={() => setEditLog(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-moja-blue/40" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Clock In Time</label>
              <input
                type="datetime-local"
                value={editForm.clock_in_time}
                onChange={(e) => setEditForm(f => ({ ...f, clock_in_time: e.target.value }))}
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Clock Out Time</label>
              <input
                type="datetime-local"
                value={editForm.clock_out_time}
                onChange={(e) => setEditForm(f => ({ ...f, clock_out_time: e.target.value }))}
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Reason for Change *</label>
              <input
                type="text"
                value={editForm.reason}
                onChange={(e) => setEditForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g., Forgot to clock out, correcting time"
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
                required
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditLog(null)} className="flex-1 h-12 border-2 border-moja-blue/20 rounded-xl font-bold text-moja-blue/60 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={submitting || !editForm.reason.trim()}
                className="flex-1 h-12 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 transition-colors disabled:opacity-40"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {addingLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-moja-blue">Add Time Entry</h3>
              <button onClick={() => setAddingLog(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-moja-blue/40" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Staff Member *</label>
              <select
                value={addForm.staff_id}
                onChange={(e) => setAddForm(f => ({ ...f, staff_id: e.target.value }))}
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              >
                <option value="">Select staff...</option>
                {staffList.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Clock In Time *</label>
              <input
                type="datetime-local"
                value={addForm.clock_in_time}
                onChange={(e) => setAddForm(f => ({ ...f, clock_in_time: e.target.value }))}
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Clock Out Time</label>
              <input
                type="datetime-local"
                value={addForm.clock_out_time}
                onChange={(e) => setAddForm(f => ({ ...f, clock_out_time: e.target.value }))}
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Reason *</label>
              <input
                type="text"
                value={addForm.reason}
                onChange={(e) => setAddForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g., Missed punch, system error"
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setAddingLog(false)} className="flex-1 h-12 border-2 border-moja-blue/20 rounded-xl font-bold text-moja-blue/60 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={submitAdd}
                disabled={submitting || !addForm.staff_id || !addForm.clock_in_time || !addForm.reason.trim()}
                className="flex-1 h-12 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 transition-colors disabled:opacity-40"
              >
                {submitting ? 'Adding...' : 'Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-red-600">Delete Time Entry</h3>
              <button onClick={() => { setDeleteLog(null); setDeleteReason(''); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-moja-blue/40" />
              </button>
            </div>
            <p className="text-sm text-moja-blue/70 font-semibold">
              Are you sure you want to delete this entry for <span className="font-bold">{deleteLog.staff?.name}</span> on {new Date(deleteLog.clock_in_time).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}?
            </p>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Reason for Deletion *</label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g., Duplicate entry, entered in error"
                className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-red-200 rounded-xl focus:border-red-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setDeleteLog(null); setDeleteReason(''); }} className="flex-1 h-12 border-2 border-moja-blue/20 rounded-xl font-bold text-moja-blue/60 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={submitDelete}
                disabled={submitting || !deleteReason.trim()}
                className="flex-1 h-12 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {submitting ? 'Deleting...' : 'Delete Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
