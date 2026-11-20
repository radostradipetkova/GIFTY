import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('showcase-output');
await fs.mkdir(out, {recursive:true});
const server = spawn('npm', ['run','preview','--','--host','127.0.0.1','--port','4173'], {stdio:['ignore','pipe','pipe']});
let serverLog='';
server.stdout.on('data', d=>serverLog+=d.toString());
server.stderr.on('data', d=>serverLog+=d.toString());
const origin='http://127.0.0.1:4173';
for(let attempt=0;attempt<100;attempt++){
  try {const r=await fetch(origin);if(r.ok)break;}catch{}
  await new Promise(r=>setTimeout(r,140));
}
const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
const context = await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1,recordVideo:{dir:out,size:{width:1920,height:1080}},reducedMotion:'no-preference',colorScheme:'dark',acceptDownloads:true});
const page = await context.newPage();
const stamps=[]; const errors=[]; const start=Date.now();
const mark=(label)=>stamps.push({label,seconds:+((Date.now()-start)/1000).toFixed(2)});
page.on('pageerror', e=>errors.push(e.message));
const pause=(ms)=>page.waitForTimeout(ms);
const pos=async(selector)=>{
  const r=await page.locator(selector).first().boundingBox();
  if(r)await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5,{steps:10});
};
const snap=async(n)=>page.screenshot({path:path.join(out,n+'.png'),animations:'allow'});
try{
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('.hero h1').waitFor();
  await pause(650);mark('homepage');
  await snap('01-home');
  await pos('.hero-actions .btn-lime');
  await pause(400);
  await page.locator('.hero-actions .btn-lime').first().click();
  await page.locator('.effect-card').first().waitFor();
  await pause(450); mark('studio');
  await snap('02-studio');
  const effects=['Dream Float','Parallax Tilt','VHS Glitch','Ken Burns','Hypnotic Pulse','Orbital Motion','Reality Split','Dream Blur','Floating Product'];
  for(const [i,name] of effects.entries()){
    const card=page.locator('.effect-card').filter({hasText:name}).first();
    await card.scrollIntoViewIfNeeded();
    await card.hover({force:true});
    await pause(130);
    await card.click({force:true});
    await pause(i===2||i===6?740:570);
    mark(name);
    if([2,4,6,8].includes(i))await snap('effect-'+name.replaceAll(' ','-').toLowerCase());
  }
  await page.locator('.demo-tile').filter({hasText:'Dreamscape'}).click();
  await pause(650);mark('demo-switch');
  await snap('03-demo-switch');
  const sliders=page.locator('.settings-panel .range-row input[type=range]');
  async function setSlider(which, frac){
    const el=sliders.nth(which);
    await el.scrollIntoViewIfNeeded();
    const r=await el.boundingBox();
    if(r){
      await page.mouse.move(r.x+r.width*.25,r.y+r.height/2,{steps:6});
      await page.mouse.down();
      await page.mouse.move(r.x+r.width*frac,r.y+r.height/2,{steps:15});
      await page.mouse.up();
    }
  }
  await setSlider(0,.85);
  await pause(180);
  await setSlider(1,.76);
  await pause(230);
  await setSlider(2,.36);
  await pause(260);
  mark('motion-controls');await snap('04-motion-controls');
  await page.locator('.settings-panel .form-field select').first().selectOption('5');
  await page.locator('.settings-panel .form-field select').nth(1).selectOption('pingpong');
  await pause(370);
  await page.locator('.aspect-choice').filter({hasText:'1:1'}).click();
  await pause(480);
  await page.locator('.aspect-choice').filter({hasText:'16:9'}).click();
  await pause(450);
  mark('canvas-controls');await snap('05-canvas');
  await page.getByRole('button',{name:/Color & adjustments/}).click();
  await pause(350);mark('advanced-options');
  await snap('06-color-options');
  await page.getByRole('button',{name:/Crop & position/}).click();
  await pause(300);mark('crop-options');
  await snap('07-crop-options');
  const e=page.locator('.export-formats').first();
  await e.scrollIntoViewIfNeeded();
  await pause(300);mark('export');
  await snap('08-export');
  const formatButtons=page.locator('.export-formats button');
  if(await formatButtons.count()>1){
    await formatButtons.nth(1).click();
    await pause(400);
  }
  await formatButtons.first().click();
  await pause(320);
  // Configure a short GIF to show genuine browser export without holding the presentation.
  const duration=page.getByRole('combobox',{name:'Duration'});
  await duration.selectOption('1');
  const frameRate=page.getByRole('combobox',{name:'Frame rate'});
  await frameRate.selectOption('10');
  await page.locator('.export-btn').first().scrollIntoViewIfNeeded();
  await pause(200);
  const downloadPromise=page.waitForEvent('download',{timeout:30000}).catch(()=>null);
  await page.locator('.export-btn').click();
  mark('export-click');
  const download=await downloadPromise;
  await pause(450);
  if(download) {await download.saveAs(path.join(out,'example.gif')); mark('gif-export-success');}
  await snap('09-export-success');
  await page.locator('.nav').getByRole('button',{name:/Explore Effects/}).click();
  await pause(450);mark('gallery');
  await snap('10-gallery');
  await page.mouse.wheel(0,480);
  await pause(500);
  await page.mouse.wheel(0,570);
  await pause(450); mark('gallery-bottom');
  await page.locator('.wordmark').click();
  await pause(700);mark('home-end');
  await snap('11-home-end');
} catch(e){
  errors.push(String(e));
} finally {
  await fs.writeFile(path.join(out,'timestamps.json'),JSON.stringify({stamps,errors,serverLog},null,2));
  const video=page.video();
  await context.close();
  if(video) await video.saveAs(path.join(out,'raw.webm'));
  await browser.close();server.kill('SIGTERM');
}
console.log(JSON.stringify({stamps,errors},null,2));
if(errors.length)process.exitCode=1;
