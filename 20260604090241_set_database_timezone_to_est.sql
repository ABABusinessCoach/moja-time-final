/*
  # Add RLS policies for password_reset_tokens and pin_attempts

  1. Security Changes
    - `password_reset_tokens`: Add policy for admins to read their own reset tokens
    - `pin_attempts`: Add policy for admins to read attempt logs for monitoring
  
  2. Notes
    - Both tables are primarily accessed via service role in edge functions
    - These policies allow admin visibility for auditing purposes only
*/

-- password_reset_tokens: admins can view tokens for monitoring
CREATE POLICY "Admins can read password reset tokens"
  ON password_reset_tokens FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- password_reset_tokens: admins can insert (via edge function uses service role, but policy needed)
CREATE POLICY "Admins can insert password reset tokens"
  ON password_reset_tokens FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- pin_attempts: admins can read for security monitoring
CREATE POLICY "Admins can read pin attempts"
  ON pin_attempts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- pin_attempts: service role handles inserts, but add policy for completeness
CREATE POLICY "Admins can insert pin attempts"
  ON pin_attempts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));
