-- Migration: routing_rules — user-editable rules that get injected
-- into the fitness voice-parser and the capture classifier LLM
-- prompts at runtime, replacing the prior practice of editing the
-- hardcoded SYSTEM_PROMPT strings to tweak routing behaviour.
--
-- Depends on: nothing.
-- Rollback: DROP TABLE routing_rules;

create table if not exists routing_rules (
  id            uuid        primary key default gen_random_uuid(),
  user_id       text        not null,
  scope         text        not null check (scope in ('fitness', 'capture')),
  rule_key      text        not null,
  display_name  text        not null,
  description   text        not null,
  examples      text[],
  enabled       boolean     not null default true,
  priority      integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, scope, rule_key)
);

alter table routing_rules enable row level security;
create policy "deny all" on routing_rules as restrictive using (false);

-- Partial index over enabled rules — these are the ones the runtime
-- injection pulls; disabled rows are kept around for re-enabling but
-- don't need to be indexed.
create index if not exists routing_rules_user_scope_idx
  on routing_rules (user_id, scope)
  where enabled = true;

-- ---------------------------------------------------------------------------
-- Seed default rules for the operator (user_id='phil'). Extracted from
-- the two existing SYSTEM_PROMPT bodies — these are the defaults the
-- LLMs have been working from. INSERT … ON CONFLICT DO NOTHING so the
-- migration is idempotent if re-applied.
-- ---------------------------------------------------------------------------

insert into routing_rules (user_id, scope, rule_key, display_name, description, examples, priority)
values
  -- FITNESS — slot keywords
  ('phil', 'fitness', 'slot_morning',     'Morning slot',     'Words that route a workout to the morning slot.',     array['morning', 'this morning'],                            100),
  ('phil', 'fitness', 'slot_afternoon',   'Afternoon slot',   'Words that route a workout to the afternoon slot.',   array['afternoon', 'this afternoon'],                         100),
  ('phil', 'fitness', 'slot_evening',     'Evening slot',     'Words that route a workout to the evening slot.',     array['evening', 'tonight', 'this evening'],                  100),
  ('phil', 'fitness', 'slot_extra',       'Extra slot',       'Words that route a workout to the extra slot (off-programme bonus).', array['extra', 'bonus session', 'bonus workout'], 100),

  -- FITNESS — kind keywords
  ('phil', 'fitness', 'kind_cardio',      'Cardio kind',      'Vocabulary that identifies cardio: continuous aerobic work.',    array['run', 'jog', 'walk', 'cycle', 'row', 'treadmill', 'zone 2', 'easy pace', 'steady', 'conversational'], 90),
  ('phil', 'fitness', 'kind_conditioning','Conditioning kind','Vocabulary that identifies conditioning: high-intensity intervals and circuits.', array['EMOM', 'HIIT', 'intervals', 'circuit', 'AMRAP', 'complex', 'kettlebell flow', 'KB EMOM', 'burpees', 'metabolic'], 90),
  ('phil', 'fitness', 'kind_resistance',  'Resistance kind',  'Vocabulary that identifies resistance/strength training: sets/reps with weight.', array['bench', 'deadlift', 'squat', 'press', 'row', 'curl', 'lift', 'hypertrophy'], 90),
  ('phil', 'fitness', 'kind_mobility',    'Mobility kind',    'Vocabulary that identifies mobility work: stretching, foam rolling, dynamic warmups.', array['stretch', 'mobility', 'foam roll', 'opener', 'dynamic warmup', 'cat-cow', 'dislocates', 'Y/W/I raise', 'dead bug'], 90),

  -- FITNESS — intent routing
  ('phil', 'fitness', 'intent_planned',      'Planned-session match',  'When the user describes activity matching exactly one planned session (by kind ± slot), route it to that session instead of creating a new one.', array['planned mobility this evening', 'KB EMOM this morning'], 80),
  ('phil', 'fitness', 'intent_ambiguous',    'Ambiguous candidates',   'When two or more planned sessions match the kind/slot, surface a disambiguation prompt with the candidate ids rather than guessing.', array['two evening mobility sessions'], 70),
  ('phil', 'fitness', 'intent_create_extra', 'Create extra session',   'When the activity has no matching planned session (off-programme), create an extra session in the extra slot.', array['played tennis', 'went hiking'], 60),

  -- CAPTURE — kind classification
  ('phil', 'capture', 'kind_task',     'Task',     'Something the user needs to DO — an action to perform.',                                                      array['remind me to call Sarah', 'todo: review the PR'],                       100),
  ('phil', 'capture', 'kind_journal',  'Journal',  'Reflective, observational, or experiential — the kind of thing they would want to re-read in a year.',          array['Beautiful walk through the park, the geese are back', 'I felt drained today'], 100),
  ('phil', 'capture', 'kind_workout',  'Workout',  'A description of training: sets/reps/weights, named exercises, named sessions, pain or feel words.',           array['Bench 80kg 5x5, OHP 50kg 3x8', 'ran 5km'],                              100),
  ('phil', 'capture', 'kind_purchase', 'Purchase', 'Intent to BUY, pay for, order, or acquire something — physical goods, services, bills, subscriptions.',      array['buy milk', 'pay the electric bill', 'order a new keyboard'],            100),
  ('phil', 'capture', 'kind_decision', 'Decision', 'Recording a choice the user made or is making between options.',                                              array['we decided to go with React 19', 'choosing between Postgres and SQLite'], 100),

  -- CAPTURE — urgency
  ('phil', 'capture', 'urgency_today',      'Urgency: today',      'Words that route a capture to TODAY urgency.',           array['today', 'tonight', 'now', 'urgent', 'ASAP', 'critical'], 50),
  ('phil', 'capture', 'urgency_this_week',  'Urgency: this week',  'Words that route a capture to THIS WEEK urgency.',       array['this week', 'tomorrow', 'soon', 'in the next few days'], 50),
  ('phil', 'capture', 'urgency_this_month', 'Urgency: this month', 'Words that route a capture to THIS MONTH urgency.',      array['this month', 'eventually', 'not urgent'], 50),
  ('phil', 'capture', 'urgency_someday',    'Urgency: someday',    'Default urgency when no time signal is present, or explicit someday wording.', array['someday', 'one day', 'maybe', 'no rush'], 50)
on conflict (user_id, scope, rule_key) do nothing;
