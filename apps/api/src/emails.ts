import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

// Branded HTML emails. Email clients ignore most modern CSS, so the layout is tables
// with inline styles, web-safe font stacks and a plain-text twin for every message.

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

// Light, simple palette: renders the same everywhere (including Proton and mobile),
// no dark-mode fragility. Names kept so existing call sites still map sensibly.
const BRAND = {
  bg: '#EEF1F4', // page background
  panel: '#FFFFFF', // the card
  panel2: '#F5F7F9', // soft inner boxes
  line: '#E4E8EC',
  ink: '#1A1D23', // headings
  text: '#4A515C', // body copy
  muted: '#8B929E', // footer / fine print
  blue: '#0F73E6',
  green: '#1E8E50',
};
// One safe system font stack everywhere. Web fonts do not load in email clients, so
// the old condensed/italic display font only ever showed an ugly fallback.
const DISPLAY = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const BODY = DISPLAY;

export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );

const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? escapeHtml(url) : '#');

export function button(label: string, url: string, color = BRAND.blue) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">
  <tr><td bgcolor="${color}" style="border-radius:8px;">
    <a href="${safeUrl(url)}" target="_blank" style="display:inline-block;padding:13px 24px;font-family:${BODY};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

export const eyebrow = (text: string, color = BRAND.blue) =>
  `<p style="margin:0 0 8px;font-family:${BODY};font-size:12px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${color};">${escapeHtml(text)}</p>`;

export const headline = (text: string, accent?: string) =>
  `<h1 style="margin:0 0 12px;font-family:${DISPLAY};font-size:23px;line-height:30px;font-weight:700;color:${BRAND.ink};">${escapeHtml(text)}${accent ? ` <span style="color:${BRAND.blue};">${escapeHtml(accent)}</span>` : ''}</h1>`;

export const paragraph = (text: string) =>
  `<p style="margin:0 0 18px;font-family:${BODY};font-size:15px;line-height:23px;color:${BRAND.text};">${escapeHtml(text)}</p>`;

export const small = (text: string) =>
  `<p style="margin:14px 0 0;font-family:${BODY};font-size:13px;line-height:20px;color:${BRAND.muted};">${text}</p>`;

export const sectionTitle = (text: string) =>
  `<h2 style="margin:26px 0 12px;font-family:${DISPLAY};font-size:13px;line-height:18px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(text)}</h2>`;

