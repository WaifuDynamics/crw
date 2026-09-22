# Visual assets and location sources

CRW+ uses a custom black/white/electric-blue design, a code-native editorial runner illustration in `src/ui.tsx`, and a source-vector app icon in `assets/crw-icon.svg`. Icons use Ionicons/Feather. Typography uses Inter and Barlow Condensed through their font packages (licenses included with those packages).

Development event photography is cached from Unsplash. It illustrates sample experiences and does not document real CRW+ events. Development avatars are sample portraits from Pravatar, not authenticated real member identities. None of this data is inserted into a production database.

| Cached asset | Source |
|---|---|
| `photo-1552674605-db6ffd4facb5.jpg` | `https://images.unsplash.com/photo-1552674605-db6ffd4facb5` |
| `photo-1476480862126-209bfaa8edc8.jpg` | `https://images.unsplash.com/photo-1476480862126-209bfaa8edc8` |
| `photo-1551632811-561732d1e306.jpg` | `https://images.unsplash.com/photo-1551632811-561732d1e306` |
| `photo-1622279457486-62dcc4a431d6.jpg` | `https://images.unsplash.com/photo-1622279457486-62dcc4a431d6` |
| `photo-1506126613408-eca07ce68773.jpg` | `https://images.unsplash.com/photo-1506126613408-eca07ce68773` |
| `photo-1538805060514-97d9cc17730c.jpg` | `https://images.unsplash.com/photo-1538805060514-97d9cc17730c` |
| `photo-1544191696-15693072a251.jpg` | [Cycling photo by Tuvalum](https://unsplash.com/photos/a-group-of-people-riding-bikes-down-a-road-zJo2gl8-GMU); source photo ID `photo-1681295691548-b4dbfbed933b` |

The original cycling URL was unavailable; the cached filename is retained as a stable development media reference. `scripts/cache-demo-media.mjs` records the source mapping and can restore caches. See [Unsplash license](https://unsplash.com/license).

## Discover campaign previews

The Discover carousel uses actual brand-published campaign/product-launch artwork, not generated ads or stock event photos. These are **preview placements**, not paid advertisements, confirmed sponsors, current offers, or CRW+ partnerships. Brand-owned assets remain subject to their owners' rights; obtain approved creative and placement permission before a public/commercial launch. The app links to the source campaigns. Images fill a stable 16:9 panel edge-to-edge; non-widescreen photographs are center-cropped, with small preview and pagination overlays. The Jordan banner's embedded copy fits its native widescreen ratio.

| Local asset in `apps/mobile/assets/ads/` | Campaign source | Original media |
|---|---|---|
| `jordan-our-turn.jpg` | [Jordan: Our Turn (2024)](https://about.nike.com/en/newsroom/releases/with-our-turn-jordan-brand-rallies-the-next-generation-announces-global-one-on-one-tournament/) | Nike Newsroom image `jordan-brand-our-turn-banners-6.jpg`, asset group `c75e5865-31d9-4626-95ab-53ab4b40a34a` on `nmp.about.nike.com` |
| `nike-pegasus-41.jpg` | [Nike Pegasus 41 launch (2024)](https://about.nike.com/en-GB/newsroom/releases/this-summer-the-nike-pegasus-41-gives-runners-more-energy-return-than-ever) | Nike Newsroom image `su24-peg41-volt-womens-hero-re.jpg`, asset group `5593cfa7-39ca-407f-a2f2-4347be5c2d96` on `nmp.about.nike.com` |
| `adidas-crazyquick-product.jpg` | [adidas Crazyquick Lightstrike Padel, JR9325](https://www.adidas.co.za/JR9325.html) | [Official adidas product campaign photo](https://assets.adidas.com/images/w_940%2Cf_auto%2Cq_auto/0ea2deabb99f468680a0ab511f11c0c7_9366/JR9325_HM3_hover.jpg) |

Images retrieved 14 September 2026. Existing `move.jpg`, `crew.jpg`, and `challenge.jpg` remain available for other sample content.

Maps render provider-supplied tiles, not drawn streets. New organizer events require actual latitude/longitude input. Development area coordinates are reference locations, not confirmed commercial meeting points:

- Zaitunay Bay reference: [geotagged Wikimedia photograph](https://commons.wikimedia.org/wiki/File:Zaitunay_Bay_(1).jpg).
- Jabal Moussa reserve reference: [UNESCO reserve coordinates](https://www.unesco.org/en/mab/jabal-moussa).
- Horsh Beirut reference: [Wikidata coordinates](https://www.wikidata.org/wiki/Q2909055).
- Corniche reference: [location reference](https://trek.zone/en/lebanon/places/165386/corniche-beirut).

Production hosts must verify their exact meeting point and venue permission. Sample padel location is explicitly a city-level demonstration, not an invented court or venue.
