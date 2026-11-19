export const effects = [
  { id: 'zoom', name: 'Cinematic Zoom', subtitle: 'An elegant slow push-in.', group: 'CINEMATIC', symbol: '◉' },
  { id: 'float', name: 'Dream Float', subtitle: 'Weightless, effortless movement.', group: 'DREAMY', symbol: '〰' },
  { id: 'parallax', name: 'Parallax Tilt', subtitle: 'Add an illusion of perspective.', group: 'CINEMATIC', symbol: '◇' },
  { id: 'vhs', name: 'VHS Glitch', subtitle: 'Distorted analog memories.', group: 'EXPERIMENTAL', symbol: '▤' },
  { id: 'kenburns', name: 'Ken Burns', subtitle: 'A timeless wandering camera.', group: 'CINEMATIC', symbol: '▧' },
  { id: 'pulse', name: 'Hypnotic Pulse', subtitle: 'A captivating rhythmic glow.', group: 'DREAMY', symbol: '◎' },
  { id: 'orbit', name: 'Orbital Motion', subtitle: 'Slowly rotating perspective.', group: 'EXPERIMENTAL', symbol: '↺' },
  { id: 'split', name: 'Reality Split', subtitle: 'A beautifully broken dimension.', group: 'EXPERIMENTAL', symbol: '◫' },
  { id: 'blur', name: 'Dream Blur', subtitle: 'Atmospheric shifting focus.', group: 'DREAMY', symbol: '◌' },
  { id: 'product', name: 'Floating Product', subtitle: 'Premium levitating imagery.', group: 'CINEMATIC', symbol: '✧' },
] as const;
export type EffectId = typeof effects[number]['id'];
export type Aspect = 'original' | 'square' | 'wide' | 'vertical' | 'custom';
export type LoopMode = 'loop' | 'once' | 'pingpong';
export type Easing = 'sine' | 'smooth' | 'linear';
export interface Settings {
  effect: EffectId;
  intensity: number;
  speed: number;
  direction: number;
  easing: Easing;
  duration: number;
  loopMode: LoopMode;
  reverse: boolean;
  aspect: Aspect;
  width: number;
  height: number;
  fit: 'cover' | 'contain';
  positionX: number;
  positionY: number;
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  background: string;
  fps: number;
}
export const defaults: Settings = {
  effect: 'zoom', intensity: 48, speed: 1, direction: 0, easing: 'sine', duration: 3,
  loopMode: 'loop', reverse: false, aspect: 'original', width: 800, height: 600,
  fit: 'cover', positionX: 50, positionY: 50, brightness: 100, contrast: 100, saturation: 100,
  blur: 0, background: '#15191c', fps: 15,
};
export const presetSettings: Record<EffectId, Partial<Settings>> = {
  zoom: { intensity: 52, direction: 0, duration: 3 },
  float: { intensity: 62, direction: 30, duration: 4 },
  parallax: { intensity: 48, direction: 45, duration: 3 },
  vhs: { intensity: 68, direction: 0, duration: 2 },
  kenburns: { intensity: 54, direction: 40, duration: 5 },
  pulse: { intensity: 52, direction: 0, duration: 3 },
  orbit: { intensity: 48, direction: 50, duration: 4 },
  split: { intensity: 63, direction: 50, duration: 3 },
  blur: { intensity: 58, direction: 0, duration: 4 },
  product: { intensity: 52, direction: 0, duration: 3 },
};
export function applyEffectPreset(current: Settings, effect: EffectId): Settings {
  return { ...current, ...presetSettings[effect], effect };
}
export function sanitizeSettings(settings: Partial<Settings> | null): Settings {
  const value = { ...defaults, ...settings };
  const clamp = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
  return { ...value, intensity: clamp(value.intensity, 0, 100), speed: clamp(value.speed, .25, 3), duration: clamp(value.duration, .5, 10),
    width: clamp(value.width, 160, 1280), height: clamp(value.height, 160, 1280), fps: clamp(value.fps, 5, 30) };
}
export function getCanvasSize(settings: Settings, image: {width:number;height:number}): {width:number;height:number} {
  const maximum = 960;
  let width = image.width;
  let height = image.height;
  switch(settings.aspect) {
    case 'square': width = 800; height = 800; break;
    case 'wide': width = 960; height = 540; break;
    case 'vertical': width = 540; height = 960; break;
    case 'custom': width = settings.width; height = settings.height; break;
  }
  const factor = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}
export function getExportDuration(settings: Settings) { return settings.duration / settings.speed; }