/** A small row of numbers, e.g. lifetime reps / best set / wins. */
export function stats(items: { label: string; value: string | number; color?: string }[]) {
  const cells = items
    .map(
      (s) => `<td width="${Math.floor(100 / items.length)}%" valign="top" style="padding:14px 12px;background:${BRAND.panel2};border:1px solid ${BRAND.line};border-radius:10px;">
        <div style="font-family:${BODY};font-size:11px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(s.label)}</div>
        <div style="margin-top:4px;font-family:${BODY};font-size:22px;line-height:26px;font-weight:700;color:${s.color || BRAND.ink};">${escapeHtml(s.value)}</div>
      </td>`,
    )
    .join('<td width="8" style="font-size:0;line-height:0;">&nbsp;</td>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

/** A simple activity row: when, title, place and price. */
export function eventCard(e: {
  title: string;
  when: string;
  place: string;
  price: string;
  url: string;
  cover?: string | null;
}) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;background:${BRAND.panel2};border:1px solid ${BRAND.line};border-radius:10px;">
  <tr><td style="padding:14px 16px;">
    <div style="font-family:${BODY};font-size:12px;font-weight:600;letter-spacing:0.3px;text-transform:uppercase;color:${BRAND.green};">${escapeHtml(e.when)}</div>
    <a href="${safeUrl(e.url)}" target="_blank" style="display:block;margin:5px 0 3px;font-family:${DISPLAY};font-size:17px;line-height:22px;font-weight:700;color:${BRAND.ink};text-decoration:none;">${escapeHtml(e.title)}</a>
    <div style="font-family:${BODY};font-size:13px;line-height:19px;color:${BRAND.muted};">${escapeHtml(e.place)} &middot; ${escapeHtml(e.price)}</div>
  </td></tr></table>`;
}

/** The shared frame: dark background, CRW+ wordmark, one content card, footer. */
export function layout(opts: { preheader: string; body: string; footer?: string }) {
  const host = escapeHtml(new URL(config.appUrl).host);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>CRW+</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BRAND.bg};">${escapeHtml(opts.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}" style="background:${BRAND.bg};">
<tr><td align="center" style="padding:24px 12px 32px;">
  <!-- A single light card, one column, generous spacing: renders the same on desktop and
       mobile with no dark-mode surprises. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.panel}" style="max-width:460px;width:100%;background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:14px;">
    <tr><td style="padding:22px 24px 4px;">
      <a href="${safeUrl(config.appUrl)}" target="_blank" style="font-family:${DISPLAY};font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${BRAND.ink};text-decoration:none;">CRW<span style="color:${BRAND.blue};">+</span></a>
    </td></tr>
    <tr><td style="padding:16px 24px 24px;">
      ${opts.body}
    </td></tr>
    <tr><td style="border-top:1px solid ${BRAND.line};padding:18px 24px 22px;font-family:${BODY};font-size:12px;line-height:19px;color:${BRAND.muted};text-align:center;">
      ${opts.footer || ''}
      <div style="margin-top:${opts.footer ? '10px' : '0'};">CRW+ &middot; Get out. Get going. &middot; <a href="${safeUrl(config.appUrl)}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">${host}</a></div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const transactionalFooter =
  'You received this email because of activity on your CRW+ account. It is a service message, not marketing.';

// --- transactional ---

export function verifyEmail(link: string, name?: string): EmailContent {
  const hi = name ? `Welcome, ${name}.` : 'Welcome to CRW+.';
  return {
    subject: 'Verify your CRW+ email',
    text: `${hi}\n\nConfirm your email to book activities and join the crew:\n${link}\n\nThe link is valid for 24 hours. If you didn't sign up, ignore this email.`,
    html: layout({
      preheader: 'One tap and you’re in. Confirm your email to start booking.',
      body:
        eyebrow('One last step') +
        headline('You’re almost', 'in.') +
        paragraph(
          `${hi} Confirm your email so you can book activities, join crews and keep your wins.`,
        ) +
        button('Verify my email', link) +
        small(
          `The link is valid for 24 hours. If you didn’t create a CRW+ account, you can safely ignore this email.<br><br>Button not working? Paste this into your browser:<br><a href="${safeUrl(link)}" style="color:${BRAND.blue};word-break:break-all;">${escapeHtml(link)}</a>`,
        ),
      footer: transactionalFooter,
    }),
  };
}

export function resetPassword(link: string): EmailContent {
  return {
    subject: 'Reset your CRW+ password',
    text: `Someone asked to reset the password for your CRW+ account.\n\nChoose a new password:\n${link}\n\nThe link is valid for 1 hour. If it wasn't you, ignore this email - your password stays the same.`,
    html: layout({
      preheader: 'Choose a new password. The link is valid for one hour.',
      body:
        eyebrow('Account security') +
        headline('New password,', 'same you.') +
        paragraph(
          'Someone asked to reset the password for your CRW+ account. Tap below to choose a new one.',
        ) +
        button('Choose a new password', link) +
        small(
          `The link is valid for 1 hour. If this wasn’t you, ignore this email – your password stays the same.<br><br>Button not working? Paste this into your browser:<br><a href="${safeUrl(link)}" style="color:${BRAND.blue};word-break:break-all;">${escapeHtml(link)}</a>`,
        ),
      footer: transactionalFooter,
    }),
  };
}

