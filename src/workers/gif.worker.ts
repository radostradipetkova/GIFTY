import { GIFEncoder, quantize, applyPalette } from 'gifenc';

type Incoming =
  | { type: 'start'; repeat: number }
  | { type: 'frame'; rgba: ArrayBuffer; width: number; height: number; delay: number }
  | { type: 'finish' };
let encoder: ReturnType<typeof GIFEncoder> | null = null;
let firstFrame = true;
let repeat = 0;
self.onmessage = (message: MessageEvent<Incoming>) => {
  try {
    const data = message.data;
    if (data.type === 'start') {
      encoder = GIFEncoder(); firstFrame = true; repeat = data.repeat;
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      if (!encoder) throw new Error('GIF encoder not initialized.');
      const rgba = new Uint8ClampedArray(data.rgba);
      const palette = quantize(rgba, 128);
      const pixels = applyPalette(rgba, palette);
      encoder.writeFrame(pixels, data.width, data.height,
        { palette, delay: data.delay, repeat: firstFrame ? repeat : undefined, dispose: 2 });
      firstFrame = false;
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'finish') {
      if (!encoder || firstFrame) throw new Error('No animated GIF frames were generated.');
      encoder.finish();
      const bytes = encoder.bytes();
      self.postMessage({ type: 'finished', bytes: bytes.buffer }, [bytes.buffer]);
      encoder = null;
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
