INSERT INTO ventures (id, name, tagline, kind, status, description, accent_colour) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'Sporebit', 'The parent organisation',
   'organisation', 'launched',
   'Phil''s umbrella organisation covering all ventures.',
   '#84f5b8'),
  ('a0000000-0000-0000-0000-000000000002',
   'Mycelium', 'Personal AI life OS',
   'business', 'launched',
   'Personal AI dashboard. Live at mycelium.sporebit.com.',
   '#84f5b8'),
  ('a0000000-0000-0000-0000-000000000003',
   'Surprise Packs', 'Custom DIY Pokémon card packs',
   'business', 'launched',
   'Handmade custom Pokémon card packs. Arts and crafts, DIY vibes.',
   '#f5b56d'),
  ('a0000000-0000-0000-0000-000000000004',
   'Dropship Auto', 'Automated dropshipping solution',
   'business', 'building',
   'Automated dropshipping platform that will spin up multiple stores.',
   '#6db8f5');

UPDATE ventures SET parent_id = 'a0000000-0000-0000-0000-000000000001'
WHERE id IN (
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000004'
);
