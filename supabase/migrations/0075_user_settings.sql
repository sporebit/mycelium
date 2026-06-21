CREATE TABLE user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,

  -- Profile
  display_name text,
  avatar_url text,
  timezone text DEFAULT 'Europe/London',
  date_format text DEFAULT 'DD/MM/YYYY',
  currency text DEFAULT 'GBP',

  -- Appearance
  default_landing_page text DEFAULT '/',
  dashboard_layout_locked boolean DEFAULT false,

  -- Notifications
  telegram_enabled boolean DEFAULT true,
  telegram_chat_id text,
  push_notifications_enabled boolean DEFAULT true,
  morning_briefing_enabled boolean DEFAULT false,
  morning_briefing_time time DEFAULT '08:00',
  reminder_notification_minutes_before integer DEFAULT 10,

  -- Feature flags
  finance_redaction_default boolean DEFAULT true,
  voice_capture_enabled boolean DEFAULT true,
  ai_categorisation_enabled boolean DEFAULT true,
  barcode_scanning_enabled boolean DEFAULT true,
  claude_vision_label_scan_enabled boolean DEFAULT true,
  weight_auto_detection_enabled boolean DEFAULT true,
  streaming_availability_enabled boolean DEFAULT true,

  -- Integrations
  spotify_connected boolean DEFAULT false,
  health_auto_export_enabled boolean DEFAULT false,
  google_calendar_enabled boolean DEFAULT true,

  -- AI config
  anthropic_model text DEFAULT 'claude-sonnet-4-20250514',
  ai_spending_categorisation_model text DEFAULT 'claude-haiku-20240307',

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO user_settings (user_id, display_name)
VALUES (coalesce(current_setting('app.user_id', true), 'default'), 'Phil');
