import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Save, UserPlus, Trash2, X, Shield } from 'lucide-react';
import { Toast } from '../components/Toast';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export function AdminSettings() {
  const [settings, setSettings] = useState({
    overtime_weekly_threshold: 40,
    overtime_daily_threshold: '' as string | number,
    max_shift_hours: 12,
    auto_clock_out_hours: 16,
    expected_start_time: '09:00',
    daily_summary_email: false,
    overtime_warning_threshold: 35,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Admin management state
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [addAdminForm, setAddAdminForm] = useState({ name: '', email: '', password: '' });
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingAdmin, setRemovingAdmin] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadAdmins();
  }, []);

  async function loadAdmins() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/list-admins`,
        {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) setAdmins(result.admins);
      }
    } catch {
      // Silent fail — admins list is supplementary
    }
  }

  async function handleAddAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAddingAdmin(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/create-admin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(addAdminForm),
        }
      );

      const result = await response.json();
      if (result.success) {
        setToast({ message: result.message, type: 'success' });
        setShowAddAdmin(false);
        setAddAdminForm({ name: '', email: '', password: '' });
        loadAdmins();
      } else {
        setToast({ message: result.message || 'Failed to create admin', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setAddingAdmin(false);
    }
  }

  async function handleRemoveAdmin(adminId: string) {
    setRemovingAdmin(adminId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/remove-admin`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ admin_id: adminId }),
        }
      );

      const result = await response.json();
      if (result.success) {
        setToast({ message: 'Admin removed', type: 'success' });
        loadAdmins();
      } else {
        setToast({ message: result.message || 'Failed to remove admin', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    } finally {
      setRemovingAdmin(null);
    }
  }

  async function loadSettings() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/settings`,
        {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        }
      );

      if (!response.ok) {
        setToast({ message: 'Failed to load settings', type: 'error' });
        return;
      }

      const result = await response.json();
      if (result.success && result.settings) {
        setSettings(prev => ({
          ...prev,
          overtime_weekly_threshold: result.settings.overtime_weekly_threshold ?? 40,
          overtime_daily_threshold: result.settings.overtime_daily_threshold ?? '',
          max_shift_hours: result.settings.max_shift_hours ?? 12,
          auto_clock_out_hours: result.settings.auto_clock_out_hours ?? 16,
          expected_start_time: result.settings.expected_start_time ?? '09:00',
          daily_summary_email: result.settings.daily_summary_email ?? false,
          overtime_warning_threshold: result.settings.overtime_warning_threshold ?? 35,
        }));
      }
    } catch {
      setToast({ message: 'Network error loading settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const payload: Record<string, unknown> = {
        overtime_weekly_threshold: Number(settings.overtime_weekly_threshold),
        overtime_daily_threshold: settings.overtime_daily_threshold === '' ? null : Number(settings.overtime_daily_threshold),
        max_shift_hours: Number(settings.max_shift_hours),
        auto_clock_out_hours: Number(settings.auto_clock_out_hours),
        expected_start_time: settings.expected_start_time,
        daily_summary_email: settings.daily_summary_email,
        overtime_warning_threshold: Number(settings.overtime_warning_threshold),
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-operations/admin/settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ settings: payload }),
        }
      );

      if (!response.ok) {
        setToast({ message: 'Save failed', type: 'error' });
        return;
      }

      const result = await response.json();
      if (result.success) {
        setToast({ message: 'Settings saved', type: 'success' });
      } else {
        setToast({ message: result.message || 'Save failed', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error saving settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-moja-blue" />
        <h2 className="text-2xl font-bold text-moja-blue">Settings</h2>
      </div>

      {/* Overtime Settings */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-5">
        <h3 className="text-lg font-bold text-moja-blue">Overtime Rules</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Weekly OT Threshold (hours)</label>
            <input
              type="number"
              value={settings.overtime_weekly_threshold}
              onChange={(e) => setSettings(s => ({ ...s, overtime_weekly_threshold: Number(e.target.value) }))}
              className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
            />
            <p className="text-xs text-moja-blue/40 font-semibold mt-1">Hours per week before overtime applies</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Daily OT Threshold (hours, optional)</label>
            <input
              type="number"
              value={settings.overtime_daily_threshold}
              onChange={(e) => setSettings(s => ({ ...s, overtime_daily_threshold: e.target.value }))}
              placeholder="Leave empty to disable"
              className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
            />
            <p className="text-xs text-moja-blue/40 font-semibold mt-1">Hours per day before overtime (e.g., 8)</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">OT Warning Threshold (hours)</label>
            <input
              type="number"
              value={settings.overtime_warning_threshold}
              onChange={(e) => setSettings(s => ({ ...s, overtime_warning_threshold: Number(e.target.value) }))}
              className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
            />
            <p className="text-xs text-moja-blue/40 font-semibold mt-1">Warn when staff approaches this weekly total</p>
          </div>
        </div>
      </div>

      {/* Shift Settings */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-5">
        <h3 className="text-lg font-bold text-moja-blue">Shift Limits</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Max Shift Hours (flag threshold)</label>
            <input
              type="number"
              value={settings.max_shift_hours}
              onChange={(e) => setSettings(s => ({ ...s, max_shift_hours: Number(e.target.value) }))}
              className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
            />
            <p className="text-xs text-moja-blue/40 font-semibold mt-1">Shifts longer than this get flagged on dashboard</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Auto Clock-Out Hours</label>
            <input
              type="number"
              value={settings.auto_clock_out_hours}
              onChange={(e) => setSettings(s => ({ ...s, auto_clock_out_hours: Number(e.target.value) }))}
              className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
            />
            <p className="text-xs text-moja-blue/40 font-semibold mt-1">Maximum hours before auto-flagging for review</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-moja-blue mb-1">Expected Start Time</label>
            <input
              type="time"
              value={settings.expected_start_time}
              onChange={(e) => setSettings(s => ({ ...s, expected_start_time: e.target.value }))}
              className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
            />
            <p className="text-xs text-moja-blue/40 font-semibold mt-1">Used for late arrival detection in reports</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-5">
        <h3 className="text-lg font-bold text-moja-blue">Notifications</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.daily_summary_email}
            onChange={(e) => setSettings(s => ({ ...s, daily_summary_email: e.target.checked }))}
            className="w-5 h-5 rounded border-2 border-moja-blue/30 text-moja-orange focus:ring-moja-orange"
          />
          <div>
            <span className="text-sm font-bold text-moja-blue">Daily Summary Email</span>
            <p className="text-xs text-moja-blue/40 font-semibold">Receive a daily email with attendance summary</p>
          </div>
        </label>
      </div>

      {/* Admin Accounts */}
      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-moja-blue" />
            <h3 className="text-lg font-bold text-moja-blue">Admin Accounts</h3>
          </div>
          <button
            onClick={() => setShowAddAdmin(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-moja-blue text-white rounded-lg font-bold text-sm hover:bg-moja-blue/90 active:scale-[0.98] transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Add Admin
          </button>
        </div>

        <div className="divide-y divide-gray-100">
          {admins.map(admin => (
            <div key={admin.id} className="flex items-center justify-between py-3">
              <div>
                <p className="font-bold text-moja-blue">{admin.name}</p>
                <p className="text-sm font-semibold text-moja-blue/50">{admin.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-moja-blue/30">
                  Added {new Date(admin.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                {admins.length > 1 && (
                  <button
                    onClick={() => handleRemoveAdmin(admin.id)}
                    disabled={removingAdmin === admin.id}
                    className="p-2 text-moja-blue/30 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Remove admin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {admins.length === 0 && (
            <p className="py-3 text-sm text-moja-blue/40 font-semibold">Loading admin accounts...</p>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={saveSettings}
          disabled={saving}
          className="inline-flex items-center gap-2 px-8 py-4 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 active:scale-[0.98] transition-all disabled:opacity-50 touch-manipulation"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Add Admin Modal */}
      {showAddAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-moja-blue">Add Admin Account</h3>
              <button onClick={() => setShowAddAdmin(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-moja-blue/40" />
              </button>
            </div>
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-moja-blue mb-1">Name</label>
                <input
                  type="text"
                  value={addAdminForm.name}
                  onChange={(e) => setAddAdminForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
                  placeholder="Admin name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-moja-blue mb-1">Email</label>
                <input
                  type="email"
                  value={addAdminForm.email}
                  onChange={(e) => setAddAdminForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
                  placeholder="admin@email.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-moja-blue mb-1">Password</label>
                <input
                  type="password"
                  value={addAdminForm.password}
                  onChange={(e) => setAddAdminForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full h-12 px-4 font-semibold text-moja-blue border-2 border-moja-blue/20 rounded-xl focus:border-moja-orange focus:outline-none"
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdmin(false)}
                  className="flex-1 h-12 border-2 border-moja-blue/20 rounded-xl font-bold text-moja-blue/60 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingAdmin}
                  className="flex-1 h-12 bg-moja-orange text-white rounded-xl font-bold hover:bg-moja-orange/90 transition-colors disabled:opacity-50"
                >
                  {addingAdmin ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
