# Release status

The repository is an executable implementation with persistent backend state. It is **not yet a certified production release**.

## Verified in this workspace

- TypeScript checks for API and mobile app.
- 24 PostgreSQL-engine API integration tests.
- Real browser login and navigation across four tabs.
- Real browser event reservation → development checkout → QR confirmation → cancellation/refund queue.
- Browser map tile loading and clustered pins; leaderboard/profile rendering.
- Clean dependency installation and an audit with zero known vulnerabilities at verification time.
- Web production export and successful iOS/Android Hermes JavaScript/asset exports.

## External release requirements

- Contracted and certified payment acquiring for Lebanon; production merchant credentials and webhook testing. The regional adapter currently defines an executable gateway protocol, not a certified integration with a named Lebanese processor.
- Live payment/refund reconciliation and organizer bank-transfer operating procedures. Payout records are audited manual transfers; automatic payouts are not implemented.
- Email sender verification, production S3/CDN, Redis/PostgreSQL provisioning, production domains and deployment secrets.
- EAS/Apple/Google signing credentials, physical iOS/Android testing, push credentials, app store privacy declarations and distribution.
- Deployment-scale PostgreSQL concurrency/load tests, restore testing, security review and operational monitoring. Docker's daemon was unavailable in this workspace; the separate PostgreSQL CI job has been configured but was not run here.

## Product limits to address before broader rollout

- Auth supports verified email/password. Optional Apple/Google sign-in is not yet wired; no fake social-login buttons are shown.
- Web/native map clustering is implemented; very large map datasets need viewport-based paging rather than the current maximum of 100 returned events.
- Global/city/country rank snapshots and season finalization are implemented. Personalized historical Friends ranking snapshots are not yet generated; missing movement is returned as null.
- Search is functional and parameterized, with recorded recent/trending searches. Full-text ranking, locale-specific tokenization and cursor pagination are scale extensions.
- Attendance/exploration and challenge XP are implemented. Additional configurable streak XP/milestone reward programs require extending the current rules engine; streak challenge progress and streak achievements already work.
- Media uses signed S3 uploads or the isolated local adapter. A production media quarantine/scanning service, private document uploads and provider dispute/chargeback workflows require additional integration.
- Device-level gesture/performance/accessibility testing and verified HTTPS app links remain release work. The current custom deep-link scheme works without pretending that an unconfigured domain is associated.

These limitations are stated explicitly so the implementation is not confused with completed merchant onboarding, native certification or production operations.
