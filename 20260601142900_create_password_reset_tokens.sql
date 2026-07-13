-- Re-schedule with direct URL (function has verify_jwt=false, so no auth header needed)
-- Runs every Friday at 20:00 UTC = 3:00 PM EST
-- The edge function validates it's a real cutoff day and skips non-cutoff Fridays

SELECT cron.schedule(
  'generate-timecards-on-cutoff',
  '0 20 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://lrkblcyqeruzrhynjmqn.supabase.co/functions/v1/timecard-reports/cron-generate',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);