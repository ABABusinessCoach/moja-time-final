/*
# Create payroll_reminders table

1. New Tables
   - `payroll_reminders`
     - `id` (uuid, primary key)
     - `title` (text, not null) — reminder title
     - `description` (text) — multi-line task description
     - `assigned_to` (text, not null) — role or person assigned
     - `recurrence_weeks` (integer, not null) — how often it repeats in weeks
     - `first_due_date` (date, not null) — the first occurrence date
     - `due_time` (text, default 'End of day') — when within the day it's due
     - `is_active` (boolean, default true) — whether the reminder is active
     - `created_at` (timestamptz, default now())

2. Security
   - Enable RLS on `payroll_reminders`.
   - Authenticated users (admins) can SELECT, INSERT, UPDATE, DELETE.

3. Seed Data
   - Insert the biweekly "Review & Approve Payroll" reminder starting Aug 10, 2026.
*/

CREATE TABLE IF NOT EXISTS payroll_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to text NOT NULL DEFAULT 'Admin',
  recurrence_weeks integer NOT NULL DEFAULT 2,
  first_due_date date NOT NULL,
  due_time text NOT NULL DEFAULT 'End of day',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payroll_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payroll_reminders" ON payroll_reminders;
CREATE POLICY "select_payroll_reminders" ON payroll_reminders FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_payroll_reminders" ON payroll_reminders;
CREATE POLICY "insert_payroll_reminders" ON payroll_reminders FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_payroll_reminders" ON payroll_reminders;
CREATE POLICY "update_payroll_reminders" ON payroll_reminders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_payroll_reminders" ON payroll_reminders;
CREATE POLICY "delete_payroll_reminders" ON payroll_reminders FOR DELETE
  TO authenticated USING (true);

-- Seed the biweekly payroll approval reminder
INSERT INTO payroll_reminders (title, description, assigned_to, recurrence_weeks, first_due_date, due_time)
VALUES (
  'Review & Approve Payroll',
  E'Review all employee timesheets for the completed payroll period.\nVerify hours, PTO, holidays, overtime, and any adjustments.\nConfirm all payroll data is accurate and complete.\nApprove payroll for processing.\nFlag and resolve any discrepancies before submitting payroll.',
  'Admin',
  2,
  '2026-08-10',
  'End of day Monday'
)
ON CONFLICT DO NOTHING;
