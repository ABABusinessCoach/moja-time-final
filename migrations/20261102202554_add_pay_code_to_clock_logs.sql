/*
# Add payroll pay code to shifts

1. Modified Tables
- `clock_logs`
  - `pay_code` (text, nullable) - payroll code for the shift (e.g. RG, OT, PTO, HO). NULL means "(none)".

2. Constraints
- `clock_logs_pay_code_check` restricts values to the approved payroll code list.

3. Security
- No policy or grant changes. Only admins can update/insert clock_logs directly (existing
  admin-only policies); employees reach shifts only through server functions, which never
  write this column.

4. Notes
1. Existing shifts keep NULL ("(none)"); no data is changed.
*/

ALTER TABLE clock_logs ADD COLUMN IF NOT EXISTS pay_code text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clock_logs_pay_code_check') THEN
    ALTER TABLE clock_logs ADD CONSTRAINT clock_logs_pay_code_check CHECK (
      pay_code IS NULL OR pay_code IN (
        '1099NEC','BD','BO','FLH','HO','HOW','MI','OTP','OT','PTO','RG','REIM','SA','SK','TR','UNPAID','VA','VOL','WELLNESS'
      )
    );
  END IF;
END $$;