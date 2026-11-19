import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { GifReader } from 'omggif';

test('GIFTY generates a genuine browser-encoded GIF after changing the animation',async({page})=>{
  await page.goto('/studio');
  await expect(page.getByRole('heading',{name:/Motion studio/i})).toBeVisible();
  await expect(page.getByText('Afterglow · demo')).toBeVisible();
  await page.getByRole('button',{name:/Dream Float/}).click();
  await page.getByRole('button',{name:/Crop & position/}).click();
  await page.getByRole('button',{name:/Custom/}).click();
  await page.getByRole('spinbutton',{name:'Width'}).fill('320');
  await page.getByRole('spinbutton',{name:'Height'}).fill('240');
  await page.getByRole('combobox',{name:'Duration'}).selectOption('1');
  await page.getByRole('combobox',{name:'Frame rate'}).selectOption('10');
  const browserErrors: string[] = [];
  page.on('pageerror', e => browserErrors.push(e.message));
  page.on('console', m => { if (m.type()==='error') browserErrors.push(m.text()); });
  let download;
  try {
    [download]=await Promise.all([
      page.waitForEvent('download',{timeout:50_000}),
      page.getByRole('button',{name:/Download GIF/}).click(),
    ]);
  } catch {
    const state=await page.evaluate(()=>({
      alert: document.querySelector('[role=alert]')?.textContent,
      status: document.querySelector('[role=status]')?.textContent,
      progress: document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow'),
      button: document.querySelector('.export-btn')?.textContent,
    }));
    throw new Error(`GIF download missing. UI state: ${JSON.stringify(state)}; console: ${browserErrors.join(' | ')}`);
  }
  expect(download.suggestedFilename()).toMatch(/\.gif$/);
  const bytes=fs.readFileSync(await download.path());
  const reader=new GifReader(bytes);
  expect(reader.width).toBe(320);expect(reader.height).toBe(240);
  expect(reader.numFrames()).toBeGreaterThan(2);
  const a=new Uint8Array(reader.width*reader.height*4),b=new Uint8Array(reader.width*reader.height*4);
  reader.decodeAndBlitFrameRGBA(0,a); reader.decodeAndBlitFrameRGBA(Math.floor(reader.numFrames()/2),b);
  expect(Buffer.compare(Buffer.from(a),Buffer.from(b))).not.toBe(0);
});

test('homepage navigation and AI limitations are communicated',async({page})=>{
  await page.goto('/');
  await expect(page.getByText(/Your pictures/).first()).toBeVisible();
  await page.getByRole('button',{name:/AI Motion Lab/}).click();
  await expect(page.getByRole('heading',{name:/AI Motion lab/i})).toBeVisible();
  await expect(page.getByText(/No GPU backend connected/)).toBeVisible();
  await expect(page.getByText(/Import a video/)).toBeVisible();
});
