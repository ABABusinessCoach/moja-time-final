-- Schedule automatic timecard generation every Friday at 3 PM EST (20:00 UTC)
-- The edge function validates whether it's an actual pay period cutoff day
-- and skips if it's a non-cutoff Friday.
-- Cutoff Fridays: July 10, July 24, Aug 7, Aug 21, etc.

SELECT cron.schedule(
  'generate-timecards-on-cutoff',
  '0 20 * * 5',  -- Every Friday at 20:00 UTC = 3 PM EST
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/timecard-reports/cron-generate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);