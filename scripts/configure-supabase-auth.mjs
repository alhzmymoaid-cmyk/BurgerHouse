#!/usr/bin/env node
/**
 * Configure hosted Supabase Auth for BURGER HOUSE email OTP.
 *
 * Secrets are read from process.env or the ignored .env.auth-setup file.
 * Never commit that file or print its contents.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRef = 'kgmteyikhadzqbscnlfb';
const envFile = resolve(process.cwd(), '.env.auth-setup');

try {
  const raw = await readFile(envFile, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith('#')) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const template = await readFile(
  resolve(process.cwd(), 'supabase/templates/customer-confirmation-otp.html'),
  'utf8'
);
if (!template.includes('{{ .Token }}') || template.includes('{{ .ConfirmationURL }}')) {
  console.error('Invalid OTP template: it must contain {{ .Token }} and must not contain {{ .ConfirmationURL }}.');
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT || '465');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('SMTP_PORT must be a valid TCP port.');
  process.exit(1);
}

const senderEmail = (process.env.SMTP_ADMIN_EMAIL || '').trim();
if (senderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)) {
  console.error('SMTP_ADMIN_EMAIL must be a valid sender email address.');
  process.exit(1);
}

const payload = {
  external_email_enabled: true,
  mailer_autoconfirm: false,
  mailer_otp_length: 6,
  mailer_otp_exp: 600,
  smtp_max_frequency: 60,
  mailer_subjects_confirmation: 'رمز التحقق لحسابك في BURGER HOUSE',
  mailer_templates_confirmation_content: template,
  smtp_admin_email: senderEmail,
  smtp_host: (process.env.SMTP_HOST || 'smtp.resend.com').trim(),
  smtp_port: String(port),
  smtp_user: (process.env.SMTP_USER || 'resend').trim(),
  smtp_pass: (process.env.SMTP_PASS || '').trim(),
  smtp_sender_name: 'BURGER HOUSE',
};

const missing = ['SUPABASE_ACCESS_TOKEN', 'SMTP_ADMIN_EMAIL', 'SMTP_PASS']
  .filter((key) => !process.env[key]?.trim());

if (process.argv.includes('--dry-run')) {
  console.log('OTP template validation passed.');
  console.log('Target project: ' + projectRef);
  console.log('Email OTP: 6 digits; expiry: 10 minutes; resend interval: 60 seconds.');
  console.log('SMTP host: ' + payload.smtp_host + '; port: ' + payload.smtp_port + '; username: ' + payload.smtp_user);
  console.log('Secrets present: ' + (missing.length === 0 ? 'yes' : 'no (configuration not applied)'));
  if (missing.length) console.log('Missing values: ' + missing.join(', '));
  process.exit(0);
}

if (missing.length) {
  console.error('Missing required values in environment or .env.auth-setup: ' + missing.join(', '));
  process.exit(1);
}

if (/example\.com|yourdomain/i.test(senderEmail)) {
  console.error('Replace the example sender with an address on a domain verified by your SMTP provider.');
  process.exit(1);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN.trim()}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  console.error(`Supabase Auth configuration failed (HTTP ${response.status}). Check the Management API token, verified sender domain, and SMTP credentials in the provider dashboard.`);
  process.exit(1);
}

const verifyResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN.trim()}` },
});
if (verifyResponse.ok) {
  const config = await verifyResponse.json();
  const valid = config.external_email_enabled === true
    && config.mailer_autoconfirm === false
    && Number(config.mailer_otp_length) === 6
    && config.smtp_host === payload.smtp_host
    && Number(config.smtp_port) === port
    && config.mailer_templates_confirmation_content?.includes('{{ .Token }}');
  if (!valid) {
    console.error('Supabase accepted the update, but read-back verification did not match all expected settings.');
    process.exit(1);
  }
  console.log('Supabase Auth configured and verified: branded 6-digit email OTP + custom SMTP.');
} else {
  console.log('Supabase Auth update accepted. Read-back verification was unavailable; verify settings in Supabase Dashboard.');
}
console.log('No access token or SMTP credential values were printed.');
