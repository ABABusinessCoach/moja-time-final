
-- Add approval workflow columns to timecard_corrections
ALTER TABLE timecard_corrections
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS proposed_hours numeric;

-- Add check constraint for approval_status
ALTER TABLE timecard_corrections
  ADD CONSTRAINT timecard_corrections_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));
