ALTER TABLE purchases ADD COLUMN category text
  CHECK (category IN (
    'groceries', 'electronics', 'clothing', 'home', 'health',
    'fitness', 'subscriptions', 'entertainment', 'transport',
    'dining', 'gifts', 'other'
  ));
