import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
const env = await readFile('apps/mobile/.env', 'utf8');
const api = env.match(/^EXPO_PUBLIC_API_URL=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '') || 'http://localhost:4000';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
await mkdir('artifacts/entry', { recursive: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
await context.addInitScript(() => {localStorage.setItem('crw.theme','dark');localStorage.removeItem('crw.age.v1');});
const page = await context.newPage();
let mode = 'login';
let legal = false;
let completed = false;
const saved = [];
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route(`${api}/**`, async route => {
 const path = new URL(route.request().url()).pathname;
 let data = {};
 if(path.endsWith('/auth/me')) {
  if(mode === 'login') return route.fulfill({status:401,json:{error:'Unauthorized'}});
  data = {id:'entry-fixture',display_name:'Runner',account:{language:'en',legal_version:legal?'2026-09-17':null,onboarding_completed_at:completed?'2026-09-21':null}};
 } else if(path.endsWith('/account/legal')) legal = true;
 else if(path.endsWith('/account') && route.request().method()==='PATCH') {const body = route.request().postDataJSON();saved.push(body);if(body.onboardingComplete)completed=true;}
 else if(path.endsWith('/catalog')) data={categories:[],cities:[]};
 else if(path.endsWith('/events')) data={events:[]};
 else if(path.endsWith('/communities')||path.endsWith('/notifications')) data=[];
 else if(path.endsWith('/workouts')) data={workouts:[]};
 await route.fulfill({json:data});
});
async function shot(name) {await page.screenshot({path:`artifacts/entry/${name}.png`});}
try {
 await page.goto('http://localhost:8081',{waitUntil:'domcontentloaded',timeout:120000});
 await expect(page.getByText('GOOD TO\nHAVE YOU BACK.',{exact:true})).toBeVisible({timeout:60000});
 await shot('login-430');
 await page.getByRole('button',{name:'New here? Create an account',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Your name',exact:true})).toBeVisible();
 await shot('signup-430');
 mode='consent'; await page.reload();
 const agree=page.getByRole('button',{name:'Agree and continue',exact:true});
 await expect(agree).toBeDisabled(); await shot('consent-430');
 await page.getByRole('checkbox').nth(0).click({position:{x:12,y:22}}); await expect(agree).toBeDisabled();
 await page.getByRole('checkbox').nth(1).click({position:{x:12,y:22}}); await expect(agree).toBeEnabled();
 await agree.click();
 await expect(page.getByText('YOUR LANGUAGE.',{exact:true})).toBeVisible({timeout:20000});
 await page.waitForTimeout(6700); await shot('step-1-430');
 await page.getByRole('textbox',{name:'Search languages'}).fill('zzzz');
 await expect(page.getByRole('radio')).toHaveCount(0);
 await page.getByRole('textbox',{name:'Search languages'}).fill('English');
 await page.getByRole('radio',{name:'English',exact:true}).click();
 await page.getByRole('textbox',{name:'Search languages'}).fill('');
 for(const width of [320,1440]) {await page.setViewportSize({width,height:932});await shot(`step-1-${width}`);}
 await page.setViewportSize({width:430,height:932});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByText('YOUR COUNTRY.',{exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Search countries'}).fill('Lebanon');
 await page.getByRole('radio',{name:'Lebanon',exact:true}).click();await shot('step-2-430');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeDisabled();
 await page.getByRole('textbox').fill('5');await expect(page.getByText('Enter a value between 13 and 120 years.')).toBeVisible();
 await page.getByRole('textbox').fill('29'); await shot('step-3-430');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('textbox').fill('72.5'); await shot('step-4-430');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('textbox').fill('178'); await shot('step-5-430');
 await page.getByRole('button',{name:'Previous question',exact:true}).click();
 await expect(page.getByRole('textbox')).toHaveValue('72.5');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.getByRole('textbox')).toHaveValue('178');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 await shot('step-6-430');
 await page.getByRole('button',{name:'Finish setup',exact:true}).click();
 await expect.poll(()=>saved.some(b=>b.onboardingComplete)).toBe(true);
 expect(saved.find(b=>b.onboardingComplete)).toMatchObject({language:'en',countryCode:'LB',age:29,weightKg:72.5,heightCm:178,marketingOptIn:false});
 expect(errors).toEqual([]);
 console.log('Passed: login/signup, consent gating, search, six steps, input validation, back navigation, saved answers, responsive screenshots, no runtime errors.');
} finally {await browser.close();}

