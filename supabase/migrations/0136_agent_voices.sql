-- 0136_agent_voices.sql
-- The Boys: a voice and a manner per agent, per user (MYC-149). Keyed by
-- agent id: { provider: 'elevenlabs' | 'openai', voice_id, voice_name,
-- speaking_style }. Kept on user_settings rather than agents so a second
-- user hears the same agent differently; nothing here is a secret (an
-- ElevenLabs voice id is a public identifier, the API key stays in the env).
-- user_settings already carries the per-user RLS from 0111. Depends on: 0135.

alter table public.user_settings
	add column if not exists agent_voices jsonb not null default '{}'::jsonb;
