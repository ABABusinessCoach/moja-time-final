/*
  # Set Database Timezone to Eastern Time

  1. Changes
    - Sets the database timezone to 'America/New_York' (Eastern Time)
    - This ensures all timestamp displays and `now()` calls use Eastern Time

  2. Important Notes
    - Existing timestamptz values remain correct (they store absolute points in time)
    - This affects how timestamps are displayed when queried directly
    - Application code also formats all times in EST
*/

ALTER DATABASE postgres SET timezone TO 'America/New_York';
