-- ui_prefs: general-purpose jsonb bag for per-user UI preferences.
-- Shape is defined in TypeScript (lib/settings/uiPrefs.ts) so new keys can
-- ship without a migration. Missing keys are filled by UI_PREFS_DEFAULTS.
alter table user_settings
  add column if not exists ui_prefs jsonb not null default '{}'::jsonb;
