ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS capture_source_labels jsonb
  DEFAULT '{
    "api":       {"label": "API",       "icon": "⚡", "visible": true},
    "telegram":  {"label": "Telegram",  "icon": "✈",  "visible": true},
    "web":       {"label": "Web",       "icon": "▢",  "visible": true},
    "ios":       {"label": "iOS",       "icon": "📱", "visible": true},
    "shortcut":  {"label": "Shortcut",  "icon": "⌘",  "visible": true}
  }';
