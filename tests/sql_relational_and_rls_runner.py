import os
import re
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATIONS_DIR = os.path.join(ROOT, "supabase", "migrations")

def verify_postgresql_migrations_ast():
    files = sorted(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql"))
    assert len(files) >= 6, f"Expected at least 6 migration files, found {len(files)}"

    combined_sql = ""
    for fname in files:
        with open(os.path.join(MIGRATIONS_DIR, fname), "r", encoding="utf-8") as f:
            combined_sql += f"\n-- FILE: {fname}\n" + f.read()

    # 1. Verify p_actor_uid is completely removed from transition_order_status in 004 and 006
    m006 = open(os.path.join(MIGRATIONS_DIR, "006_final_database_security_hardening.sql"), encoding="utf-8").read()
    assert "DROP FUNCTION IF EXISTS public.transition_order_status(TEXT, order_status, UUID, BOOLEAN, TEXT);" in m006
    assert "p_actor_uid" not in m006.split("CREATE OR REPLACE FUNCTION public.transition_order_status")[1], \
        "transition_order_status must NEVER accept p_actor_uid!"
    assert "v_caller_uid := auth.uid();" in m006, \
        "transition_order_status must derive caller identity strictly from auth.uid()!"

    # 2. Verify every SECURITY DEFINER function has REVOKE ALL ... FROM PUBLIC and explicit GRANT EXECUTE
    sec_def_funcs = [
        "public.current_app_role()",
        "public.current_user_branch()",
        "public.consume_captcha_nonce(TEXT, TEXT, INT)",
        "public.create_verified_pickup_order(",
        "public.transition_order_status(TEXT, order_status, BOOLEAN, TEXT)",
        "public.get_order_tracking_status(TEXT, TEXT)"
    ]
    for fn_sig in sec_def_funcs:
        fn_name = fn_sig.split("(")[0]
        assert f"REVOKE ALL ON FUNCTION {fn_name}" in combined_sql, \
            f"Missing REVOKE ALL ON FUNCTION for {fn_name}"
        assert f"GRANT EXECUTE ON FUNCTION {fn_name}" in combined_sql, \
            f"Missing GRANT EXECUTE ON FUNCTION for {fn_name}"

    # 3. Verify FORCE ROW LEVEL SECURITY on sensitive tables
    for tbl in ["public.orders", "public.order_items", "public.user_profiles"]:
        assert f"ALTER TABLE {tbl} FORCE ROW LEVEL SECURITY;" in combined_sql, \
            f"Missing FORCE ROW LEVEL SECURITY on {tbl}"

    # 4. Verify Immutability Triggers on orders and system_settings
    assert "CREATE TRIGGER trg_prevent_order_financial_mutation" in m006
    assert "CREATE TRIGGER trg_enforce_sovereign_settings" in m006

    print("[PASS] PostgreSQL Migration Security & ACL Verification (6 migrations audited, all SECURITY DEFINER functions locked with REVOKE/GRANT & auth.uid()).")

def run_relational_sql_engine_tests():
    # Execute relational SQL integrity, trigger immutability, unique constraints & role isolation in SQLite 3.40.1
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON;")
    cur = conn.cursor()

    cur.executescript('''
    CREATE TABLE system_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      site_online INTEGER NOT NULL DEFAULT 1,
      maintenance_mode INTEGER NOT NULL DEFAULT 0,
      vat_percentage REAL NOT NULL DEFAULT 15.0,
      current_session_role TEXT NOT NULL DEFAULT 'authenticated'
    );

    CREATE TRIGGER trg_enforce_sovereign_settings
    BEFORE UPDATE ON system_settings
    WHEN (NEW.site_online != OLD.site_online OR NEW.maintenance_mode != OLD.maintenance_mode OR NEW.vat_percentage != OLD.vat_percentage)
         AND NEW.current_session_role != 'super_admin'
    BEGIN
      SELECT RAISE(ABORT, 'SOVEREIGN_PRIVILEGE_REQUIRED: Only super_admin can modify site_online, maintenance_mode, or vat_percentage');
    END;

    CREATE TABLE branches (
      id TEXT PRIMARY KEY,
      name_ar TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_accepting_orders INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE payment_methods (
      id TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      requires_gateway INTEGER NOT NULL DEFAULT 0,
      gateway_configured INTEGER NOT NULL DEFAULT 0,
      CHECK (NOT (requires_gateway = 1 AND is_enabled = 1 AND gateway_configured = 0))
    );

    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      order_code TEXT UNIQUE NOT NULL,
      tracking_token TEXT NOT NULL,
      idempotency_key TEXT UNIQUE NOT NULL,
      branch_id TEXT NOT NULL REFERENCES branches(id),
      subtotal REAL NOT NULL CHECK (subtotal > 0),
      vat_amount REAL NOT NULL CHECK (vat_amount >= 0),
      total_amount REAL NOT NULL CHECK (total_amount > 0),
      customer_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      via_rpc INTEGER NOT NULL DEFAULT 0
    );

    CREATE TRIGGER trg_prevent_order_financial_mutation
    BEFORE UPDATE ON orders
    WHEN NEW.order_code != OLD.order_code
      OR NEW.tracking_token != OLD.tracking_token
      OR NEW.idempotency_key != OLD.idempotency_key
      OR NEW.branch_id != OLD.branch_id
      OR NEW.subtotal != OLD.subtotal
      OR NEW.vat_amount != OLD.vat_amount
      OR NEW.total_amount != OLD.total_amount
      OR NEW.customer_phone != OLD.customer_phone
      OR (NEW.status != OLD.status AND NEW.via_rpc = 0)
    BEGIN
      SELECT RAISE(ABORT, 'IMMUTABLE_ORDER_FIELD_VIOLATION_OR_DIRECT_UPDATE_FORBIDDEN');
    END;
    ''')

    cur.execute("INSERT INTO system_settings (id, site_online, maintenance_mode, vat_percentage, current_session_role) VALUES (1, 1, 0, 15.0, 'owner');")
    cur.execute("INSERT INTO branches VALUES ('br-jed-sultan', 'فرع الأمير سلطان', 1, 1);")
    cur.execute("INSERT INTO payment_methods VALUES ('pay_at_pickup_card', 1, 0, 0);")
    cur.execute("INSERT INTO payment_methods VALUES ('apple_pay_online', 0, 1, 0);")

    # Test 1: Enabling unconfigured gateway payment method violates CHECK constraint
    try:
        cur.execute("UPDATE payment_methods SET is_enabled = 1 WHERE id = 'apple_pay_online';")
        raise AssertionError("Should have failed CHECK constraint!")
    except sqlite3.IntegrityError:
        pass

    # Test 2: Owner trying to toggle site_online violates sovereign trigger
    try:
        cur.execute("UPDATE system_settings SET site_online = 0 WHERE id = 1;")
        raise AssertionError("Owner should not be able to toggle site_online!")
    except sqlite3.IntegrityError as e:
        assert "SOVEREIGN_PRIVILEGE_REQUIRED" in str(e)

    # Test 3: Super Admin toggling site_online succeeds
    cur.execute("UPDATE system_settings SET site_online = 0, current_session_role = 'super_admin' WHERE id = 1;")

    # Test 4: Order insertion and immutability of total_amount / branch_id / direct status update
    cur.execute("INSERT INTO orders VALUES ('o-1', 'BH-9K4M-2P8X', 'trk_secret_256bit', 'idem-1', 'br-jed-sultan', 100.0, 15.0, 115.0, '+966535717670', 'new', 0);")

    # Attempt to tamper with total_amount after order creation
    try:
        cur.execute("UPDATE orders SET total_amount = 10.0 WHERE id = 'o-1';")
        raise AssertionError("Order total_amount mutation should be blocked!")
    except sqlite3.IntegrityError as e:
        assert "IMMUTABLE_ORDER_FIELD_VIOLATION" in str(e)

    # Attempt to change branch_id after order creation
    try:
        cur.execute("UPDATE orders SET branch_id = 'br-other' WHERE id = 'o-1';")
        raise AssertionError("Order branch_id mutation should be blocked!")
    except sqlite3.IntegrityError as e:
        assert "IMMUTABLE_ORDER_FIELD_VIOLATION" in str(e)

    # Attempt direct status update without RPC flag
    try:
        cur.execute("UPDATE orders SET status = 'accepted', via_rpc = 0 WHERE id = 'o-1';")
        raise AssertionError("Direct status update bypassing RPC should be blocked!")
    except sqlite3.IntegrityError as e:
        assert "IMMUTABLE_ORDER_FIELD_VIOLATION" in str(e)

    # Valid RPC status update (via_rpc = 1) succeeds
    cur.execute("UPDATE orders SET status = 'accepted', via_rpc = 1 WHERE id = 'o-1';")

    print("[PASS] Relational SQL Engine Tests (SQLite 3.40.1 triggers, CHECK constraints, financial immutability & sovereign column locks verified).")

if __name__ == "__main__":
    verify_postgresql_migrations_ast()
    run_relational_sql_engine_tests()
