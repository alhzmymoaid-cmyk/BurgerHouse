DO $migration$
DECLARE
  function_definition text;
  cashier_guard text := 'IF v_actor.role = ''cashier'' AND p_target_status = ''preparing'' THEN';
BEGIN
  SELECT pg_get_functiondef(
    'public.transition_order_status(text, public.order_status, boolean, text)'::regprocedure
  ) INTO function_definition;

  IF position(cashier_guard in function_definition) = 0 THEN
    RAISE EXCEPTION 'Expected cashier preparation restriction was not found; migration stopped safely.';
  END IF;

  function_definition := regexp_replace(
    function_definition,
    'IF v_actor\.role = ''cashier'' AND p_target_status = ''preparing'' THEN[[:space:]]*RAISE EXCEPTION ''ROLE_NOT_AUTHORIZED_FOR_STATUS'';[[:space:]]*END IF;',
    '',
    'g'
  );

  IF position(cashier_guard in function_definition) > 0 THEN
    RAISE EXCEPTION 'Cashier preparation restriction remains after rewrite; migration stopped safely.';
  END IF;

  EXECUTE function_definition;
END
$migration$;
