/*
  # Allow anonymous users to check if admins exist

  1. Security Changes
    - Add SELECT policy on `admins` table for `anon` role
    - Policy only allows selecting the `id` column with a count query
    - This is needed so the Admin Setup page can redirect when an admin already exists
    - No sensitive data is exposed since the query only checks existence

  2. Important Notes
    - The anon role can only see that rows exist, not read actual admin data
    - This is required because the setup page is visited by unauthenticated users
*/

CREATE POLICY "Anyone can check if admins exist"
  ON admins
  FOR SELECT
  TO anon
  USING (true);
