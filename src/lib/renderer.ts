import type { Settings } from './presets';

export type ImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | HTMLVideoElement;
export function phaseAt(progress: number, settings: Settings) {
  let p = ((progress % 1) + 1) % 1;
  if (settings.reverse) p = 1 - p;
  if (settings.loopMode === 'pingpong') p = 1 - Math.abs(2 * p - 1);
  if (settings.easing === 'smooth') p = p * p * (3 - 2 * p);
  if (settings.easing === 'sine') p = (1 - Math.cos(Math.PI * p)) / 2;
  return p;
}

export function computeMotion(progress: number, settings: Settings) {
  const p = phaseAt(progress, settings);
  const theta = p * Math.PI * (settings.loopMode === 'pingpong' ? 1 : 2);
  const wave = Math.sin(theta);
  const cycle = Math.cos(theta);
  const amount = settings.intensity / 100;
  return { p, wave, cycle, amount, radians: settings.direction * Math.PI / 180 };
}

function photo(ctx: CanvasRenderingContext2D, image: ImageSource, s: Settings, width: number, height: number,
  opts: { dx?: number; dy?: number; zoom?: number; rotation?: number; extraBlur?: number; opacity?: number } = {}) {
  const { dx = 0, dy = 0, zoom = 1, rotation = 0, extraBlur = 0, opacity = 1 } = opts;
  const iw = image instanceof HTMLVideoElement ? image.videoWidth : image.width;
  const ih = image instanceof HTMLVideoElement ? image.videoHeight : image.height;
  if (!iw || !ih) return;
  const scale = s.fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih);
  const drawnW = iw * scale;
  const drawnH = ih * scale;
  const px = (width - drawnW) * (s.positionX / 100);
  const py = (height - drawnH) * (s.positionY / 100);
  ctx.save();
  ctx.translate(width / 2 + dx, height / 2 + dy);
  ctx.rotate(rotation);
  ctx.scale(zoom, zoom);
  ctx.globalAlpha = opacity;
  ctx.filter = `brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturation}%) blur(${s.blur + extraBlur}px)`;
  ctx.drawImage(image, px - width / 2, py - height / 2, drawnW, drawnH);
  ctx.restore();
}

/** Draw an unanimated, unfiltered version of the uploaded image for before/after comparison. */
export function renderOriginalFrame(ctx: CanvasRenderingContext2D, image: ImageSource, settings: Settings) {
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, width, height);
  photo(ctx, image, { ...settings, brightness: 100, contrast: 100, saturation: 100, blur: 0 }, width, height);
  ctx.restore();
}

/** Deterministic renderer shared by both preview and export. Time is normalized [0, 1). */
export function renderFrame(ctx: CanvasRenderingContext2D, image: ImageSource, s: Settings, progress: number) {
  const { width: w, height: h } = ctx.canvas;
  const { wave, cycle, amount: a, radians: r } = computeMotion(progress, s);
  const magnitude = Math.min(w, h);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = s.background;
  ctx.fillRect(0, 0, w, h);
  switch (s.effect) {
    case 'zoom': {
      photo(ctx, image, s, w, h, { zoom: 1.045 + (1 - cycle) * .085 * a });
      break;
    }
    case 'float': {
      photo(ctx, image, s, w, h, { zoom: 1.1, dx: Math.cos(r) * wave * magnitude * .055 * a,
        dy: (Math.sin(r) * wave + cycle * .55) * magnitude * .065 * a, rotation: wave * .018 * a });
      break;
    }
    case 'parallax': {
      photo(ctx, image, s, w, h, { zoom: 1.14 + .03 * a, dx: Math.cos(r) * wave * magnitude * .065 * a,
        dy: Math.sin(r + .65) * cycle * magnitude * .06 * a, rotation: wave * .035 * a });
      ctx.fillStyle = `rgba(202,255,131,${.045 * a * (1 + wave)})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'vhs': {
      photo(ctx, image, s, w, h, { zoom: 1.045 });
      const shift = wave * w * a * .018;
      ctx.save();
      ctx.beginPath();
      const band = (0.5 + .34 * cycle) * h;
      ctx.rect(0, band, w, h * (.065 + .04 * a));
      ctx.clip();
      photo(ctx, image, s, w, h, { zoom: 1.045, dx: shift });
      ctx.restore();
      ctx.fillStyle = `rgba(255,55,115,${.14 * a * Math.abs(wave)})`;
      ctx.fillRect(Math.max(0, shift), 0, 7 * a, h);
      ctx.fillStyle = `rgba(60,220,255,${.13 * a * Math.abs(cycle)})`;
      ctx.fillRect(w - 7 * a + Math.min(0, shift), 0, 7 * a, h);
      ctx.fillStyle = `rgba(0,0,0,${.12 * a})`;
      for (let y = 0; y < h; y += 5) ctx.fillRect(0, y, w, 1);
      break;
    }
    case 'kenburns': {
      photo(ctx, image, s, w, h, { zoom: 1.16 + .035 * a * (1 - cycle), dx: wave * magnitude * .057 * a * Math.cos(r),
        dy: cycle * magnitude * .036 * a * (Math.sin(r) + .7) });
      break;
    }
    case 'pulse': {
      photo(ctx, image, s, w, h, { zoom: 1.03 + .085 * a * (1 - cycle) });
      ctx.fillStyle = `rgba(202,255,131,${.085 * a * (1 - cycle)})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'orbit': {
      photo(ctx, image, s, w, h, { zoom: 1.13, rotation: wave * .068 * a,
        dx: wave * magnitude * .027 * a, dy: cycle * magnitude * .026 * a });
      break;
    }
    case 'split': {
      photo(ctx, image, s, w, h, { zoom: 1.075 });
      const mid = w * (.5 + .16 * wave * a);
      ctx.save(); ctx.beginPath(); ctx.rect(mid, 0, w - mid, h); ctx.clip();
      photo(ctx, image, s, w, h, { zoom: 1.075, dx: wave * w * .08 * a, dy: cycle * h * .02 * a });
      ctx.restore();
      ctx.fillStyle = `rgba(202,255,131,${.55 * a})`; ctx.fillRect(mid - 1.5, 0, Math.max(1.5, 3 * a), h);
      break;
    }
    case 'blur': {
      photo(ctx, image, s, w, h, { zoom: 1.09, dx: wave * magnitude * .025 * a,
        extraBlur: Math.abs(wave) * 6 * a });
      ctx.fillStyle = `rgba(211,195,255,${.12 * a * Math.abs(cycle)})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'product': {
      photo(ctx, image, s, w, h, { zoom: 1.07 + .045 * a * (1 - cycle),
        dy: wave * magnitude * .06 * a, rotation: wave * .012 * a });
      const grd = ctx.createLinearGradient(0, h * .7, 0, h);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(0,0,0,${.20 * a})`);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
      break;
    }
  }
  ctx.restore();
}
