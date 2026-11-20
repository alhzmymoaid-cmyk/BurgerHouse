# Customer phone + password authentication

Customer accounts use a Saudi mobile number and password in the storefront. Customers do not receive an SMS or email OTP.

## Supabase configuration

- Keep the Supabase **Phone** provider disabled. No Twilio credentials or SMS provider are required.
- Keep the **Email** provider enabled because Supabase Auth stores each customer behind a private, deterministic internal email alias.
- The customer never sees or enters that internal email address.
- Do not disable email/password authentication globally; staff accounts continue to use their existing email/password flow.

## Server configuration

The Vercel project must have these server-only variables configured for Production and Preview:

- `SUPABASE_SERVICE_ROLE_KEY`
- `ORDER_HMAC_SECRET` (at least 32 characters; also used to derive non-reversible customer login aliases)

Never prefix either variable with `NEXT_PUBLIC_` and never return either value to the browser.

## How customer sign-in works

1. The browser submits the customer's phone number and password to `POST /api/account/auth`.
2. The server normalizes the Saudi number and derives a stable internal alias using HMAC-SHA256 and `ORDER_HMAC_SECRET`.
3. Signup creates a confirmed Auth user through the server-only Admin API, stores the phone in customer profile data and server-managed `app_metadata`, then signs the customer in.
4. Login uses the same internal alias and the supplied password.
5. Supabase SSR writes the session to secure cookies. The internal alias is never returned to the client.
6. Authentication attempts are rate-limited in PostgreSQL. Only the server's service role can access the rate-limit table/function.

## Important security limitation

Because this flow intentionally has no SMS OTP, the app cannot prove that a new customer owns the phone number they enter. A person could register a number they do not control. Use this mode only with that trade-off understood. Password recovery cannot safely be performed using the phone number alone; use a manual support process that verifies ownership before resetting an account.

## Staff accounts

Staff and owner login routes remain unchanged and continue to use their existing email/password identities.
