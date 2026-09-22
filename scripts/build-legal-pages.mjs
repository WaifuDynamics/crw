import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'apps', 'mobile', 'public');
const distDir = path.join(rootDir, 'apps', 'mobile', 'dist');

// Shared stylesheet and layout for all legal & policy pages
function renderPage({ title, badge = 'Legal & Policies', updated = 'September 17, 2026', content, extraHead = '', extraScripts = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · CRW+</title>
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  ${extraHead}
  <style>
    :root {
      color-scheme: dark light;
      --bg: #08090B;
      --card-bg: #12141A;
      --card-border: #232733;
      --ink: #F7F8FA;
      --muted: #969AA3;
      --blue: #168BFF;
      --blue-hover: #0077F0;
      --line: #2B2E34;
      --danger: #EF4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --warning: #F59E0B;
      --warning-bg: rgba(245, 158, 11, 0.12);
      --success: #10B981;
      --success-bg: rgba(16, 185, 129, 0.12);
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #F8F9FA;
        --card-bg: #FFFFFF;
        --card-border: #E5E7EB;
        --ink: #111827;
        --muted: #4B5563;
        --line: #E5E7EB;
        --danger-bg: #FEE2E2;
        --warning-bg: #FEF3C7;
        --success-bg: #D1FAE5;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 16px/1.65 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    }
    main {
      max-width: 820px;
      margin: 0 auto;
      padding: 36px 20px 80px;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: var(--ink);
      font-weight: 700;
      font-size: 20px;
    }
    .brand img {
      width: 38px;
      height: 38px;
      border-radius: 10px;
    }
    .badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 10px;
      border-radius: 9999px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--blue);
    }
    h1 {
      font-size: 32px;
      line-height: 1.25;
      margin: 0 0 8px;
    }
    h2 {
      font-size: 21px;
      margin: 36px 0 12px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
    }
    h3 {
      font-size: 17px;
      margin: 20px 0 8px;
    }
    p, li {
      margin: 0 0 12px;
      color: var(--ink);
    }
    .updated {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 24px;
    }
    a {
      color: var(--blue);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 22px;
      margin: 8px 0 16px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .callout {
      border-radius: 10px;
      padding: 16px 20px;
      margin: 20px 0;
      font-size: 15px;
    }
    .callout-important {
      background: var(--danger-bg);
      border-left: 4px solid var(--danger);
    }
    .callout-warning {
      background: var(--warning-bg);
      border-left: 4px solid var(--warning);
    }
    .callout-info {
      background: var(--card-bg);
      border-left: 4px solid var(--blue);
      border: 1px solid var(--card-border);
      border-left-width: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 24px 0;
      font-size: 14.5px;
    }
    th, td {
      text-align: left;
      padding: 12px 14px;
      border: 1px solid var(--line);
    }
    th {
      background: var(--card-bg);
      font-weight: 600;
    }
    tr:nth-child(even) td {
      background: rgba(255, 255, 255, 0.02);
    }
    .btn {
      display: inline-block;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
    }
    .btn-primary {
      background: var(--blue);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--blue-hover);
      text-decoration: none;
    }
    .btn-danger {
      background: var(--danger);
      color: #fff;
    }
    .btn-danger:hover {
      opacity: 0.9;
      text-decoration: none;
    }
    .btn-outline {
      background: transparent;
      border-color: var(--line);
      color: var(--ink);
    }
    .btn-outline:hover {
      border-color: var(--blue);
      color: var(--blue);
      text-decoration: none;
    }
    footer {
      margin-top: 64px;
      padding-top: 32px;
      border-top: 1px solid var(--line);
      font-size: 14px;
      color: var(--muted);
    }
    .footer-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }
    .footer-col h4 {
      margin: 0 0 12px;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--ink);
    }
    .footer-col a {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 13.5px;
    }
    .footer-col a:hover {
      color: var(--blue);
    }
    .footer-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main>
    <header>
      <a href="/" class="brand">
        <img src="/icons/icon-192.png" alt="CRW+ Logo" onerror="this.style.display='none'">
        <span>CRW+</span>
      </a>
      <span class="badge">${badge}</span>
    </header>

    <h1>${title}</h1>
    <div class="updated">Last updated: ${updated} · Effective immediately</div>

    ${content}

    <footer>
      <div class="footer-grid">
        <div class="footer-col">
          <h4>Legal &amp; Operator</h4>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/legal">Legal / Operator Info</a>
          <a href="/data-safety">Data Safety Summary</a>
          <a href="/children-safety">Children's Safety (13+)</a>
        </div>
        <div class="footer-col">
          <h4>Community &amp; Content</h4>
          <a href="/community-guidelines">Community Guidelines</a>
          <a href="/moderation">Reporting &amp; Moderation</a>
          <a href="/event-policy">Clubs &amp; Events Policy</a>
          <a href="/copyright">Copyright &amp; IP</a>
        </div>
        <div class="footer-col">
          <h4>Health &amp; Safety</h4>
          <a href="/health-data">Health &amp; Fitness Data</a>
          <a href="/location-data">Location &amp; GPS Policy</a>
          <a href="/safety">SOS &amp; Safety Disclaimer</a>
          <a href="/fitness-disclaimer">Health &amp; Fitness Disclaimer</a>
        </div>
        <div class="footer-col">
          <h4>Account &amp; Help</h4>
          <a href="/support">Support Center</a>
          <a href="/delete-account">Account Deletion</a>
          <a href="/marketing-preferences">Marketing Preferences</a>
          <a href="/subscriptions">Subscriptions &amp; Billing</a>
          <a href="/security">Vulnerability Reporting</a>
        </div>
      </div>
      <div class="footer-bottom">
        <div>&copy; 2026 CRW+ · Operated in Poland, European Union. All rights reserved.</div>
        <div>Contact: <a href="mailto:support@crw-plus.com">support@crw-plus.com</a></div>
      </div>
    </footer>
  </main>
  ${extraScripts}
</body>
</html>`;
}

// 1. PRIVACY POLICY
const privacyContent = `
<p>This Privacy Policy explains how <strong>CRW+</strong> ("we", "our", or "the Platform") collects, uses, protects, and deletes personal data when you use the CRW+ mobile application, website, and related services. CRW+ is operated by Michal / konekocode, based in Poland (European Union). If you have any privacy questions or wish to exercise your legal rights, contact us at <a href="mailto:support@crw-plus.com"><strong>support@crw-plus.com</strong></a>.</p>

<h2>1. Who Controls Your Data</h2>
<p>The data controller responsible for your personal information under the General Data Protection Regulation (GDPR / RODO) is:</p>
<div class="card">
  <strong>CRW+ Team (konekocode)</strong><br>
  Operating Country: Poland, European Union<br>
  Official Contact Email: <a href="mailto:support@crw-plus.com">support@crw-plus.com</a><br>
  Alternate Contact: <a href="mailto:support@sport.konekocode.pl">support@sport.konekocode.pl</a>
</div>

<h2>2. Age Requirement (13+)</h2>
<p>CRW+ is strictly intended for individuals aged <strong>13 or older</strong>. If your local jurisdiction requires a higher age of digital consent or parental authorization (e.g. 16 in certain EU member states), you may use CRW+ only if those requirements are met. We do not knowingly collect personal data from children under 13. See our <a href="/children-safety">Children's Safety Policy</a>.</p>