export function invitation(link: string, name?: string, from?: string): EmailContent {
  const hi = name ? `Hi ${name},` : 'Hi,';
  const who = from ? `${from} made you` : 'Someone made you';
  return {
    subject: 'Your CRW+ account is ready',
    text: `${hi}

${who} a CRW+ account. Choose a password to sign in:
${link}

The link is valid for 7 days.`,
    html: layout({
      preheader: 'Choose a password and your CRW+ account is yours.',
      body:
        eyebrow('Welcome aboard') +
        headline('Your account', 'is ready.') +
        paragraph(`${hi} ${who} a CRW+ account. Choose a password and it is yours.`) +
        button('Choose my password', link) +
        small(
          `The link is valid for 7 days. If you were not expecting this, you can ignore this email.<br><br>Button not working? Paste this into your browser:<br><a href="${safeUrl(link)}" style="color:${BRAND.blue};word-break:break-all;">${escapeHtml(link)}</a>`,
        ),
      footer: transactionalFooter,
    }),
  };
}

export function bookingConfirmed(b: {
  bookingId: string;
  title: string;
  when: string;
  place: string;
  total: string;
}): EmailContent {
  const link = `${config.appUrl}/booking/${b.bookingId}`;
  return {
    subject: `You're on the list: ${b.title}`,
    text: `You're on the list.\n\n${b.title}\n${b.when}\n${b.place}\nTotal: ${b.total}\n\nYour QR ticket is in CRW+: ${link}\nBooking ${b.bookingId}`,
    html: layout({
      preheader: `${b.title} · ${b.when}. Your ticket is ready.`,
      body:
        eyebrow('Booking confirmed', BRAND.green) +
        headline('You’re on', 'the list.') +
        paragraph('Your ticket is ready. Show the QR code in CRW+ when you arrive.') +
        eventCard({ title: b.title, when: b.when, place: b.place, price: b.total, url: link }) +
        button('Open my ticket', link) +
        small(`Booking reference: ${escapeHtml(b.bookingId)}`),
      footer: transactionalFooter,
    }),
  };
}

// --- marketing ---

const secretKey = () => `${config.secret}:email-unsubscribe`;

