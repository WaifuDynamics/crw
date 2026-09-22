// Builds the static parts of crw-plus.com: the legal documents (HTML + Markdown),
// and the machine-readable files search engines and AI agents look for.
//
//   node build.mjs      (from apps/landing)
//
// index.html is hand-written and is never touched here.

import { LEGAL_DOCUMENTS, LEGAL_VERSION } from '../mobile/src/legal/documents.ts';
import { mkdirSync, writeFileSync } from 'node:fs';

const SITE = 'https://crw-plus.com';
const APP = 'https://crw-plus.online';
const TAGLINE = 'Crews, events and real-world fitness';
const BLURB =
  'CRW+ is a social fitness platform built around crews and real-world events: join a crew, meet up at sessions near you, and track every workout with friends.';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const attr = (s) => String(s).replace(/"/g, '&quot;').replace(/[<>]/g, '');

/** First sentence of a document, for its meta description. */
const summary = (body) => {
  const first = body.split(/\n\n/).find((b) => !b.trim().startsWith('##')) || body;
  const s = first.replace(/\s+/g, ' ').trim();
  return s.length > 300 ? s.slice(0, 297).replace(/\s+\S*$/, '') + '…' : s;
};

function bodyToHtml(body) {
  let out = '';
  for (const block of body.split(/\n\n+/)) {
    const t = block.trim();
    if (!t) continue;
    if (t.startsWith('## ')) {
      out += `<h2>${esc(t.slice(3))}</h2>`;
      continue;
    }
    const lines = t.split('\n');
    if (lines.every((l) => l.trim().startsWith('•'))) {
      out += '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^\s*•\s*/, ''))}</li>`).join('') + '</ul>';
      continue;
    }
    out += '<p>' + lines.map(esc).join('<br>') + '</p>';
  }
  return out
    .replace(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi, '<a href="mailto:$1">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

/** The same document as plain Markdown, for AI agents and copy-paste. */
const toMarkdown = (d) =>
  `# ${d.title}\n\n_CRW+ · Last updated: ${d.updated} · ${SITE}/legal/${d.id}/_\n\n` +
  d.body
    .split(/\n\n+/)
    .map((b) => (b.trim().startsWith('•') ? b.split('\n').map((l) => l.replace(/^\s*•\s*/, '- ')).join('\n') : b))
    .join('\n\n') +
  '\n';

const head = ({ title, desc, url, type = 'article' }) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="theme-color" content="#06080B">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="CRW+">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(title)}">
<meta name="twitter:description" content="${attr(desc)}">
<meta name="twitter:image" content="${SITE}/assets/og.png">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">`;

const STYLE = `<style>
:root{--bg:#06080B;--panel:#10141A;--line:#242A33;--ink:#F8FAFC;--muted:#98A2B3;--blue:#168BFF;
 --body:'Inter',-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:var(--body);line-height:1.62;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:28px 22px 80px}
a{color:var(--blue)}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px;gap:16px;flex-wrap:wrap}
.logo{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:800;font-size:30px;letter-spacing:-1px;color:var(--ink);text-decoration:none}
.logo b{color:var(--blue)}
.nav{display:flex;gap:16px;font-size:14px}.nav a{color:var(--muted);text-decoration:none}.nav a:hover{color:var(--ink)}
h1{font-family:'Barlow Condensed',sans-serif;font-style:italic;text-transform:uppercase;font-size:42px;line-height:1.02;margin-bottom:6px}
.upd{color:var(--muted);font-size:13px;margin-bottom:26px}
h2{font-size:17px;margin:28px 0 8px}
p{color:#C4C9D2;font-size:15px;margin:0 0 14px}
ul{margin:0 0 14px 20px}li{color:#C4C9D2;font-size:15px;margin:4px 0}
footer{margin-top:44px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
</style>`;

const page = (d) => {
  const url = `${SITE}/legal/${d.id}/`;
  const title = `${d.title} · CRW+`;
  const desc = summary(d.body);
  return `<!DOCTYPE html><html lang="en"><head>
${head({ title, desc, url })}
<link rel="alternate" type="text/markdown" href="/legal/${d.id}/index.md" title="${attr(d.title)} (Markdown)">
<script type="application/ld+json">
${JSON.stringify(
  {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: d.title,
    url,
    description: desc,
    dateModified: LEGAL_VERSION,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'CRW+', url: SITE + '/' },
    publisher: { '@type': 'Organization', name: 'CRW+', url: SITE + '/' },
  },
  null,
  2,
)}
</script>
${STYLE}</head><body><div class="wrap">
<div class="top"><a class="logo" href="/">CRW<b>+</b></a>
<nav class="nav"><a href="/">Home</a><a href="/#legal">All documents</a><a href="${APP}">Web app</a></nav></div>
<h1>${esc(d.title)}</h1><div class="upd">Last updated: ${esc(d.updated)}</div>
${bodyToHtml(d.body)}
<footer>© ${new Date().getFullYear()} CRW+ · <a href="/">crw-plus.com</a> · <a href="mailto:legal@crw-plus.com">legal@crw-plus.com</a><br>
<a href="/legal/${d.id}/index.md">Markdown version</a></footer>
</div></body></html>`;
};

// --- legal documents -------------------------------------------------------
for (const d of LEGAL_DOCUMENTS) {
  mkdirSync(`legal/${d.id}`, { recursive: true });
  writeFileSync(`legal/${d.id}/index.html`, page(d));
  writeFileSync(`legal/${d.id}/index.md`, toMarkdown(d));
}

// --- robots ----------------------------------------------------------------
writeFileSync(
  'robots.txt',
  `# CRW+ — ${TAGLINE}
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml

# Plain-language summary for AI agents and crawlers:
# ${SITE}/llms.txt
`,
);

// --- sitemap ---------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: `${SITE}/`, pri: '1.0', freq: 'weekly' },
  ...LEGAL_DOCUMENTS.map((d) => ({ loc: `${SITE}/legal/${d.id}/`, pri: '0.6', freq: 'yearly' })),
];
writeFileSync(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`,
  )
  .join('\n')}
</urlset>
`,
);

// --- llms.txt + index.md ---------------------------------------------------
const llms = `# CRW+

> ${BLURB}

CRW+ is a social fitness platform. The product is in active development and is
currently being prepared for a broader release.

## What CRW+ actually does

- **Crews** — join or follow a crew (a training community) and see what it is doing.
- **Events** — real-world sessions you can find and show up to: group runs, rides, hikes.
- **Workout tracking** — over 50 activity types with GPS route, distance, pace and calories,
  synced across your devices.
- **Friends** — add the people you train with, share a leaderboard, and get a nudge when
  one of them starts a session.
- **Health sync** — optional Apple Health and Android Health Connect integration.
- **Rep counting** — the phone camera can count push-ups or squats, including head-to-head
  races. This is one feature among the above, not the main idea of the product.

## Where CRW+ lives

- Website and legal documents: ${SITE}/
- Web app (PWA): ${APP}/
- Android app: https://github.com/ENERQU4489/CRW-plus/releases/latest
- Backend API: https://api.crw-plus.com/v1

## Legal documents (Markdown)

${LEGAL_DOCUMENTS.map((d) => `- [${d.title}](${SITE}/legal/${d.id}/index.md)`).join('\n')}

## Contact

- General support: support@crw-plus.com
- Privacy and personal data: privacy@crw-plus.com
- Legal: legal@crw-plus.com
- Security: security@crw-plus.com
- Business and partnerships: business@crw-plus.com
`;
writeFileSync('llms.txt', llms);
writeFileSync('index.md', llms);

console.log(
  `built: ${LEGAL_DOCUMENTS.length} legal pages (html+md), robots.txt, sitemap.xml (${urls.length} urls), llms.txt, index.md`,
);
