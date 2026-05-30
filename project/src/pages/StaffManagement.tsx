import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { callEdgeFunction } from '../lib/supabase';
import type { Staff } from '../lib/types';
import { UserPlus, Edit3, Power, KeyRound, X } from 'lucide-react';
import { Toast } from '../components/Toast';

export function StaffManagement() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [resetPinStaff, setResetPinStaff] = useState<Staff | null>(null);
  const [newPin, setNewPin] = useState('');
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadStaff();
  }, []);

  async function loadStaff() {
    const { data } = await supabase.from('staff').select('*').order('name');
    if (data) setStaffList(data);
    setLoading(false);
  }

  async function toggleActive(staff: Staff) {
    await supabase
      .from('staff')
      .update({ is_active: !staff.is_active })
      .eq('id', staff.id);
    setToast({ message: `${staff.name} ${staff.is_active ? 'deactivated' : 'activated'}`, type: 'success' });
    loadStaff();
  }

  function startEdit(staff: Staff) {
    setEditingStaff(staff);
    setEditForm({ name: staff.name, email: staff.email, phone: staff.phone });
  }

  async function saveEdit() {
    if (!editingStaff) return;
    const { error } = await supabase
      .from('staff')
      .update({ name: editForm.name, email: editForm.email, phone: editForm.phone })
      .eq('id', editingStaff.id);

    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      setToast({ message: 'Staff updated', type: 'success' });
      setEditingStaff(null);
      loadStaff();
    }
  }

  async function resetPin() {
    if (!resetPinStaff || newPin.length !== 4) return;

    const hashResult = await callEdgeFunction('/hash-pin', { pin: newPin });
    if (!hashResult.success) {
      setToast({ message: 'Failed to hash PIN', type: 'error' });
      return;
    }

    const { error } = await supabase
      .from('staff')
      .update({ pin_hash: hashResult.hash })
      .eq('id', resetPinStaff.id);

    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      setToast({ message: `PIN reset for ${resetPinStaff.name}`, type: 'success' });
      setResetPinStaff(null);
      setNewPin('');
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-moja-blue border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-moja-blue">Manage Staff</h2>
        <a
          href="#/admin/invitations"
          className="inline-flex items-center gap-2 px-5 py-3 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all touch-manipulation"
        >
          <UserPlus className="w-5 h-5" />
          Invite New Staff Member
        </a>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-moja-blue">
                <th className="text-left px-6 py-4 text-sm font-bold text-white">Name</th>
                <th className="text-left px-6 py-4 text-sm font-bold text-white">Email</th>
                <th className="text-left px-6 py-4 text-sm font-bold text-white">Phone</th>
                <th className="text-left px-6 py-4 text-sm font-bold text-white">Status</th>
                <th className="text-left px-6 py-4 text-sm font-bold text-white">Clock</th>
                <th className="text-right px-6 py-4 text-sm font-bold text-white">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staffList.map((staff, idx) => (
                <tr key={staff.id} className={`${!staff.is_active ? 'opacity-50' : ''} ${idx % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-6 py-4 font-bold text-moja-blue">{staff.name}</td>
                  <td className="px-6 py-4 text-moja-blue/70 font-semibold">{staff.email}</td>
                  <td className="px-6 py-4 text-moja-blue/70 font-semibold">{staff.phone || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1.5 text-xs font-bold rounded-full ${
                      staff.is_active ? 'bg-moja-aqua/15 text-moja-aqua' : 'bg-red-50 text-red-600'
                    }`}>
                      {staff.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-3 py-1.5 text-xs font-bold rounded-full ${
                      staff.is_clocked_in ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {staff.is_clocked_in ? 'IN' : 'OUT'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(staff)}
                        className="p-2.5 text-moja-blue/40 hover:text-moja-orange hover:bg-moja-orange/10 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setResetPinStaff(staff)}
                        className="p-2.5 text-moja-blue/40 hover:text-moja-yellow hover:bg-moja-yellow/10 rounded-lg transition-colors"
                        title="Reset PIN"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(staff)}
                        className={`p-2.5 rounded-lg transition-colors ${
                          staff.is_active
                            ? 'text-moja-blue/40 hover:text-red-600 hover:bg-red-50'
                            : 'text-moja-blue/40 hover:text-moja-aqua hover:bg-moja-aqua/10'
                        }`}
                        title={staff.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {staffList.length === 0 && (
          <div className="p-8 text-center text-moja-blue/40 font-semibold">No staff members yet. Send an invitation to get started.</div>
        )}
      </div>

      {/* Edit Modal */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-moja-blue">Edit Staff</h3>
              <button onClick={() => setEditingStaff(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-moja-blue/40" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Name</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full h-14 px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                className="w-full h-14 px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">Phone</label>
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full h-14 px-4 text-lg font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingStaff(null)} className="flex-1 h-14 border-2 border-moja-blue/20 rounded-xl font-bold text-moja-blue/60 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} className="flex-1 h-14 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 transition-colors">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetPinStaff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-moja-blue">Reset PIN for {resetPinStaff.name}</h3>
              <button onClick={() => { setResetPinStaff(null); setNewPin(''); }} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-moja-blue/40" />
              </button>
            </div>
            <div>
              <label className="block text-sm font-bold text-moja-blue mb-1">New 4-Digit PIN</label>
              <input
                type="text"
                value={newPin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setNewPin(v);
                }}
                maxLength={4}
                className="w-full h-16 px-4 text-3xl text-center font-mono tracking-[0.5em] font-bold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
                placeholder="0000"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setResetPinStaff(null); setNewPin(''); }} className="flex-1 h-14 border-2 border-moja-blue/20 rounded-xl font-bold text-moja-blue/60 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={resetPin}
                disabled={newPin.length !== 4}
                className="flex-1 h-14 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 transition-colors disabled:opacity-40"
              >
                Reset PIN
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
