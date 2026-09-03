-- Fix historical duration_minutes values to store gross time (clock_out - clock_in)
-- Previously, breaks were deducted at clock-out time. Now duration_minutes should
-- always be the raw shift length. Lunch deductions happen at display/report time only.
UPDATE clock_logs
SET duration_minutes = ROUND(EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 60)
WHERE clock_out_time IS NOT NULL
  AND duration_minutes IS NOT NULL
  AND duration_minutes != ROUND(EXTRACT(EPOCH FROM (clock_out_time - clock_in_time)) / 60);
