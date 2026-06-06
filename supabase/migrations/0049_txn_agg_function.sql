-- Server-side aggregation for transaction summary + distinct types.
-- Avoids PostgREST max-rows limit when computing over all rows.

CREATE OR REPLACE FUNCTION txn_agg(
  p_user_id text,
  p_account_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_types text[] DEFAULT NULL,
  p_categories text[] DEFAULT NULL
)
RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'total_in',  COALESCE(SUM(CASE WHEN category IS DISTINCT FROM 'Transfer (internal)' AND amount > 0 THEN amount END), 0),
    'total_out', COALESCE(SUM(CASE WHEN category IS DISTINCT FROM 'Transfer (internal)' AND amount < 0 THEN amount END), 0),
    'types',     COALESCE(array_agg(DISTINCT txn_type ORDER BY txn_type), '{}')
  )
  FROM transactions
  WHERE user_id = p_user_id
    AND (p_account_id IS NULL OR account_id = p_account_id)
    AND (p_from IS NULL OR txn_date >= p_from)
    AND (p_to IS NULL OR txn_date <= p_to)
    AND (p_search IS NULL OR description ILIKE '%' || p_search || '%' OR enriched_merchant ILIKE '%' || p_search || '%')
    AND (p_types IS NULL OR txn_type = ANY(p_types))
    AND (p_categories IS NULL OR category = ANY(p_categories));
$$;
