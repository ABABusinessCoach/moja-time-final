/*
# Schedule payroll reminder email cron job

1. Changes
   - Adds a weekly Monday cron job at 13:00 UTC (9:00 AM Eastern) that calls
     the payroll-reminder-email edge function.
   - The edge function itself checks whether a reminder is actually due that day
     (biweekly logic), so running weekly is safe — it simply no-ops on off weeks.

2. Important Notes
   - Uses pg_net to make an HTTP POST to the edge function.
   - No JWT verification needed (function is set to verify_jwt=false).
*/

SELECT cron.unschedule('payroll-reminder-email')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payroll-reminder-email');

SELECT cron.schedule(
  'payroll-reminder-email',
  '0 13 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://lrkblcyqeruzrhynjmqn.supabase.co/functions/v1/payroll-reminder-email',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
