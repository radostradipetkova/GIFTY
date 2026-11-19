import type { Settings } from './presets';
import { getExportDuration } from './presets';
import { renderFrame, type ImageSource } from './renderer';

export interface GifExportOptions {
  width: number; height: number; fps: number; duration: number; repeat?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  render: (ctx: CanvasRenderingContext2D, progress: number) => Promise<void> | void;
}

/** Encodes one frame at a time in a Worker, avoiding an entire RGBA frame-buffer in memory. */
export function exportAnimatedGif(options: GifExportOptions): Promise<Blob> {
  const { width, height, fps, duration, signal, onProgress, render } = options;
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0 || width * height > 1_638_400) {
    return Promise.reject(new Error('The canvas resolution is too large for a safe export.'));
  }
  if (typeof Worker === 'undefined') return Promise.reject(new Error('This browser does not support GIF encoding workers.'));
  const count = Math.max(2, Math.ceil(duration * fps));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return Promise.reject(new Error('Canvas 2D is unavailable.'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/gif.worker.ts', import.meta.url), { type: 'module' });
    let index = 0;
    let ended = false;
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const fail = (error: Error) => { if (ended) return; ended = true; cleanup(); reject(error); };
    const abort = () => fail(new DOMException('Export cancelled.', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = (e) => fail(new Error(`GIF encoding failed: ${e.message}`));
    worker.onmessage = async (event: MessageEvent<{type:string;bytes?:ArrayBuffer;message?:string}>) => {
      if (ended) return;
      if (event.data.type === 'error') { fail(new Error(event.data.message || 'GIF encoding failed.')); return; }
      if (event.data.type === 'finished' && event.data.bytes) {
        ended = true; cleanup(); onProgress?.(1); resolve(new Blob([event.data.bytes], { type: 'image/gif' })); return;
      }
      if (event.data.type !== 'ready') return;
      if (index >= count) { worker.postMessage({ type: 'finish' }); return; }
      try {
        await render(ctx, index / count);
        if (signal?.aborted || ended) return;
        const frame = ctx.getImageData(0, 0, width, height);
        worker.postMessage({ type: 'frame', width, height, rgba: frame.data.buffer,
          delay: Math.round(1000 / fps) }, [frame.data.buffer]);
        index += 1; onProgress?.(Math.min(.98, index / count));
      } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
    };
    worker.postMessage({ type: 'start', repeat: options.repeat ?? 0 });
  });
}

export function exportImageGif(image: ImageSource, settings: Settings, width: number, height: number,
  signal?: AbortSignal, onProgress?: (fraction:number) => void) {
  return exportAnimatedGif({ width, height, fps: settings.fps, duration: getExportDuration(settings),
    repeat: settings.loopMode === 'once' ? -1 : 0, signal, onProgress,
    render: (ctx, progress) => renderFrame(ctx, image, settings, progress) });
}

export function supportedVideoFormats(): Array<{ label: string; mime: string; extension: string }> {
  if (typeof MediaRecorder === 'undefined') return [];
  return [
    { label: 'WebM · VP9', mime: 'video/webm;codecs=vp9', extension: 'webm' },
    { label: 'WebM · VP8', mime: 'video/webm;codecs=vp8', extension: 'webm' },
    { label: 'WebM', mime: 'video/webm', extension: 'webm' },
    { label: 'MP4', mime: 'video/mp4', extension: 'mp4' },
  ].filter(format => MediaRecorder.isTypeSupported(format.mime));
}

export function exportVideo(image: ImageSource, settings: Settings, width:number, height:number,
  mime: string, signal?: AbortSignal, onProgress?: (fraction:number)=>void): Promise<Blob> {
  if (!supportedVideoFormats().some(format => format.mime === mime)) return Promise.reject(new Error('This video format is not supported by your browser.'));
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || !canvas.captureStream) return Promise.reject(new Error('Canvas video capture is not supported.'));
  const stream = canvas.captureStream(settings.fps);
  const durationMs = getExportDuration(settings) * 1000;
  return new Promise((resolve, reject) => {
    const frames: BlobPart[] = []; let done = false; let raf = 0;
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 }); }
    catch (e) { stream.getTracks().forEach(t=>t.stop()); reject(e); return; }
    const cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t=>t.stop()); signal?.removeEventListener('abort', abort); };
    const abort = () => { if (done) return; done = true; cleanup(); if (recorder.state !== 'inactive') recorder.stop(); reject(new DOMException('Video export cancelled.', 'AbortError')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    recorder.ondataavailable = e => { if (e.data.size) frames.push(e.data); };
    recorder.onerror = () => { if (done) return; done = true; cleanup(); reject(new Error('Video recorder failed.')); };
    recorder.onstop = () => { if (done) return; done = true; cleanup(); const blob = new Blob(frames, { type: mime });
      if (!blob.size) reject(new Error('The video file was empty.')); else { onProgress?.(1); resolve(blob); } };
    renderFrame(context, image, settings, 0);
    recorder.start(250);
    const start = performance.now();
    const draw = (now: number) => {
      if (done) return;
      const elapsed = now - start;
      renderFrame(context, image, settings, Math.min(elapsed / durationMs, .9999));
      onProgress?.(Math.min(.98, elapsed / durationMs));
      if (elapsed >= durationMs) recorder.stop(); else raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) return Promise.reject(new Error('Please upload a JPEG, PNG or WebP image.'));
  if (file.size > 18 * 1024 * 1024) return Promise.reject(new Error('Please choose an image under 18 MB.'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); if (!img.width || !img.height || img.width * img.height > 35_000_000) reject(new Error('Image dimensions are too large.')); else resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image appears corrupted or cannot be decoded.')); };
    img.src = url;
  });
}

export function loadDemoImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve,reject) => { const img = new Image(); img.onload = ()=>resolve(img); img.onerror = ()=>reject(new Error('Demo image failed to load.')); img.src = url; });
}
