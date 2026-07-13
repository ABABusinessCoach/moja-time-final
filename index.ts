/*
  # Create password reset tokens table

  1. New Tables
    - `password_reset_tokens`
      - `id` (uuid, primary key)
      - `email` (text, not null) - email of the admin requesting reset
      - `token` (text, unique, not null) - the unique reset token
      - `expires_at` (timestamptz, not null) - when the token expires
      - `used` (boolean, default false) - whether the token has been used
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `password_reset_tokens` table
    - No direct client access - only edge functions with service role key can manage tokens
*/

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
