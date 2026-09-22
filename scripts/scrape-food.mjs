import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';

const stores = [
  { id: 'salata', name: 'SALATA', area: 'Beirut, Lebanon', specialty: 'Salads, warm bowls & sandwiches', sourceUrl: 'https://salata.co/menu' },
  { id: 'bocafe', name: 'BôCafé', area: 'Corniche El Mazraa, Beirut', specialty: 'Breakfast, protein bowls & balanced plates', sourceUrl: 'https://gymbo.com/bocafe' },
  { id: 'slice', name: 'Slice & Bowl', area: 'Bliss Street, Beirut', specialty: 'Grilled chicken & beef bowls', sourceUrl: 'https://www.sliceandbowl.com/menu' },
];
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage();
  const items = [];
  for (const store of stores) {
    const response = await fetch(store.sourceUrl, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`${store.name}: HTTP ${response.status}`);
    const html = await response.text();
    // Inert DOM parsing: scripts from the restaurant are never executed.
    const parsed = await page.evaluate(({ html, store }) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
      const slug = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const nutrition = (v) => {
        const cal = v.match(/(?:calories:\s*|^)(\d+(?:\.\d+)?)/i);
        const protein = v.match(/(?:protein:\s*(\d+(?:\.\d+)?)\s*g?|(\d+(?:\.\d+)?)g\s*protein)/i);
        return { calories: cal ? Number(cal[1]) : null, proteinGrams: protein ? Number(protein[1] || protein[2]) : null };
      };
      if (store.id === 'salata') {
        const context = JSON.parse(doc.querySelector('.product-list').getAttribute('data-context'));
        return context.items.filter((i) => !/DRESSING|SUN SALUTATION|GREEN MADNESS|PINK BASIL|KISS THE BERRY|CHOCO MONKEY/i.test(i.title)).map((i) => {
          const description = new DOMParser().parseFromString(i.description.replace(/<br\s*\/?>|<\/p>/gi, '\n'), 'text/html').body.textContent;
          const regular = description.match(/Regular\s+calories:[^\n]+/i)?.[0] || '';
          const category = /SANDWICH/i.test((i.tags || []).join(' ')) ? 'Sandwiches' : /YOGURT|ACAI|EGG AVOCADO/i.test(i.title) ? 'Breakfast' : /BOWL|FREEKEH/i.test(i.title) ? 'Bowls' : 'Salads';
          return { id: `${store.id}-${i.id}`, storeId: store.id, name: i.title, category,
            priceLabel: i.price?.currency === 'USD' ? `$${Number(i.price.value).toFixed(2)}` : null,
            imageUrl: i.mainImage?.assetUrl ? `${i.mainImage.assetUrl}?format=750w` : null,
            sourceUrl: new URL(i.fullUrl, store.sourceUrl).href,
            ...nutrition(regular), nutritionBasis: regular ? 'Regular serving' : null };
        });
      }
      if (store.id === 'bocafe') {
        const categories = { 'balanced-mornings': 'Breakfast', 'nourish-bowls': 'Bowls', salads: 'Salads', 'smart-sandwiches': 'Sandwiches', 'mindful-platters': 'Platters' };
        return [...doc.querySelectorAll('[data-cafe-panel]')].flatMap((section) => {
          const category = categories[section.getAttribute('data-cafe-panel')];
          if (!category) return [];
          return [...section.querySelectorAll('.cafe-item')].map((i) => {
            const name = clean(i.querySelector('.cafe-name')?.textContent);
            const raw = clean(i.querySelector('.cafe-nutrition')?.textContent);
            const single = /^\d/.test(raw);
            const prices = [...i.querySelectorAll('b, .cafe-variant')].map((p) => clean(p.textContent)).filter((p) => p.includes('$'));
            return { id: `${store.id}-${slug(name)}`, storeId: store.id, name, category,
              priceLabel: prices.join(' / ') || null, imageUrl: i.querySelector('img')?.getAttribute('src') || null,
              sourceUrl: store.sourceUrl, ...(single ? nutrition(raw) : { calories: null, proteinGrams: null }),
              nutritionBasis: single ? 'Listed serving' : null };
          });
        });
      }
      const menu = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent)).find((s) => s['@type'] === 'Menu');
      return menu.hasMenuSection.find((s) => s.name === 'Signature Bowls').hasMenuItem.map((i) => {
        const card = [...doc.querySelectorAll('article')].find((c) => clean(c.querySelector('h3')?.textContent) === i.name);
        const figures = [...(card?.querySelectorAll('dd') || [])].map((el) => clean(el.textContent));
        return { id: `${store.id}-${slug(i.name)}`, storeId: store.id, name: i.name, category: 'Bowls',
          priceLabel: `$${Number(i.offers.price).toFixed(2)}`,
          imageUrl: card?.querySelector('img') ? new URL(card.querySelector('img').getAttribute('src'), store.sourceUrl).href : null,
          sourceUrl: new URL(card?.querySelector('h3 a')?.getAttribute('href') || '/menu', store.sourceUrl).href,
          calories: figures[0] ? parseFloat(figures[0]) : null, proteinGrams: figures[1] ? parseFloat(figures[1]) : null,
          nutritionBasis: 'Standard bowl' };
      });
    }, { html, store });
    if (parsed.length < 3) throw new Error(`${store.name}: menu structure changed; previous snapshot retained.`);
    for (const i of parsed) {
      if (!i.name || !i.id || !i.sourceUrl.startsWith('https://')) throw new Error('Invalid menu item');
      for (const v of [i.calories, i.proteinGrams]) if (v !== null && (!Number.isFinite(v) || v < 0)) throw new Error(`Invalid nutrition: ${i.name}`);
    }
    items.push(...parsed);
    console.log(`${store.name}: ${parsed.length} menu items`);
  }
  if (new Set(items.map((i) => i.id)).size !== items.length) throw new Error('Duplicate menu IDs');
  await mkdir('apps/mobile/src/content', { recursive: true });
  const destination = 'apps/mobile/src/content/food-catalog.json';
  await writeFile(`${destination}.tmp`, JSON.stringify({ updatedAt: new Date().toISOString(), stores, items }, null, 2) + '\n');
  await rename(`${destination}.tmp`, destination);
  console.log(`Saved ${items.length} items from ${stores.length} restaurants.`);
} finally { await browser.close(); }