/** A stateless, per-user unsubscribe token: `<userId>.<mac>`. */
export function unsubscribeToken(userId: string) {
  const mac = createHmac('sha256', secretKey()).update(userId).digest('base64url').slice(0, 32);
  return `${userId}.${mac}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [userId, mac] = String(token || '').split('.');
  if (!userId || !mac || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const expected = unsubscribeToken(userId).split('.')[1];
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}

export const unsubscribeUrl = (userId: string) =>
  `${config.apiUrl}/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken(userId))}`;

export type DigestData = {
  userId: string;
  firstName: string;
  challenge: { title: string; body: string };
  events: {
    title: string;
    when: string;
    place: string;
    price: string;
    url: string;
    cover?: string | null;
  }[];
  solo: { reps: number; bestSet: number };
  wins: number;
  date: string;
};

export function dailyDigest(d: DigestData): EmailContent {
  const unsub = unsubscribeUrl(d.userId);
  const hello = d.firstName ? `Morning, ${d.firstName}.` : 'Good morning.';
  const playUrl = `${config.appUrl}/play`;
  const eventsHtml = d.events.length
    ? sectionTitle('Worth getting out for') +
      d.events.map(eventCard).join('') +
      `<p style="margin:4px 0 0;font-family:${BODY};font-size:13px;"><a href="${safeUrl(config.appUrl)}" target="_blank" style="color:${BRAND.blue};text-decoration:none;font-weight:700;">See everything on CRW+ &rarr;</a></p>`
    : '';
  const record =
    d.solo.reps || d.wins
      ? sectionTitle('Your record so far') +
        stats([
          { label: 'Lifetime reps', value: d.solo.reps.toLocaleString('en'), color: BRAND.blue },
          { label: 'Best set', value: d.solo.bestSet || '—' },
          { label: 'Wins', value: d.wins, color: BRAND.green },
        ])
      : '';
  const eventsText = d.events.length
    ? `\n\nWORTH GETTING OUT FOR\n${d.events.map((e) => `- ${e.title} · ${e.when} · ${e.place} · ${e.price}\n  ${e.url}`).join('\n')}`
    : '';
  return {
    subject: `${d.challenge.title} · your CRW+ day`,
    text: `${hello}\n\nTODAY'S CHALLENGE: ${d.challenge.title}\n${d.challenge.body}\nStart it: ${playUrl}${eventsText}\n\nLifetime reps: ${d.solo.reps} · Best set: ${d.solo.bestSet || '-'} · Wins: ${d.wins}\n\nYou get this once a day because you opted in to CRW+ updates.\nUnsubscribe: ${unsub}`,
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: layout({
      preheader: `Today’s challenge: ${d.challenge.title}. ${d.challenge.body}`,
      body:
        eyebrow(`Your CRW+ day · ${d.date}`) +
        headline(hello.replace(/\.$/, '') + '.') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 4px;background:${BRAND.panel2};border:1px solid ${BRAND.line};border-radius:10px;">
          <tr><td style="padding:16px 18px 16px;">
            ${eyebrow("Today's challenge", BRAND.green)}
            <div style="font-family:${DISPLAY};font-size:19px;line-height:24px;font-weight:700;color:${BRAND.ink};">${escapeHtml(d.challenge.title)}</div>
            <p style="margin:6px 0 14px;font-family:${BODY};font-size:14px;line-height:21px;color:${BRAND.text};">${escapeHtml(d.challenge.body)}</p>
            ${button('Start the challenge', playUrl)}
          </td></tr></table>` +
        record +
        eventsHtml,
      footer: `You get this at most once a day because you opted in to CRW+ updates.<br><a href="${safeUrl(unsub)}" target="_blank" style="color:${BRAND.ink};font-weight:600;text-decoration:underline;">Unsubscribe</a> &middot; <a href="${safeUrl(`${config.appUrl}/settings`)}" target="_blank" style="color:${BRAND.muted};text-decoration:underline;">Email settings</a>`,
    }),
  };
}

/** A gentle nudge for people who opted in but have not trained in a while. */
export function comeBackReminder(d: { userId: string; firstName: string; days: number }): EmailContent {
  const unsub = unsubscribeUrl(d.userId);
  const hi = d.firstName ? `Hey ${d.firstName},` : 'Hey,';
  const playUrl = `${config.appUrl}/play`;
  return {
    subject: `Your CRW+ streak is waiting`,
    text: `${hi}\n\nIt has been ${d.days} days. No pressure — a single set still counts. Pick up where you left off: ${playUrl}\n\nYou get this because you opted in to CRW+ updates.\nUnsubscribe: ${unsub}`,
    headers: {
      'List-Unsubscribe': `<${unsub}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: layout({
      preheader: 'A few reps still count. Pick up where you left off.',
      body:
        eyebrow('We saved your spot', BRAND.green) +
        headline('Ready when', 'you are.') +
        paragraph(
          `${hi} it has been ${d.days} days since your last session. No pressure — one set is a win. Start today’s challenge and get the streak moving again.`,
        ) +
        button('Start a quick session', playUrl),
      footer: `You get this because you opted in to CRW+ updates.<br><a href="${safeUrl(unsub)}" target="_blank" style="color:${BRAND.ink};font-weight:700;">Unsubscribe</a> &middot; <a href="${safeUrl(`${config.appUrl}/settings`)}" target="_blank" style="color:${BRAND.muted};">Email settings</a>`,
    }),
  };
}

export function unsubscribeConfirmPage(token: string) {
  return layout({
    preheader: '',
    body:
      eyebrow('Email settings') +
      headline('Stop the', 'daily emails?') +
      paragraph(
        'You will stop getting the daily CRW+ digest. Account emails like password resets and tickets still arrive.',
      ) +
      `<form method="POST" action="/email/unsubscribe" style="margin:8px 0 0;">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <button type="submit" style="background:${BRAND.blue};color:#FFFFFF;border:0;border-radius:14px;padding:15px 28px;font-family:${BODY};font-size:15px;font-weight:700;cursor:pointer;">Unsubscribe</button>
      </form>` +
      small(
        `Changed your mind? <a href="${safeUrl(config.appUrl)}" style="color:${BRAND.blue};">Go back to CRW+</a>.`,
      ),
  });
}

