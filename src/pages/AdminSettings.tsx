import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Save } from 'lucide-react';
import { Toast } from '../components/Toast';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

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
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-moja-blue border-t-transparent rounded-full animate-spin" /></div>;
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
    </div>
  );
}
