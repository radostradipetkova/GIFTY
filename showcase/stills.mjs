import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('showcase-stills');await fs.mkdir(output,{recursive:true});
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4175'],{stdio:'ignore'});
for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4175/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,120));}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1.3333333333, reducedMotion:'no-preference'});
const page=await context.newPage();const saved=[];const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const snap=async(name)=>{await page.screenshot({path:path.join(output,name+'.png'),animations:'allow'});saved.push(name);};
try{
await page.goto('http://127.0.0.1:4175/',{waitUntil:'domcontentloaded'});
await page.locator('.hero h1').waitFor();await snap('00-home');
await page.locator('.hero-actions .btn-lime').first().click();await page.locator('.effect-card').first().waitFor();await page.locator('.aspect-choice').filter({hasText:'16:9'}).click();await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(280);
await snap('01-studio');
const names=['Cinematic Zoom','Dream Float','Parallax Tilt','VHS Glitch','Ken Burns','Hypnotic Pulse','Orbital Motion','Reality Split','Dream Blur','Floating Product'];
for(const [i,name] of names.entries()){
 const elt=page.locator('.effect-card').filter({hasText:name}).first();
 await elt.scrollIntoViewIfNeeded();await elt.click({force:true});
 await page.waitForTimeout(180);await snap(String(i+2).padStart(2,'0')+'-'+name.toLowerCase().replaceAll(' ','-'));
}
await page.locator('.demo-tile').filter({hasText:'Dreamscape'}).click();await page.waitForTimeout(170);await snap('12-demo');
await page.locator('.settings-panel .range-row input').first().scrollIntoViewIfNeeded();await snap('13-controls');
await page.locator('.aspect-choice').filter({hasText:'1:1'}).click();await page.waitForTimeout(160);await snap('14-square');
await page.getByRole('button',{name:/Color & adjustments/}).click();await snap('15-adjustments');
await page.getByRole('button',{name:/Crop & position/}).click();await snap('16-crop');
await page.locator('.export-formats').scrollIntoViewIfNeeded();await snap('17-export');
await page.locator('.nav').getByRole('button',{name:/Explore Effects/}).click();await page.waitForTimeout(240);await snap('18-gallery');
await page.mouse.wheel(0,470);await page.waitForTimeout(150);await snap('19-gallery-scroll');
}catch(e){errors.push(String(e));}
finally{await fs.writeFile(path.join(output,'metadata.json'),JSON.stringify({saved,errors},null,2));await browser.close();server.kill('SIGTERM');}
console.log({saved,errors});
if(errors.length)process.exitCode=1;