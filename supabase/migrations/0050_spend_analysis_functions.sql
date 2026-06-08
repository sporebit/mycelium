CREATE OR REPLACE FUNCTION spend_by_category(
  p_user_id text, p_start date, p_end date
)
RETURNS TABLE(category text, total numeric) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(category, 'Uncategorised') AS category,
    SUM(debit) AS total
  FROM transactions
  WHERE user_id = p_user_id
    AND txn_date BETWEEN p_start AND p_end
    AND category IS DISTINCT FROM 'Transfer (internal)'
    AND debit IS NOT NULL
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

CREATE OR REPLACE FUNCTION spend_by_month(
  p_user_id text, p_months_back int DEFAULT 6
)
RETURNS TABLE(month date, category text, total numeric) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    date_trunc('month', txn_date)::date AS month,
    COALESCE(category, 'Uncategorised') AS category,
    SUM(debit) AS total
  FROM transactions
  WHERE user_id = p_user_id
    AND txn_date >= date_trunc('month', now()) - (p_months_back - 1) * interval '1 month'
    AND category IS DISTINCT FROM 'Transfer (internal)'
    AND debit IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1 ASC, 3 DESC;
$$;
