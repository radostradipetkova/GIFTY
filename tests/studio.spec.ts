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

test('uploaded PNG can be previewed and exported as a playable browser video', async ({page}) => {
  await page.goto('/studio');
  const imageBase64 = await page.evaluate(() => {
    const canvas=document.createElement('canvas'); canvas.width=320; canvas.height=240;
    const context=canvas.getContext('2d')!;
    context.fillStyle='#da385c';context.fillRect(0,0,320,240);
    context.fillStyle='#caef80';context.fillRect(40,40,180,120);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'uploaded-test.png', mimeType: 'image/png', buffer: Buffer.from(imageBase64,'base64')
  });
  await expect(page.getByText('uploaded-test.png')).toBeVisible();
  await page.getByRole('combobox',{name:'Duration'}).selectOption('1');
  await page.getByRole('combobox',{name:'Frame rate'}).selectOption('10');
  const webm = page.locator('.export-formats button').filter({hasText:/WebM|VP9|VP8/}).first();
  test.skip(await webm.count()===0, 'WebM MediaRecorder is unsupported in this browser');
  await webm.click();
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:30_000}),
    page.locator('.export-btn').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  const bytes=fs.readFileSync(await download.path());
  expect(bytes.length).toBeGreaterThan(1000);
  // EBML magic marks a WebM/Matroska container; confirms this is not a renamed image.
  expect(bytes.subarray(0,4).toString('hex')).toBe('1a45dfa3');
});
