INSERT INTO app_settings (key, value)
VALUES ('signup_code', '"MOJA2026"')
ON CONFLICT (key) DO NOTHING;
