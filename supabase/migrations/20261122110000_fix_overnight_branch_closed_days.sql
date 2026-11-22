DO $migration$
DECLARE
  v_function regprocedure := to_regprocedure(
    'public.create_verified_pickup_order(text,text,text,text,text,text,text,jsonb,text,text,integer,text,numeric,timestamp with time zone)'
  );
  v_definition text;
  v_old text := $old$
  IF EXTRACT(DOW FROM v_riyadh_now)::INT = ANY(v_branch.closed_days) THEN
    RAISE EXCEPTION 'BRANCH_CLOSED_TODAY';
  END IF;

  v_current_minutes := EXTRACT(HOUR FROM v_riyadh_now)::INT * 60 + EXTRACT(MINUTE FROM v_riyadh_now)::INT;
  v_open_minutes := split_part(v_branch.open_time, ':', 1)::INT * 60 + split_part(v_branch.open_time, ':', 2)::INT;
  v_close_minutes := split_part(v_branch.close_time, ':', 1)::INT * 60 + split_part(v_branch.close_time, ':', 2)::INT;
$old$;
  v_new text := $new$
  v_current_minutes := EXTRACT(HOUR FROM v_riyadh_now)::INT * 60 + EXTRACT(MINUTE FROM v_riyadh_now)::INT;
  v_open_minutes := split_part(v_branch.open_time, ':', 1)::INT * 60 + split_part(v_branch.open_time, ':', 2)::INT;
  v_close_minutes := split_part(v_branch.close_time, ':', 1)::INT * 60 + split_part(v_branch.close_time, ':', 2)::INT;

  -- After midnight, an overnight shift belongs to the previous weekday.
  IF EXTRACT(DOW FROM CASE
       WHEN v_close_minutes <= v_open_minutes AND v_current_minutes <= v_close_minutes
         THEN v_riyadh_now - INTERVAL '1 day'
       ELSE v_riyadh_now
     END)::INT = ANY(COALESCE(v_branch.closed_days, ARRAY[]::integer[])) THEN
    RAISE EXCEPTION 'BRANCH_CLOSED_TODAY';
  END IF;
$new$;
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'create_verified_pickup_order base function not found';
  END IF;

  v_definition := pg_get_functiondef(v_function);
  IF position(v_old in v_definition) = 0 THEN
    IF position('After midnight, an overnight shift belongs to the previous weekday.' in v_definition) > 0 THEN
      RAISE NOTICE 'Overnight weekday logic is already installed';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Expected operating-hours block not found; migration aborted without changing function';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END
$migration$;