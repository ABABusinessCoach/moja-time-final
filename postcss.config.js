/*
  # Allow First Admin Setup

  1. Security Changes
    - Add INSERT policy on admins table to allow first admin registration
    - Only works when no admins exist yet (bootstrap scenario)
*/

CREATE POLICY "First admin can self-register when no admins exist"
  ON admins FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id AND
    NOT EXISTS (SELECT 1 FROM admins)
  );