export function unsubscribedPage(ok: boolean) {
  return layout({
    preheader: '',
    body: ok
      ? eyebrow('Done', BRAND.green) +
        headline('You’re', 'unsubscribed.') +
        paragraph(
          'No more daily CRW+ updates. Account emails like password resets and tickets still arrive.',
        ) +
        button('Back to CRW+', config.appUrl) +
        small('Changed your mind? Turn updates back on in your CRW+ settings.')
      : eyebrow('Link problem', '#FF8A8A') +
        headline('That link', 'didn’t work.') +
        paragraph(
          'The unsubscribe link is incomplete or invalid. You can switch off updates in your CRW+ settings.',
        ) +
        button('Open settings', `${config.appUrl}/settings`),
  });
}

// --- account deletion ---

const DANGER = '#FF5A5F';

export function deleteAccountEmail(link: string, name?: string): EmailContent {
  const hi = name ? `Hi ${name},` : 'Hi,';
  return {
    subject: 'Confirm deleting your CRW+ account',
    text: `${hi}\n\nSomeone asked to delete your CRW+ account. To confirm, open this link and press the button:\n${link}\n\nThe link is valid for 1 hour. If this wasn't you, ignore this email and consider changing your password - nothing will be deleted.`,
    html: layout({
      preheader: 'Confirm with the button inside. The link is valid for one hour.',
      body:
        eyebrow('Account deletion', DANGER) +
        headline('Leaving', 'CRW+?') +
        paragraph(
          `${hi} someone asked to delete your CRW+ account. Confirm below and we will remove your profile, activity history and personal details.`,
        ) +
        button('Confirm account deletion', link, DANGER) +
        small(
          `The link is valid for 1 hour. <b style="color:${BRAND.ink};">If this wasn’t you, ignore this email</b> – nothing will be deleted – and consider changing your password.<br><br>Some records, like payments and attendance, are kept where the law or platform integrity requires it.`,
        ),
      footer:
        'You received this email because an account deletion was requested for this address. It is a service message, not marketing.',
    }),
  };
}

export function deleteConfirmPage(token: string, maskedEmail: string) {
  return layout({
    preheader: '',
    body:
      eyebrow('Last step', DANGER) +
      headline('Delete your', 'account?') +
      paragraph(
        `This permanently deletes the CRW+ account for ${maskedEmail}: your profile, wins, records and personal details. You will be signed out everywhere. This can’t be undone.`,
      ) +
      `<form method="POST" action="/account/delete/confirm" style="margin:8px 0 0;">
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <button type="submit" style="background:${DANGER};color:#FFFFFF;border:0;border-radius:14px;padding:15px 28px;font-family:${BODY};font-size:15px;font-weight:700;cursor:pointer;">Yes, delete my account</button>
      </form>` +
      small(
        `Changed your mind? Just close this page, or <a href="${safeUrl(config.appUrl)}" style="color:${BRAND.blue};">go back to CRW+</a>.`,
      ),
  });
}

export function accountDeletedPage() {
  return layout({
    preheader: '',
    body:
      eyebrow('Done', BRAND.green) +
      headline('Your account', 'is deleted.') +
      paragraph(
        'Thanks for moving with us. You have been signed out on every device. You can create a new account any time.',
      ) +
      button('Back to CRW+', config.appUrl),
  });
}

export function deleteLinkProblemPage(reason?: string) {
  return layout({
    preheader: '',
    body:
      eyebrow('Link problem', DANGER) +
      headline('That link', 'didn’t work.') +
      paragraph(
        reason ||
          'The link is invalid, already used or older than one hour. Request a new one from Settings in CRW+.',
      ) +
      button('Open CRW+', config.appUrl),
  });
}
