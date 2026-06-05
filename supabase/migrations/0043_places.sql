-- Places: hikes, spots, and places to visit with coordinates for mapping.

create table places (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  name          text not null,
  description   text,
  category      text not null default 'place',   -- hike, restaurant, pub, cafe, viewpoint, campsite, attraction, place
  status        text not null default 'wishlist', -- wishlist, planned, visited
  lat           double precision,
  lng           double precision,
  address       text,
  google_maps_url text,
  rating        smallint,                         -- 1-5, set after visiting
  visit_date    date,
  notes         text,
  tags          text[],                           -- freeform tags: "dog-friendly", "waterfall", etc.
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_places_user   on places (user_id);
create index idx_places_status on places (user_id, status);

alter table places enable row level security;

create policy "places_user" on places
  for all using (user_id = current_setting('app.user_id', true))
  with check  (user_id = current_setting('app.user_id', true));
