import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

// The key belongs in the environment, never in the repository:
//   RESEND_API_KEY=... node scripts/send-test-email.mjs
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('Set RESEND_API_KEY before running this script.');
  process.exit(1);
}
const toEmail = 'michal.trojanowski.2009@gmail.com';
const fromEmail = 'CRW+ <no-reply@sport.konekocode.pl>';
const subject = 'Test notification from CRW+ Fitness App';

const BRAND = {
  bg: '#08090B',
  panel: '#17191D',
  panel2: '#22252A',
  line: '#2B2E34',
  ink: '#F7F8FA',
  muted: '#969AA3',
  blue: '#168BFF',
  green: '#A9F06A',
};
const DISPLAY = `'Barlow Condensed','Arial Narrow',Impact,'Helvetica Neue',Arial,sans-serif`;
const BODY = `Inter,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CRW+ Test</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:${BODY};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}">
<tr><td align="center" style="padding:32px 14px 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 6px 20px;">
      <span style="font-family:${DISPLAY};font-size:36px;line-height:36px;font-weight:800;font-style:italic;color:${BRAND.ink};letter-spacing:-1px;">CRW<span style="color:${BRAND.blue};">+</span></span>
    </td></tr>
    <tr><td bgcolor="${BRAND.panel}" style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:24px;padding:36px 30px;">
      <p style="margin:0 0 10px;font-family:${BODY};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${BRAND.green};">System Notification</p>
      <h1 style="margin:0 0 16px;font-family:${DISPLAY};font-size:40px;line-height:42px;font-weight:800;font-style:italic;text-transform:uppercase;color:${BRAND.ink};">Test email from <span style="color:${BRAND.blue};">CRW+</span></h1>
      <p style="margin:0 0 18px;font-family:${BODY};font-size:15px;line-height:24px;color:${BRAND.muted};">
        Hi Michal,<br><br>
        This is a test email sent directly from your <strong>CRW+ Fitness App</strong> stack to verify that transactional email delivery, DNS SPF/DKIM authentication, and template styling are working properly.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 12px;">
        <tr><td bgcolor="${BRAND.blue}" style="border-radius:14px;">
          <a href="https://sport.konekocode.pl" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${BODY};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:14px;">Open CRW+ Web &rarr;</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-family:${BODY};font-size:12px;line-height:19px;color:${BRAND.muted};">
        Server stack: Dell PowerEdge R630 &middot; Fastify API &middot; PostgreSQL 17 &middot; Resend
      </p>
    </td></tr>
    <tr><td style="padding:22px 8px 0;font-family:${BODY};font-size:12px;line-height:19px;color:${BRAND.muted};text-align:center;">
      CRW+ &middot; Get out. Get going. &middot; <a href="https://sport.konekocode.pl" style="color:${BRAND.muted};">sport.konekocode.pl</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

const text = `Hi Michal,

This is a test email sent from your CRW+ Fitness App stack to verify that email delivery, DNS records, and transactional notification templates are working properly.

Server stack: Dell PowerEdge R630 / Fastify / PostgreSQL / Resend
App URL: https://sport.konekocode.pl

CRW+ Team`;

async function main() {
  console.log(`Sending test email to ${toEmail} from ${fromEmail}...`);
  const sendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: html,
      text: text
    })
  });

  const sendData = await sendRes.json();
  console.log('Resend Response status:', sendRes.status);
  console.log('Resend Response body:', sendData);

  if (sendRes.ok) {
    const pg = new PGlite('./apps/api/data/pace');
    const jobId = randomUUID();
    await pg.query(
      `INSERT INTO notification_outbox(id, kind, payload, status, attempts, last_error, available_at, created_at)
       VALUES($1, 'email', $2, 'sent', 1, NULL, now(), now())`,
      [
        jobId,
        JSON.stringify({ to: toEmail, subject, text, resendId: sendData.id })
      ]
    );
    console.log('Successfully recorded in local notification_outbox with id:', jobId);
    await pg.close();
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
