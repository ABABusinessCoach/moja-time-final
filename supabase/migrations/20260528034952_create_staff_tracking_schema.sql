/*
  # Staff Time Tracking Schema

  1. New Tables
    - `admins`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `name` (text)
      - `created_at` (timestamptz)
    - `staff`
      - `id` (uuid, primary key)
      - `name` (text)
      - `email` (text, unique)
      - `phone` (text, optional)
      - `pin_hash` (text, hashed 4-digit PIN)
      - `is_active` (boolean)
      - `is_clocked_in` (boolean)
      - `created_at` (timestamptz)
    - `clock_logs`
      - `id` (uuid, primary key)
      - `staff_id` (uuid, references staff)
      - `clock_in_time` (timestamptz)
      - `clock_out_time` (timestamptz, nullable)
      - `duration_minutes` (numeric, calculated)
      - `week_ending` (date)
      - `created_at` (timestamptz)
    - `invitations`
      - `id` (uuid, primary key)
      - `token` (text, unique)
      - `email` (text)
      - `expires_at` (timestamptz)
      - `used` (boolean)
      - `created_by` (uuid, references admins)
      - `created_at` (timestamptz)

  2. Security
    - RLS enabled on all tables
    - Admins can read/write all data
    - Staff clock operations handled via edge functions with service role
*/

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own data"
  ON admins FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can update own data"
  ON admins FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Staff table
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text DEFAULT '',
  pin_hash text NOT NULL,
  is_active boolean DEFAULT true,
  is_clocked_in boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all staff"
  ON staff FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins can insert staff"
  ON staff FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins can update staff"
  ON staff FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

-- Public read for staff names (for the clock-in dropdown)
CREATE POLICY "Anyone can read active staff names"
  ON staff FOR SELECT
  TO anon
  USING (is_active = true);

-- Clock logs table
CREATE TABLE IF NOT EXISTS clock_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  clock_in_time timestamptz NOT NULL,
  clock_out_time timestamptz,
  duration_minutes numeric,
  week_ending date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clock_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all clock logs"
  ON clock_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins can insert clock logs"
  ON clock_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins can update clock logs"
  ON clock_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

-- Invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  email text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used boolean DEFAULT false,
  created_by uuid NOT NULL REFERENCES admins(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read invitations"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

CREATE POLICY "Admins can update invitations"
  ON invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
  );

-- Public read for invitation validation (by token)
CREATE POLICY "Anyone can validate invitation token"
  ON invitations FOR SELECT
  TO anon
  USING (used = false AND expires_at > now());

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clock_logs_staff_id ON clock_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_clock_logs_week_ending ON clock_logs(week_ending);
CREATE INDEX IF NOT EXISTS idx_clock_logs_clock_in_time ON clock_logs(clock_in_time);
CREATE INDEX IF NOT EXISTS idx_staff_is_active ON staff(is_active);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- Enable pgcrypto for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;
