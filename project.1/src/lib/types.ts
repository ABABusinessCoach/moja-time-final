export interface Staff {
  id: string;
  name: string;
  email: string;
  phone: string;
  is_active: boolean;
  is_clocked_in: boolean;
  created_at: string;
}

export interface ClockLog {
  id: string;
  staff_id: string;
  clock_in_time: string;
  clock_out_time: string | null;
  duration_minutes: number | null;
  week_ending: string;
  created_at: string;
  staff?: Staff;
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
