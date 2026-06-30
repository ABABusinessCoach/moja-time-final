/*
# Fix bug_reports RLS policies

## Changes
- Replace overly permissive INSERT policy with one that ensures only new 'open' reports can be inserted
- Replace overly permissive SELECT policy with admin-only check
- Replace overly permissive UPDATE policy with admin-only check
- Replace overly permissive DELETE policy with admin-only check

## Security
- INSERT: anon + authenticated can insert, but only rows with status = 'open' and resolved_at IS NULL
  (prevents abuse of inserting pre-resolved or pre-dismissed reports)
- SELECT: restricted to authenticated admins only (users in the admins table)
- UPDATE: restricted to authenticated admins only
- DELETE: restricted to authenticated admins only

## Notes
1. The admin check pattern matches the rest of the codebase:
   EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
2. INSERT remains open to anon because employees submit bug reports
   without Supabase auth (they use PIN-based auth via edge functions)
3. The WITH CHECK on INSERT prevents someone from injecting a bug report
   with an arbitrary status or resolved_at timestamp
*/

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "anyone_can_insert_bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "authenticated_can_select_bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "authenticated_can_update_bug_reports" ON bug_reports;
DROP POLICY IF EXISTS "authenticated_can_delete_bug_reports" ON bug_reports;

-- INSERT: anon + authenticated can insert, but only new open reports
CREATE POLICY "anon_insert_bug_reports" ON bug_reports FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'open' AND resolved_at IS NULL);

-- SELECT: only admins can view bug reports
CREATE POLICY "admin_select_bug_reports" ON bug_reports FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- UPDATE: only admins can update bug reports
CREATE POLICY "admin_update_bug_reports" ON bug_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));

-- DELETE: only admins can delete bug reports
CREATE POLICY "admin_delete_bug_reports" ON bug_reports FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid()));