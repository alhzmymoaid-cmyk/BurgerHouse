#!/usr/bin/env node
/**
 * Configure hosted Supabase Auth for BURGER HOUSE email OTP.
 *
 * Required environment variables (never commit their values):
 * SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF,
 * SMTP_ADMIN_EMAIL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const required = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'SMTP_ADMIN_EMAIL',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('SMTP_PORT must be a valid TCP port.');
  process.exit(1);
}

const projectRef = process.env.SUPABASE_PROJECT_REF.trim();
if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  console.error('SUPABASE_PROJECT_REF is not a valid Supabase project ref.');
  process.exit(1);
}

const template = await readFile(
  resolve(process.cwd(), 'supabase/templates/customer-confirmation-otp.html'),
  'utf8'
);
if (!template.includes('{{ .Token }}') || template.includes('{{ .ConfirmationURL }}')) {
  console.error('Confirmation template must contain {{ .Token }} and must not contain {{ .ConfirmationURL }}.');
  process.exit(1);
}

const payload = {
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_subjects_confirmation: 'رمز التحقق لحسابك في BURGER HOUSE',
  mailer_templates_confirmation_content: template,
  smtp_admin_email: process.env.SMTP_ADMIN_EMAIL.trim(),
  smtp_host: process.env.SMTP_HOST.trim(),
  smtp_port: port,
  smtp_user: process.env.SMTP_USER.trim(),
  smtp_pass: process.env.SMTP_PASS,
  smtp_sender_name: 'BURGER HOUSE',
};

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const details = await response.text();
  console.error(`Supabase Auth configuration failed (${response.status}): ${details}`);
  process.exit(1);
}

console.log('Supabase Auth configured: email confirmation OTP template + custom SMTP.');
console.log('No access token or SMTP credential values were printed.');
