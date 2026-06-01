export interface Staff {
  id: string;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  is_clocked_in: boolean;
  is_on_break: boolean;
  created_at: string;
}

export interface ClockLog {
  id: string;
  staff_id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  duration_minutes: number | null;
  week_ending: string;
  notes: string;
  flagged: boolean;
  created_at: string;
  staff?: { name: string };
}

export interface BreakLog {
  id: string;
  clock_log_id: string;
  staff_id: string;
  break_start: string;
  break_end: string | null;
  duration_minutes: number | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  action: 'manual_edit' | 'manual_add' | 'manual_delete' | 'force_clock_out';
  target_staff_id: string | null;
  clock_log_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string;
  created_at: string;
  admins?: { name: string };
  staff?: { name: string };
}

export interface AppSettings {
  overtime_weekly_threshold: number;
  overtime_daily_threshold: number | null;
  max_shift_hours: number;
  auto_clock_out_hours: number;
  expected_start_time: string;
  daily_summary_email: boolean;
  overtime_warning_threshold: number;
}

export interface Invitation {
  id: string;
  token: string;
  email: string;
  expires_at: string;
  used: boolean;
  created_by: string;
  created_at: string;
}

export interface Admin {
  id: string;
  email: string;
  name: string;
  created_at: string;
}