<h2>3. Personal Data We Collect</h2>
<ul>
  <li><strong>Account Credentials:</strong> First name, last name, email address, password hash, unique <code>@username</code> handle, and Google Sign-In identifiers (if used).</li>
  <li><strong>Optional Profile Data:</strong> Profile photo, bio, birth year/age, weight, height, country, and city.</li>
  <li><strong>Workout &amp; Athletic Performance:</strong> Exercise activity type (running, walking, cycling, hiking, strength reps), session timestamps, duration, distance, pace, speed, calculated calories burned, rep counts, and achievements.</li>
  <li><strong>Location &amp; GPS Data:</strong> Precise GPS coordinates, elevation, and route polylines collected <strong>exclusively during active outdoor workout sessions</strong> when you grant location permission.</li>
  <li><strong>Connected Health Platforms (Apple Health / HealthKit &amp; Android Health Connect):</strong> Workout records, heart rate, daily steps, active energy, and distance. Integration is 100% optional. We <em>never</em> read sleep, reproductive health, or clinical records. See <a href="/health-data">Health Data Policy</a>.</li>
  <li><strong>Social &amp; Community Content:</strong> Published workout summaries, leaderboards, club memberships, and community posts.</li>
  <li><strong>Safety Data:</strong> Location coordinates packaged into a pre-made SMS message when you trigger the optional SOS emergency feature.</li>
  <li><strong>Marketing Preferences:</strong> Status of your opt-in consent for promotional updates.</li>
</ul>

<h2>4. Purposes &amp; Legal Bases for Processing</h2>
<p>Under GDPR Article 6 and Article 9, we process your personal data under the following legal bases:</p>
<ul>
  <li><strong>Performance of Contract (Art. 6(1)(b) GDPR):</strong> To create your account, record and display workouts, calculate statistics, maintain leaderboards, and deliver core app features.</li>
  <li><strong>Explicit Consent (Art. 6(1)(a) &amp; Art. 9(2)(a) GDPR):</strong> For reading connected health data (Apple Health / Health Connect), accessing background GPS for route tracking, and sending optional marketing newsletters. Consent may be withdrawn at any time.</li>
  <li><strong>Legitimate Interests (Art. 6(1)(f) GDPR):</strong> To protect platform integrity, prevent cheating and abuse, moderate prohibited content, and maintain service security.</li>
  <li><strong>Legal Obligations (Art. 6(1)(c) GDPR):</strong> To comply with mandatory statutory, tax, or legal accountability requirements.</li>
</ul>

<h2>5. Server Locations &amp; Data Transfers</h2>
<p>All primary servers, databases, and media storage are located within <strong>Poland and the European Union</strong>. We do not transfer your personal data to non-adequate third countries without standard contractual clauses and rigorous technical encryption safeguards.</p>

<h2>6. Data Recipients &amp; Third Parties</h2>
<p>We do not sell, rent, or trade your personal data. Data is shared strictly with necessary infrastructure service providers:</p>
<ul>
  <li><strong>Hosting &amp; Cloud Infrastructure:</strong> Dedicated EU server providers for database and API execution.</li>
  <li><strong>Storage:</strong> Private S3-compatible encrypted media storage for profile photos and route drawings.</li>
  <li><strong>Push Notifications:</strong> Apple APNs and Google Firebase Cloud Messaging strictly for dispatching notifications you enabled.</li>
</ul>
<p><strong>Zero Ad Tracking &amp; Zero Behavioral Profiling:</strong> We do not share your fitness history, health data, or location routes with advertising brokers or data aggregators.</p>

<h2>7. Data Retention &amp; 7-Day Backup Purge</h2>
<p>Your data is retained for as long as your account remains active. When you request account deletion:</p>
<ul>
  <li>Your account, profile, workouts, GPS routes, and social entries are permanently deleted from active production databases immediately.</li>
  <li>Residual encrypted technical database backups are automatically purged within a maximum of <strong>7 days</strong>.</li>
  <li>Any statutory records required by mandatory commercial/tax laws are retained strictly for the statutory limitation period (no fitness or GPS data is ever kept).</li>
</ul>

<h2>8. Your Rights Under GDPR &amp; Global Privacy Laws</h2>
<p>You have the right to: access your personal data, rectify inaccurate data, demand complete erasure ("Right to be Forgotten"), restrict processing, object to processing, and request data portability in a structured format. To exercise your rights, visit <a href="/delete-account">Account Deletion</a> or email <a href="mailto:support@crw-plus.com">support@crw-plus.com</a>. You also have the right to lodge a complaint with the Polish Data Protection Authority (Urząd Ochrony Danych Osobowych - UODO).</p>

<h2>9. Contact Privacy Team</h2>
<p>For any privacy-related inquiry or request: <a href="mailto:support@crw-plus.com">support@crw-plus.com</a>.</p>
`;

// 2. TERMS OF SERVICE
const termsContent = `
<p>Welcome to <strong>CRW+</strong>. By creating an account, downloading the app, or accessing our services, you agree to these Terms of Service. If you do not agree, please do not use the service.</p>

<h2>1. Eligibility &amp; Account Responsibility</h2>
<p>You must be at least <strong>13 years old</strong> to use CRW+. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree to notify us immediately at <a href="mailto:support@crw-plus.com">support@crw-plus.com</a> if you suspect unauthorized access.</p>

<h2>2. Permitted Use &amp; Prohibited Conduct</h2>
<p>CRW+ is provided for personal, non-commercial fitness tracking and community interaction. You agree NOT to:</p>
<ul>
  <li>Manipulate workout results, spoof GPS coordinates, or tamper with fair competition leaderboards.</li>
  <li>Harass, bully, threaten, stalk, or defame any individual.</li>
  <li>Post content that is sexually explicit, violent, fraudulent, or promotes illegal acts.</li>
  <li>Publish other people's personal information, live location, or private routes without explicit consent.</li>
  <li>Reverse engineer, scrape, decompile, or launch automated bots against our API or services.</li>
</ul>

<h2>3. User Content &amp; Hosting License</h2>
<p>You retain full intellectual property ownership over photos, workouts, route drawings, and text you post on CRW+. By posting content, you grant CRW+ a worldwide, non-exclusive, royalty-free license solely to host, display, reproduce, and distribute that content to operate and provide the platform features.</p>

<h2>4. Moderation &amp; Account Termination</h2>
<p>CRW+ reserves the right, at its sole discretion, to monitor, review, reject, or remove any user content, club, or event that violates our <a href="/community-guidelines">Community Guidelines</a>. We reserve the right to suspend or permanently terminate accounts for severe or repeated violations without prior notice. See <a href="/moderation">Moderation Policy</a>.</p>

<h2>5. Clubs, Events &amp; Pricing Disclaimer</h2>
<p>CRW+ allows users and organizers to discover and list running clubs and fitness events. You understand and agree that:</p>
<ul>
  <li>Organizers are solely responsible for event logistics, course safety, participant communications, and legal compliance.</li>
  <li>Any price displayed within the application is purely informational. CRW+ does not process ticket payments and is not a party to any financial transaction.</li>
  <li>CRW+ has no liability for event cancellations, postponements, quality, injury, or refund disputes. Approval of an event does not constitute an endorsement.</li>
</ul>

<h2>6. Health, Fitness &amp; SOS Disclaimers</h2>
<ul>
  <li><strong>Fitness Disclaimer:</strong> CRW+ is not a medical organization. Measurements and calorie calculations are estimates. Consult a physician before beginning any strenuous workout routine. See <a href="/fitness-disclaimer">Health &amp; Fitness Disclaimer</a>.</li>
  <li><strong>SOS Safety Disclaimer:</strong> The SOS feature generates a pre-formatted SMS message to your chosen contact. CRW+ is NOT an emergency dispatch service and does not contact police or ambulances. In an emergency, always call 112 or your local emergency service. See <a href="/safety">SOS &amp; Safety Disclaimer</a>.</li>
</ul>

<h2>7. Future Subscriptions &amp; Billing</h2>
<p>Core features of CRW+ are currently free. If optional premium subscriptions are introduced in the future, clear terms regarding pricing, recurring billing, auto-renewal, and cancellation will be presented prior to enrollment. See <a href="/subscriptions">Subscription Policy</a>.</p>

<h2>8. Limitation of Liability</h2>
<p>To the maximum extent permitted by applicable law, CRW+ is provided "AS IS" and "AS AVAILABLE" without warranties of any kind. CRW+ shall not be liable for any indirect, incidental, or consequential damages, nor for any personal injury or health complication resulting from self-directed physical exercise.</p>

<h2>9. Governing Law &amp; Dispute Resolution</h2>
<p>These Terms shall be governed by and construed in accordance with the laws of the Republic of Poland and the European Union. Any dispute arising out of or related to these Terms shall be submitted to the competent courts of Poland.</p>

<h2>10. Changes &amp; Contact</h2>
<p>We may update these Terms from time to time. Material modifications will be announced in advance. For questions: <a href="mailto:support@crw-plus.com">support@crw-plus.com</a>.</p>
`;

// 3. DELETE ACCOUNT
const deleteAccountContent = `
<p>You have full control over your data. You can delete your CRW+ account and all associated personal records at any time. Deletion is permanent, irreversible, and wipes all your fitness records from our active servers.</p>

<div class="card">
  <h3>Option 1: Delete Directly Inside the Mobile App</h3>
  <p>The fastest way to delete your account is through the CRW+ application on your phone:</p>
  <ol>
    <li>Open the <strong>CRW+</strong> app and tap your <strong>Profile</strong> icon.</li>
    <li>Tap the <strong>Settings (Gear)</strong> icon in the top corner.</li>
    <li>Scroll to the <strong>Account &amp; Security</strong> section.</li>
    <li>Tap <strong style="color: var(--danger);">Delete Account</strong> and confirm your choice.</li>
  </ol>
  <p class="muted">Your account will be logged out and immediately purged.</p>
</div>

<div class="card">
  <h3>Option 2: Request Deletion Online via Web Form</h3>
  <p>If you uninstalled the application or cannot access your phone, enter your registered email address below. We will send a secure one-click confirmation link to your inbox:</p>
  
  <div id="statusAlert" style="display:none; margin-bottom: 16px;" class="callout"></div>

  <form id="deleteForm" onsubmit="handleWebDeletion(event)">
    <div style="margin-bottom: 14px;">
      <label for="email" style="display:block; margin-bottom: 6px; font-weight: 600;">Your registered CRW+ email address:</label>
      <input type="email" id="email" name="email" required placeholder="name@example.com" autocomplete="email" style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 15px;">
    </div>
    <div style="margin-bottom: 16px;">
      <label for="reason" style="display:block; margin-bottom: 6px; font-weight: 600;">Optional reason or feedback:</label>
      <textarea id="reason" name="reason" rows="2" placeholder="Let us know why you are leaving (optional)..." style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font-size: 15px;"></textarea>
    </div>
    <button type="submit" id="submitBtn" class="btn btn-danger">Send Secure Deletion Link</button>
  </form>

  <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--card-border);">
    <p class="muted" style="margin-bottom: 8px;">Prefer to email support directly?</p>
    <a href="mailto:support@crw-plus.com?subject=CRW%2B%20Account%20and%20Data%20Deletion%20Request" class="btn btn-outline" style="font-size: 14px;">
      ✉ Email support@crw-plus.com
    </a>
  </div>
</div>

<h2>What Exactly Is Deleted</h2>
<p>Upon confirmation, all of the following records are permanently wiped from production databases:</p>
<ul>
  <li><strong>Authentication &amp; Credentials:</strong> Full name, email address, password hashes, and linked Google Sign-In tokens.</li>
  <li><strong>Profile Information:</strong> Display name, <code>@username</code> handle, profile picture, bio, age, weight, and height.</li>
  <li><strong>Workouts &amp; Athletic History:</strong> Every recorded workout, outdoor GPS path, elevation profile, split, pace metric, rep count, and calorie estimate.</li>
  <li><strong>Social &amp; Community Records:</strong> Friend lists, club memberships, event RSVPs, and leaderboard rankings.</li>
  <li><strong>Safety &amp; Devices:</strong> Push notification tokens and designated emergency SOS contact details.</li>
</ul>

<h2>What Happens to Local Data on Your Phone</h2>
<p>Deleting your account instantly disables cloud synchronization and invalidates active session tokens. To ensure all locally cached temporary data is also wiped from your device, simply uninstall the application or tap "Clear Storage / Clear Cache" in your phone's application settings.</p>

<h2>Backups &amp; Statutory Exceptions</h2>
<ul>
  <li><strong>Backups:</strong> Encrypted automated database backups are automatically overwritten and permanently destroyed within a maximum of <strong>7 days</strong>.</li>
  <li><strong>Statutory Retention:</strong> If applicable, accounting/invoice records for paid transactions are maintained strictly for the duration mandated by statutory tax and accounting regulations. No fitness, GPS, or health data is ever retained.</li>
</ul>

<h2>Troubleshooting &amp; Support</h2>
<p>If you encounter any difficulty deleting your account or confirming deletion, contact us immediately at <a href="mailto:support@crw-plus.com"><strong>support@crw-plus.com</strong></a> with the subject "Account Deletion Help" and our technical staff will manually process your request within 48 hours.</p>
`;

const deleteAccountScript = `
<script>
  async function handleWebDeletion(event) {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const btn = document.getElementById('submitBtn');
    const alertBox = document.getElementById('statusAlert');

    if (!email) return;

    btn.disabled = true;
    btn.textContent = 'Processing...';
    alertBox.style.display = 'none';

    try {
      const response = await fetch('https://sport-api.konekocode.pl/account/delete/request-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      alertBox.className = 'callout callout-info';
      alertBox.innerHTML = '<strong>Request received!</strong> If an account is associated with <em>' + escapeHtml(email) + '</em>, a confirmation email with a secure deletion link has been sent. Please check your inbox and spam folder, then click the link to confirm permanent deletion.';
      alertBox.style.display = 'block';
      document.getElementById('deleteForm').reset();
    } catch (err) {
      alertBox.className = 'callout callout-info';
      alertBox.innerHTML = '<strong>Request noted!</strong> We received your request. You can also confirm deletion directly by sending an email to <a href="mailto:support@crw-plus.com?subject=Account%20Deletion%20Request%20for%20' + encodeURIComponent(email) + '">support@crw-plus.com</a>.';
      alertBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Secure Deletion Link';
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
</script>
`;

// 4. DATA SAFETY
const dataSafetyContent = `
<p>This Data Safety overview provides a transparent, easy-to-read breakdown of all personal and device data handled by the CRW+ platform, compliant with Google Play Data Safety and Apple Privacy Nutrition labels.</p>

<div class="callout callout-info">
  <strong>Key Principles:</strong>
  <ul>
    <li>🔒 <strong>Data Encrypted in Transit:</strong> All communications between your device and CRW+ use modern TLS 1.3 / HTTPS encryption.</li>
    <li>🗑️ <strong>Account Deletion Available:</strong> Users can request full, permanent deletion of their account and all data at any time.</li>
    <li>🚫 <strong>Zero Data Selling:</strong> We never sell, rent, or monetize your personal data.</li>
    <li>🛡️ <strong>Zero Advertising Profiling:</strong> Fitness, location, and health metrics are never shared with advertising brokers.</li>
  </ul>
</div>

<h2>Data Types &amp; Handling Matrix</h2>
<div style="overflow-x: auto;">
  <table>
    <thead>
      <tr>
        <th>Data Category</th>
        <th>Collected?</th>
        <th>Optional?</th>
        <th>Purpose of Processing</th>
        <th>Shared / Sold?</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Email Address</strong></td>
        <td>Yes</td>
        <td>Required</td>
        <td>Account login, security verification, password resets</td>
        <td>Never sold / Not shared</td>
      </tr>
      <tr>
        <td><strong>Name &amp; Surname</strong></td>
        <td>Yes</td>
        <td>Required</td>
        <td>User identity and display name</td>
        <td>Never sold / Not shared</td>
      </tr>
      <tr>
        <td><strong>Username (@handle)</strong></td>
        <td>Yes</td>
        <td>Required</td>
        <td>Public profile and leaderboard identification</td>
        <td>Visible to community / Never sold</td>
      </tr>
      <tr>
        <td><strong>Profile Photo</strong></td>
        <td>Yes</td>
        <td>Optional</td>
        <td>Personalizing athlete profile and club avatar</td>
        <td>Visible to community / Never sold</td>
      </tr>
      <tr>
        <td><strong>Approximate Location (Country/City)</strong></td>
        <td>Yes</td>
        <td>Optional</td>
        <td>Local fitness club discovery and regional leaderboards</td>
        <td>Visible if configured / Never sold</td>
      </tr>
      <tr>
        <td><strong>Precise GPS Route</strong></td>
        <td>Yes</td>
        <td>Optional</td>
        <td>Drawing route maps, distance, pace, and elevation during active outdoor workouts</td>
        <td>Private by default / Never sold</td>
      </tr>
      <tr>
        <td><strong>Workout &amp; Rep Data</strong></td>
        <td>Yes</td>
        <td>Required for tracking</td>
        <td>Session analytics, personal records, and training progress</td>
        <td>User choice (friends/public) / Never sold</td>
      </tr>
      <tr>
        <td><strong>Heart Rate</strong></td>
        <td>Yes</td>
        <td>Optional (HealthKit/Connect)</td>
        <td>Calculating cardio intensity and exertion zones during workouts</td>
        <td>Private / Never sold</td>
      </tr>
      <tr>
        <td><strong>Daily Steps &amp; Distance</strong></td>
        <td>Yes</td>
        <td>Optional (HealthKit/Connect)</td>
        <td>Activity totals and daily goal achievement summaries</td>
        <td>Private / Never sold</td>
      </tr>
      <tr>
        <td><strong>Active Calories Burned</strong></td>
        <td>Yes</td>
        <td>Automatic / Synced</td>
        <td>MET-based athletic calorie expenditure estimates</td>
        <td>Private / Never sold</td>
      </tr>
      <tr>
        <td><strong>Physical Metrics (Age/Weight/Height)</strong></td>
        <td>Yes</td>
        <td>Optional</td>
        <td>Improving accuracy of calorie calculations</td>
        <td>Private / Never sold</td>
      </tr>
      <tr>
        <td><strong>Device &amp; Diagnostics Data</strong></td>
        <td>Minimal</td>
        <td>Automatic</td>
        <td>App stability, crash diagnostics, performance telemetry</td>
        <td>Internal only / Never sold</td>
      </tr>
      <tr>
        <td><strong>Marketing Preferences</strong></td>
        <td>Yes</td>
        <td>Optional (Opt-In)</td>
        <td>Managing subscription to product news and updates</td>
        <td>Never sold / Not shared</td>
      </tr>
    </tbody>
  </table>
</div>

<h2>Security Measures</h2>
<p>We apply robust administrative, physical, and technical controls to safeguard your information:</p>
<ul>
  <li>End-to-end transport layer security (HTTPS/TLS 1.3).</li>
  <li>Cryptographically hashed user passwords using salted Argon2/Bcrypt.</li>
  <li>Strict role-based internal access controls and isolated database networks.</li>
  <li>Daily encrypted backups purged within a rolling 7-day window upon account deletion.</li>
</ul>
`;

// 5. SUPPORT
const supportContent = `
<p>Need assistance with your CRW+ account, workout tracking, or device synchronization? Our support team is here to help.</p>

<div class="callout callout-important">
  <strong>⚠️ Emergency Notice:</strong><br>
  CRW+ Support is <strong>NOT an emergency dispatch service</strong>. If you are experiencing a medical emergency, injury, or immediate physical threat, please dial your local emergency number (such as <strong>112</strong> in Europe or <strong>911</strong> in North America) immediately.
</div>

<div class="card">
  <h3>Direct Support Contact</h3>
  <p>For all technical, account, and privacy inquiries, email our dedicated support desk:</p>
  <p><strong>Primary Email:</strong> <a href="mailto:support@crw-plus.com">support@crw-plus.com</a><br>
  <strong>Service Desk:</strong> <a href="mailto:support@sport.konekocode.pl">support@sport.konekocode.pl</a><br>
  <strong>Response Time:</strong> Typically within 24–48 hours on business days.</p>
</div>

<h2>Common Support Topics</h2>
<div class="footer-grid">
  <div class="card">
    <h4>Account &amp; Login</h4>
    <p class="muted">Password reset issues, Google Sign-In problems, email verification, or updating your username.</p>
  </div>
  <div class="card">
    <h4>Workouts &amp; GPS</h4>
    <p class="muted">Missing GPS routes, distance calculation anomalies, paused workout recovery, or background tracking permissions.</p>
  </div>
  <div class="card">
    <h4>Health Integrations</h4>
    <p class="muted">Connecting or troubleshooting Apple Health (HealthKit) and Android Health Connect permissions and heart rate sync.</p>
  </div>
  <div class="card">
    <h4>Safety &amp; SOS</h4>
    <p class="muted">Configuring emergency contacts, SMS permission issues, or testing safety feature functionality.</p>
  </div>
  <div class="card">
    <h4>Clubs &amp; Events</h4>
    <p class="muted">Submitting a running club, organizing an event, event moderation review status, or reporting an event.</p>
  </div>
  <div class="card">
    <h4>Moderation &amp; Privacy</h4>
    <p class="muted">Reporting abusive users, copyright takedown requests, account deletion requests, or GDPR data requests.</p>
  </div>
</div>

<h2>How to Report an Issue Effectively</h2>
<p>To help us resolve your issue as quickly as possible, please include the following details in your email:</p>
<ul>
  <li>Your registered email address and <code>@username</code>.</li>
  <li>Your device model (e.g. iPhone 15, Samsung Galaxy S24) and operating system version (e.g. iOS 18.2, Android 15).</li>
  <li>A brief description of what happened and steps to reproduce the issue.</li>
  <li>Screenshots or screen recordings of the error, if applicable.</li>
</ul>
`;

// 6. COMMUNITY GUIDELINES
const communityGuidelinesContent = `
<p>CRW+ is built to inspire athletes, runners, and fitness enthusiasts of all levels to train, compete, and grow together in a respectful and safe environment. These Community Guidelines apply to all users, posts, profile photos, running clubs, and events.</p>

<h2>1. Respect &amp; Sportsmanship</h2>
<p>Treat every member of the community with dignity. We celebrate progress, effort, and healthy competition. Constructive encouragement is welcomed; toxicity is not.</p>

<h2>2. Strictly Prohibited Behaviors (Zero Tolerance)</h2>
<ul>
  <li><strong>Harassment &amp; Bullying:</strong> Targeted abuse, insults, derogatory comments, stalking, intimidation, or persistent unwanted contact.</li>
  <li><strong>Hate Speech:</strong> Attacks, slurs, or discrimination based on race, ethnicity, nationality, religion, sexual orientation, gender, disability, or age.</li>
  <li><strong>Violence &amp; Threats:</strong> Any threat of physical harm, self-harm encouragement, or glorification of violence.</li>
  <li><strong>Sexual &amp; NSFW Content:</strong> Nudity, pornography, sexually suggestive content, or sexually explicit language in profile photos, posts, or event banners.</li>
  <li><strong>Child Sexual Exploitation &amp; Abuse (CSAM):</strong> Absolute zero tolerance. Any instance will result in immediate permanent banning, device blocking, and automatic reporting to NCMEC and international law enforcement authorities.</li>
  <li><strong>Fraud &amp; Scams:</strong> Impersonating other athletes or brands, deceptive fundraising, or unauthorized commercial advertising.</li>
  <li><strong>Privacy Violations:</strong> Publishing another person's home address, private GPS routes, phone number, or personal details without explicit consent.</li>
  <li><strong>Cheating &amp; Fair Play Violation:</strong> Fake GPS data, digital route spoofing, motorized vehicular tracking categorized as human running, or manipulating leaderboard rankings.</li>
</ul>

<h2>3. Profile Photos, Clubs &amp; Events</h2>
<p>Profile photos, club names, and event descriptions must be family-friendly and appropriate for all ages (13+). Any club or event found to promote commercial spam, discrimination, dangerous activities, or illegal gatherings will be removed immediately.</p>

<h2>4. Enforcement &amp; Consequences</h2>
<p>Violations of these guidelines will be investigated by our moderation team and may lead to escalating penalties:</p>
<ul>
  <li><strong>Content Removal:</strong> Deletion of the violating post, photo, club, or event.</li>
  <li><strong>Account Warning:</strong> Formal notification regarding the infraction.</li>
  <li><strong>Feature Restrictions:</strong> Disabling social posting, club creation, or leaderboard participation.</li>
  <li><strong>Temporary Suspension:</strong> Account lockout for 7, 14, or 30 days.</li>
  <li><strong>Permanent Termination:</strong> Permanent ban from the CRW+ platform and infrastructure.</li>
</ul>

<h2>5. Appeals</h2>
<p>If you believe an enforcement action was taken against your account in error, you may submit an appeal within 14 days to <a href="mailto:support@crw-plus.com">support@crw-plus.com</a> with the subject "Community Guidelines Appeal".</p>
`;

// 7. MODERATION POLICY
const moderationContent = `
<p>CRW+ is committed to maintaining a safe, transparent, and fair sports platform. This policy outlines how user-generated content is monitored, reviewed, reported, and moderated.</p>

<h2>1. What Can Be Reported</h2>
<p>Users can report any content or behavior across CRW+ that violates our rules, including:</p>
<ul>
  <li>User accounts and <code>@username</code> handles.</li>
  <li>Profile pictures (PFPs) and athlete bios.</li>
  <li>Club titles, descriptions, and club chat/posts.</li>
  <li>Event listings, routes, and organizer information.</li>
  <li>Workout summaries, comments, and photos.</li>
</ul>

<h2>2. How Review Works</h2>
<p>Our safety framework combines automated screening and dedicated human moderation:</p>
<ul>
  <li><strong>Automated Pre-Screening:</strong> Profile photos and uploaded media pass through automated basic anti-NSFW visual detection models to intercept explicit imagery before publication.</li>
  <li><strong>Human Review:</strong> Flagged content and user reports are queued for review by trained moderators. Reports are evaluated objectively against our <a href="/community-guidelines">Community Guidelines</a> and Terms.</li>
</ul>

<h2>3. Range of Moderation Actions</h2>
<p>Depending on the severity, frequency, and impact of a violation, moderators may apply:</p>
<ol>
  <li><strong>Educational Warning:</strong> Written notice issued for minor, first-time infractions.</li>
  <li><strong>Immediate Content Deletion:</strong> Removing the offending picture, text, club, or event.</li>
  <li><strong>Feature Restriction:</strong> Revoking permissions to publish events, create clubs, or post publicly while preserving private workout tracking.</li>
  <li><strong>Temporary Suspension:</strong> Freezing account access for 7 to 30 days.</li>
  <li><strong>Permanent Ban:</strong> Total expulsion from CRW+, deletion of public profile, and blacklisting of associated credentials.</li>
</ol>
<p><strong>Urgent Removal Without Prior Warning:</strong> In severe cases involving hate speech, sexual exploitation, credible threats of violence, or criminal conduct, moderators will act immediately without prior notice.</p>

<h2>4. Abuse of the Reporting System</h2>
<p>The reporting feature is intended to protect the community. Submitting frivolous, fraudulent, or retaliatory reports against competitors or clubs is strictly prohibited and will result in penalties against the reporting account.</p>

<h2>5. Appeals Process</h2>
<p>If your content was removed or your account was penalized and you believe this was an error, you may file an appeal by emailing <a href="mailto:support@crw-plus.com">support@crw-plus.com</a> with your username, the date of action, and an explanation. Our team will review the appeal and deliver a final decision within 7 business days.</p>
`;

// 8. HEALTH DATA POLICY
const healthDataContent = `
<p>This Health &amp; Fitness Data Policy explains how CRW+ interacts with native health ecosystems, specifically <strong>Apple Health (HealthKit)</strong> on iOS and <strong>Android Health Connect</strong> on Android devices. This document reflects strict adherence to Apple and Google developer health data policies.</p>

<div class="callout callout-info">
  <strong>The Core Promise:</strong><br>
  CRW+ uses health and sensor data <strong>strictly to calculate your personal athletic metrics</strong>. We <strong>NEVER</strong> sell health data, never transfer it to advertising brokers, and never use it for commercial profiling or marketing.
</div>

<h2>1. What Health Data We Access</h2>
<p>When you explicitly grant permission in your operating system, CRW+ can read and write the following fitness data points:</p>
<ul>
  <li><strong>Workout Records:</strong> Start and end times, activity category (run, walk, cycle), duration, and distance.</li>
  <li><strong>Heart Rate:</strong> Real-time heart rate readings captured by paired watches or chest straps during an active workout session.</li>
  <li><strong>Active Calories Burned:</strong> Metabolic equivalent (MET) energy expenditure estimates.</li>
  <li><strong>Step Counts:</strong> Daily cumulative walking and running steps.</li>
  <li><strong>Distance:</strong> Total outdoor and treadmill distance traveled.</li>
</ul>

<h2>2. What We NEVER Access or Collect</h2>
<p>CRW+ does <strong>NOT</strong> request, collect, or process sensitive categories of health data, including:</p>
<ul>
  <li>❌ Reproductive health, menstrual cycles, or fertility records.</li>
  <li>❌ Sleep cycle analysis or sleep tracking data.</li>
  <li>❌ Clinical health records, lab results, medications, or disease diagnoses.</li>
  <li>❌ Genetic, biometric identity, or DNA data.</li>
</ul>

<h2>3. Purpose of Health Data Processing</h2>
<p>Health data is processed solely to provide direct athletic value to you:</p>
<ul>
  <li>Displaying heart rate zones (aerobic, anaerobic, peak) during and after runs.</li>
  <li>Synchronizing workout summaries between CRW+ and your phone's central fitness log.</li>
  <li>Providing aggregate weekly and monthly mileage and calorie statistics.</li>
</ul>

<h2>4. 100% Optional &amp; Revocable at Any Time</h2>
<p>Connecting your health ecosystem is completely optional. CRW+ functions normally without HealthKit or Health Connect. You can revoke health permissions at any moment directly in your phone settings:</p>
<ul>
  <li><strong>iOS:</strong> <em>Settings &gt; Privacy &amp; Security &gt; Health &gt; CRW+</em> &gt; Turn off permissions.</li>
  <li><strong>Android:</strong> <em>Settings &gt; Privacy &gt; Health Connect &gt; App permissions &gt; CRW+</em> &gt; Turn off permissions.</li>
</ul>

<h2>5. Accuracy Disclaimer</h2>
<p>Metrics provided by consumer sensors, optical heart rate monitors, and smartphone algorithms are statistical approximations intended for recreational fitness purposes only. They are not clinical diagnostic instruments. Consult a medical doctor before making health decisions based on fitness tracking data.</p>
`;

// 9. LOCATION & GPS POLICY
const locationDataContent = `
<p>CRW+ features real-time outdoor GPS tracking for runners, walkers, hikers, and cyclists. This policy details when and how location data is captured, stored, and protected.</p>

<h2>1. When Location Data Is Recorded</h2>
<p>CRW+ accesses precise location data <strong>ONLY during an active, user-initiated outdoor workout</strong>. Location tracking begins the moment you tap "Start" on an outdoor activity and ceases the exact moment you tap "Finish" or discard the workout.</p>
<p><strong>We NEVER track your location in the background when an activity is not running.</strong></p>

<h2>2. Why Background Location Permission Is Needed</h2>
<p>When running or cycling outdoors, athletes frequently lock their phone screen or switch to a music app. Operating systems require background location permission so CRW+ can continue plotting your route accurately, recording continuous GPS points, and computing splits without interruption while the screen is off.</p>

<h2>3. Privacy Risks: Protecting Your Home &amp; Workplace</h2>
<div class="callout callout-warning">
  <strong>⚠️ Privacy Recommendation:</strong><br>
  Publishing full workout GPS routes publicly can inadvertently reveal your home address, daily routine, or workplace location. We strongly advise:
  <ul>
    <li>Starting and ending workout recordings a short distance away from your residential doorstep.</li>
    <li>Adjusting your workout privacy settings so route maps are visible only to approved friends.</li>
  </ul>
</div>

<h2>4. Storage &amp; Encryption</h2>
<p>GPS coordinate streams (latitude, longitude, timestamp, altitude) are transmitted using encrypted TLS 1.3 channels to our secure EU servers and stored in private databases. Route maps generated for social sharing are rendered as flattened vector paths.</p>

<h2>5. Disabling Location Permissions</h2>
<p>You can revoke location access at any time in your phone's system settings. If location permissions are disabled, GPS route mapping and automated outdoor pace calculations will be unavailable, but indoor treadmill workouts, strength rep counters, and manual workout logs will continue to work normally.</p>
`;

// 10. SAFETY & SOS DISCLAIMER
const safetyContent = `
<p>CRW+ provides an integrated <strong>SOS Safety feature</strong> designed to assist athletes during outdoor training sessions. It is essential that all users understand how this feature operates and its technical limitations.</p>

<div class="callout callout-important">
  <strong>🚨 CRW+ IS NOT AN EMERGENCY DISPATCH SERVICE:</strong><br>
  CRW+ does <strong>NOT</strong> automatically contact emergency rescue services, the police, fire departments, or public dispatchers (such as 112 or 911). In any life-threatening emergency, injury, assault, or sudden illness, your very first action must ALWAYS be to dial your local public emergency telephone number (<strong>112 in Europe, 911 in North America</strong>).
</div>

<h2>1. How the SOS Feature Operates</h2>
<p>When you trigger the SOS action within the CRW+ active workout screen:</p>
<ul>
  <li>The active workout is paused and your current latitude and longitude GPS coordinates are retrieved.</li>
  <li>A pre-composed SMS text message containing your name, current coordinates, and a direct Google Maps link is generated.</li>
  <li>Your device's native SMS application is opened with the message addressed to your pre-configured trusted contact.</li>
  <li>You simply tap "Send" in your native messaging app to transmit the alert.</li>
</ul>

<h2>2. Dependencies &amp; Technical Limitations</h2>
<p>Successful delivery of an emergency SOS alert depends on multiple external factors outside CRW+'s control:</p>
<ul>
  <li><strong>Cellular Coverage:</strong> The phone must have an active cellular network signal to send SMS text messages. Alerts cannot be transmitted in cellular dead zones.</li>
  <li><strong>GPS Satellite Fix:</strong> Accurate location requires clear line-of-sight to GPS satellites. In tunnels, dense urban canyons, or deep underground, coordinates may be approximate or unavailable.</li>
  <li><strong>Device Battery &amp; Permissions:</strong> The phone must have sufficient battery charge and granted SMS / location permissions.</li>
  <li><strong>Carrier SMS Credits:</strong> Your mobile subscription or prepaid SIM must permit outgoing text messages.</li>
</ul>

<h2>3. User Preparation Checklist</h2>
<p>Before undertaking remote or nighttime outdoor training, ensure that:</p>
<ol>
  <li>You have designated a reliable, reachable emergency contact in the app.</li>
  <li>Your trusted contact knows you have listed them as your emergency contact.</li>
  <li>Your phone is fully charged and location permissions are set to "Always" or "While Using".</li>
  <li>You familiarize yourself with the terrain, weather forecast, and tell someone where you are going.</li>
</ol>
`;

// 11. HEALTH & FITNESS DISCLAIMER
const fitnessDisclaimerContent = `
<p>The information, tracking tools, workout plans, and calorie estimations provided by <strong>CRW+</strong> are intended solely for educational, recreational, and general fitness purposes.</p>

<div class="callout callout-warning">
  <strong>Not Medical Advice:</strong><br>
  CRW+ is not a medical organization, healthcare provider, or clinical diagnostic service. None of the content, metrics, rep counts, or suggestions generated by CRW+ should be construed as medical advice, health diagnosis, or physical therapy treatment.
</div>

<h2>1. Consult a Qualified Healthcare Professional</h2>
<p>Engaging in strenuous physical activity, running, calisthenics, and endurance training involves inherent risks of cardiovascular strain and musculoskeletal injury. You should consult a physician or licensed sports physician before beginning any new training program, especially if you have:</p>
<ul>
  <li>Pre-existing heart disease, high blood pressure, or chest pain during exertion.</li>
  <li>Asthma, respiratory conditions, or dizzy spells.</li>
  <li>Joint, tendon, spinal, or bone disorders.</li>
  <li>Are pregnant, recovering from surgery, or taking prescription medication.</li>
</ul>

<h2>2. Estimation of Calorie &amp; Exertion Metrics</h2>
<p>Calculations of active calories burned, metabolic equivalents (MET), heart rate training zones, and average split times are mathematical estimates derived from generalized formulas. Individual metabolic rates, body composition, running economy, and environmental factors vary widely. Never base medical or nutritional regimens strictly on consumer app estimates.</p>

<h2>3. Listen to Your Body</h2>
<p>Always exercise within your personal physical capacity. Stop exercising immediately and seek medical attention if you experience dizziness, lightheadedness, sharp pain, shortness of breath, nausea, or irregular heartbeat during a workout.</p>

<h2>4. Nutritional &amp; Recipe Information</h2>
<p>Recipes, nutritional tips, and meal ideas presented on the platform are for culinary inspiration only. CRW+ does not guarantee nutritional accuracy and is not responsible for adverse reactions, food allergies, or dietary deficiencies.</p>
`;

// 12. CLUBS & EVENTS POLICY
const eventPolicyContent = `
<p>CRW+ provides a community discovery hub where athletes can form running clubs, schedule group training runs, and discover local sporting events. This Clubs &amp; Events Policy defines the responsibilities of organizers and participants.</p>

<h2>1. Mandatory Moderation &amp; Review</h2>
<p>All public clubs and events submitted to CRW+ are subject to review by our moderation team prior to appearing in public discovery directories. CRW+ reserves the right to approve, reject, modify, or remove any club or event at any time without liability, particularly if the event presents safety hazards, violates local laws, or promotes commercial spam.</p>

<h2>2. Sole Responsibility of Organizers</h2>
<p>The individual or organization listed as the event creator or club leader is solely and exclusively responsible for:</p>
<ul>
  <li>Securing all necessary municipal, park, and road permits for group gatherings.</li>
  <li>Course reconnaissance, surface safety, traffic control, and hazard warnings.</li>
  <li>Adequate hydration, first-aid preparedness, and participant communications.</li>
  <li>Ensuring commercial liability insurance coverage where applicable.</li>
</ul>

<h2>3. Pricing Disclaimer &amp; Financial Transactions</h2>
<div class="callout callout-important">
  <strong>CRW+ Is Not a Ticket Seller or Transaction Party:</strong><br>
  Any entry fee or ticket price listed on an event page within CRW+ is <strong>strictly informational</strong>. All monetary transactions, payments, ticket issuances, and refund requests occur entirely outside the CRW+ platform.
</div>
<p>CRW+ does not collect event fees, does not take a percentage of registrations, and has no liability whatsoever for event cancellations, weather disruptions, organizer non-performance, or disputes over refunds.</p>

<h2>4. No Official Endorsement or Safety Guarantee</h2>
<p>Approval or listing of a club or event on CRW+ does <strong>NOT</strong> constitute an endorsement, sponsorship, or safety certification by CRW+. Participants take part in group workouts and events entirely at their own risk.</p>

<h2>5. Reporting Prohibited Events</h2>
<p>If you encounter an event that involves illegal street racing, trespassing on private property, hate speech, or commercial scamming, please report it immediately via the in-app reporting button or by emailing <a href="mailto:support@crw-plus.com">support@crw-plus.com</a>.</p>
`;

// 13. SECURITY / VULNERABILITY REPORTING
const securityContent = `
<p>At CRW+, we treat the security of our users' personal, athletic, and location data with the highest priority. We welcome responsible security research and vulnerability reports from the cybersecurity community.</p>

<h2>1. Reporting a Vulnerability</h2>
<p>If you have discovered a potential security vulnerability in CRW+ services, APIs, web applications, or mobile apps, please report it privately to our security team:</p>
<div class="card">
  <strong>Security Contact:</strong> <a href="mailto:support@crw-plus.com">support@crw-plus.com</a><br>
  <strong>Subject Line:</strong> <code>[Vulnerability Disclosure] &lt;Short Vulnerability Description&gt;</code><br>
  <strong>Encryption:</strong> PGP encryption available upon request.
</div>

<h2>2. Guidelines for Responsible Disclosure</h2>
<p>To qualify for safe harbor and responsible collaboration, researchers must:</p>
<ul>
  <li><strong>Protect User Data:</strong> Do not access, view, download, alter, or destroy data belonging to other users. Test vulnerabilities only against your own test accounts.</li>
  <li><strong>No Service Disruption:</strong> Do not execute Denial of Service (DoS / DDoS) attacks, automated stress-testing, or spamming of APIs.</li>
  <li><strong>No Social Engineering:</strong> Do not attempt phishing, physical attacks, or social engineering against CRW+ staff or users.</li>
  <li><strong>Confidentiality:</strong> Give our engineering team reasonable time to investigate, remediate, and verify the patch before making any public disclosure.</li>
</ul>

<h2>3. What to Include in Your Report</h2>
<p>A well-documented report enables our engineers to reproduce and resolve the issue quickly. Please include:</p>
<ol>
  <li>The affected URL, endpoint, or mobile screen.</li>
  <li>The vulnerability classification (e.g., IDOR, SQLi, Authentication Bypass, XSS).</li>
  <li>Step-by-step reproduction instructions.</li>
  <li>A benign Proof of Concept (PoC) script, screenshot, or HTTP request/response log.</li>
  <li>An assessment of real-world impact and potential mitigation strategies.</li>
</ol>

<h2>4. Safe Harbor Guarantee</h2>
<p>If you conduct security research in good faith compliance with these guidelines, CRW+ will not pursue civil lawsuits or refer your research to law enforcement. We will work with you to understand and fix the issue promptly.</p>
`;

// 14. COPYRIGHT & IP REPORTING
const copyrightContent = `
<p>CRW+ respects the intellectual property rights of creators, photographers, and trademark owners. We comply with the Digital Millennium Copyright Act (DMCA) and Directive (EU) 2019/790 on Copyright in the Digital Single Market.</p>

<h2>1. User Responsibility for Uploaded Content</h2>
<p>Users are strictly prohibited from uploading photos, logos, club artwork, or textual content that infringes on third-party copyrights, trademarks, or proprietary rights. Users are solely liable for any infringement resulting from their posts.</p>

<h2>2. Filing a Copyright Infringement Notice</h2>
<p>If you are a copyright or trademark owner (or authorized agent) and believe that content hosted on CRW+ infringes your work, please submit a formal written notice containing:</p>
<ul>
  <li>Your physical or electronic signature.</li>
  <li>Clear identification of the copyrighted work or trademark claimed to have been infringed (including registration numbers, if applicable).</li>
  <li>Accurate identification of the infringing material on CRW+, including the specific URL, screenshot, or account handle.</li>
  <li>Your contact information: legal name, physical address, telephone number, and email address.</li>
  <li>A statement that you have a good-faith belief that the disputed use is not authorized by the copyright owner, its agent, or the law.</li>
  <li>A statement, under penalty of perjury, that the information in the notification is accurate and that you are the owner or authorized to act on behalf of the owner.</li>
</ul>

<h2>3. Where to Submit Notices</h2>
<p>Send completed notices to our designated agent:</p>
<div class="card">
  <strong>CRW+ Copyright &amp; Legal Agent</strong><br>
  Email: <a href="mailto:support@crw-plus.com">support@crw-plus.com</a><br>
  Subject: <code>[Copyright / DMCA Notice]</code>
</div>

<h2>4. Takedown &amp; Counter-Notice Procedure</h2>
<p>Upon receiving a compliant notice, we will expeditiously remove or disable access to the infringing content and notify the user who posted it. The user may file a counter-notice if they believe the content was removed as a result of mistake or misidentification.</p>
`;

// 15. MARKETING PREFERENCES
const marketingPreferencesContent = `
<p>We believe your inbox belongs to you. CRW+ maintains a transparent, strictly <strong>opt-in</strong> approach to promotional emails and marketing communications.</p>

<div class="callout callout-info">
  <strong>Our Marketing Rules:</strong>
  <ul>
    <li>✅ <strong>Strict Opt-In:</strong> Marketing consent checkboxes are unchecked by default during registration. We only send marketing emails if you explicitly opted in.</li>
    <li>✅ <strong>One-Click Unsubscribe:</strong> Every promotional email includes an active, direct unsubscribe link in the footer.</li>
    <li>✅ <strong>Zero Selling:</strong> We never sell your email address to third parties or marketing networks.</li>
  </ul>
</div>

<h2>1. Types of Communications We Send</h2>
<ul>
  <li><strong>Transactional &amp; Security Emails (Mandatory):</strong> Password reset requests, account deletion confirmations, critical security notices, and material updates to our Terms or Privacy Policy. These cannot be opted out of as they are essential to service delivery.</li>
  <li><strong>Promotional &amp; Community Newsletters (Optional):</strong> Feature announcements, seasonal fitness challenges, running tips, and community highlights. These are 100% voluntary.</li>
</ul>

<h2>2. How to Manage or Revoke Marketing Consent</h2>
<p>You can change your marketing email preferences at any time through any of the following methods:</p>
<ol>
  <li><strong>In the Mobile App:</strong> Go to <em>Profile &gt; Settings &gt; Notifications &amp; Privacy</em> and toggle off "Marketing Emails".</li>
  <li><strong>In Any Email:</strong> Click the "Unsubscribe" link located at the bottom of any promotional email you receive from CRW+.</li>
  <li><strong>By Direct Request:</strong> Send an email to <a href="mailto:support@crw-plus.com">support@crw-plus.com</a> with the subject "Unsubscribe from Marketing" and your registered email address.</li>
</ol>
<p class="muted">Unsubscribe requests are processed immediately and take effect within 24 hours.</p>
`;

// 16. CHILDREN'S SAFETY (13+)
const childrenSafetyContent = `
<p>Protecting the privacy and well-being of young people is a foundational commitment at CRW+. This policy details our age restrictions, data protections, and parent assistance procedures.</p>

<div class="callout callout-important">
  <strong>Minimum Age Policy: 13+ Only</strong><br>
  CRW+ is intended strictly for athletes and users aged <strong>13 years or older</strong>. We do not intentionally market to, collect data from, or permit registration by children under the age of 13.
</div>

<h2>1. Age Verification &amp; Higher Statutory Ages</h2>
<p>Depending on your jurisdiction, applicable local laws may prescribe a higher digital age of consent (for example, 16 years of age in certain European Union countries under GDPR Art. 8). Users under the statutory digital age of consent in their jurisdiction may only use CRW+ with verified parental or guardian consent.</p>

<h2>2. Zero Tolerance for Child Sexual Exploitation &amp; Abuse (CSAM)</h2>
<p>CRW+ maintains absolute zero tolerance regarding Child Sexual Abuse Material (CSAM), grooming, sexual solicitation of minors, or child endangerment. Any detected occurrence will trigger:</p>
<ul>
  <li>Immediate, permanent account termination.</li>
  <li>Immediate device and IP network blacklisting.</li>
  <li>Immediate referral of all relevant logs and evidence to the National Center for Missing &amp; Exploited Children (NCMEC) and Polish/EU law enforcement authorities.</li>
</ul>

<h2>3. Parental Assistance &amp; Deletion Requests</h2>
<p>If you are a parent or legal guardian and discover that your child under the age of 13 has created an account on CRW+ without your knowledge, please contact us immediately:</p>
<div class="card">
  <strong>Email:</strong> <a href="mailto:support@crw-plus.com">support@crw-plus.com</a><br>
  <strong>Subject:</strong> <code>[Child Data Deletion Request]</code><br>
  <strong>Details to provide:</strong> The child's registered email address and username handle.
</div>
<p>Upon verification, we will promptly and permanently purge the account and all associated workout, location, and profile records from our databases.</p>
`;

// 17. LEGAL & OPERATOR INFO (IMPRESSUM)
const legalContent = `
<p>This page provides legal, ownership, and regulatory information for the <strong>CRW+</strong> digital platform in accordance with European Union digital service transparency regulations.</p>

<h2>1. Service Operator Information</h2>
<div class="card">
  <strong>Platform Name:</strong> CRW+ (accessible at <a href="https://sport.konekocode.pl">https://sport.konekocode.pl</a>)<br>
  <strong>Operator &amp; Founder:</strong> Michal (konekocode)<br>
  <strong>Operating Country:</strong> Republic of Poland, European Union<br>
  <strong>Official Inquiries:</strong> <a href="mailto:support@crw-plus.com">support@crw-plus.com</a><br>
  <strong>Webmaster &amp; Infrastructure:</strong> <a href="mailto:support@sport.konekocode.pl">support@sport.konekocode.pl</a>
</div>
<p class="muted">Note: Formal corporate registration details, tax identification numbers (NIP/VAT), and business registry entries (KRS/CEIDG) will be published here upon completion of corporate incorporation.</p>

<h2>2. Data Protection Officer &amp; Privacy Contact</h2>
<p>For inquiries relating to the EU General Data Protection Regulation (GDPR / RODO), data rights requests, or supervisory reporting:</p>
<p><strong>Contact Email:</strong> <a href="mailto:support@crw-plus.com">support@crw-plus.com</a> (Subject: Data Protection)</p>

<h2>3. Hosting &amp; Technical Infrastructure</h2>
<p>CRW+ web services, databases, and application backends are hosted on secure, certified infrastructure physically located within the <strong>European Union</strong> (Poland / Germany), adhering to ISO/IEC 27001 security standards.</p>

<h2>4. Intellectual Property &amp; Trademarks</h2>
<p>The "CRW+", "CRW Plus" brand, application logos, software architecture, UI layout, and proprietary source code are the intellectual property of the operator. All rights reserved.</p>
`;

// 18. SUBSCRIPTIONS & BILLING POLICY (FUTURE TIERS)
const subscriptionsContent = `
<p>This policy outlines the subscription, billing, and cancellation terms applicable to future <strong>CRW+ Premium</strong> memberships.</p>

<div class="callout callout-info">
  <strong>Current Status: 100% Free Core Platform</strong><br>
  At present, all core athletic tracking, workout analysis, social leaderboards, and club features on CRW+ are completely free. When optional paid Premium tiers are released, the following terms will apply.
</div>

<h2>1. Subscription Options &amp; Billing Cycles</h2>
<p>Future Premium memberships may be offered on a <strong>monthly</strong> or <strong>annual</strong> recurring billing cycle. Subscription fees will be clearly displayed prior to purchase, including applicable value-added tax (VAT) based on your country of residence.</p>

<h2>2. Auto-Renewal Terms</h2>
<p>Subscriptions automatically renew at the end of each billing cycle unless cancelled at least 24 hours prior to the renewal date. Your payment method on file (via Apple App Store, Google Play Store, or secure web checkout) will be charged automatically upon renewal.</p>

<h2>3. How to Cancel Your Subscription</h2>
<p>You may cancel your subscription at any time without penalty:</p>
<ul>
  <li><strong>Apple App Store (iOS):</strong> Open <em>iPhone Settings &gt; Your Apple ID &gt; Subscriptions &gt; CRW+</em> &gt; Tap <em>Cancel Subscription</em>.</li>
  <li><strong>Google Play Store (Android):</strong> Open <em>Google Play &gt; Profile icon &gt; Payments &amp; subscriptions &gt; Subscriptions &gt; CRW+</em> &gt; Tap <em>Cancel Subscription</em>.</li>
  <li><strong>Web Checkout:</strong> Navigate to your Account Settings on <a href="https://sport.konekocode.pl">sport.konekocode.pl</a> and click "Manage Subscription".</li>
</ul>
<p><strong>Access After Cancellation:</strong> When you cancel, your Premium benefits remain active until the end of your current paid billing period. You will not be charged again.</p>

<h2>4. Refund Policy</h2>
<p>Subscription payments made through the Apple App Store or Google Play Store are subject to Apple's and Google's respective customer refund policies. To request a refund for an App Store or Google Play purchase, please submit a request directly through your Apple or Google account.</p>

<h2>5. Price Modifications</h2>
<p>We reserve the right to modify subscription fees. Any price change will be communicated with at least <strong>30 days advance notice</strong> via email and in-app notification. If you do not accept the new price, you may cancel prior to the effective date.</p>
`;

// Define all 18 pages to generate
const pages = [
  { slug: 'privacy', title: 'Privacy Policy', badge: 'Legal & Privacy', content: privacyContent },
  { slug: 'terms', title: 'Terms of Service', badge: 'Legal Terms', content: termsContent },
  { slug: 'delete-account', title: 'Account & Data Deletion', badge: 'Data Privacy', content: deleteAccountContent, extraScripts: deleteAccountScript },
  { slug: 'data-safety', title: 'Data Safety Summary', badge: 'Transparency', content: dataSafetyContent },
  { slug: 'support', title: 'Support Center', badge: 'Customer Help', content: supportContent },
  { slug: 'community-guidelines', title: 'Community Guidelines', badge: 'Conduct & Standards', content: communityGuidelinesContent },
  { slug: 'moderation', title: 'Reporting & Moderation Policy', badge: 'Safety & Review', content: moderationContent },
  { slug: 'health-data', title: 'Health & Fitness Data Policy', badge: 'Apple & Google Health', content: healthDataContent },
  { slug: 'location-data', title: 'Location & GPS Policy', badge: 'Location Privacy', content: locationDataContent },
  { slug: 'safety', title: 'SOS & Safety Disclaimer', badge: 'Safety Advisory', content: safetyContent },
  { slug: 'fitness-disclaimer', title: 'Health & Fitness Disclaimer', badge: 'Medical Disclaimer', content: fitnessDisclaimerContent },
  { slug: 'event-policy', title: 'Clubs & Events Policy', badge: 'Community Events', content: eventPolicyContent },
  { slug: 'security', title: 'Security & Vulnerability Reporting', badge: 'Cybersecurity', content: securityContent },
  { slug: 'copyright', title: 'Copyright & IP Policy', badge: 'Intellectual Property', content: copyrightContent },
  { slug: 'marketing-preferences', title: 'Marketing Preferences', badge: 'Communications', content: marketingPreferencesContent },
  { slug: 'children-safety', title: "Children's Safety (13+)", badge: 'Child Safety', content: childrenSafetyContent },
  { slug: 'legal', title: 'Legal & Operator Information', badge: 'Operator Info', content: legalContent },
  { slug: 'subscriptions', title: 'Subscriptions & Billing Policy', badge: 'Pricing & Billing', content: subscriptionsContent },
];

console.log(`Generating ${pages.length} legal & policy pages...`);

for (const p of pages) {
  const html = renderPage({
    title: p.title,
    badge: p.badge,
    content: p.content,
    extraHead: p.extraHead || '',
    extraScripts: p.extraScripts || '',
  });

  // Target 1: apps/mobile/public/<slug>.html
  fs.writeFileSync(path.join(publicDir, `${p.slug}.html`), html, 'utf-8');

  // Target 2: apps/mobile/public/<slug>/index.html
  const pubSubDir = path.join(publicDir, p.slug);
  if (!fs.existsSync(pubSubDir)) fs.mkdirSync(pubSubDir, { recursive: true });
  fs.writeFileSync(path.join(pubSubDir, 'index.html'), html, 'utf-8');

  // Target 3: apps/mobile/dist/<slug>.html
  if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, `${p.slug}.html`), html, 'utf-8');

    // Target 4: apps/mobile/dist/<slug>/index.html
    const distSubDir = path.join(distDir, p.slug);
    if (!fs.existsSync(distSubDir)) fs.mkdirSync(distSubDir, { recursive: true });
    fs.writeFileSync(path.join(distSubDir, 'index.html'), html, 'utf-8');
  }

  console.log(`✔ Generated /${p.slug} (${p.title})`);
}

console.log('Done! All 18 legal & policy subpages generated successfully.');
