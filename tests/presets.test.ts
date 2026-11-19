import { describe, expect, it } from 'vitest';
import { applyEffectPreset, defaults, effects, getCanvasSize, getExportDuration, sanitizeSettings } from '../src/lib/presets';
import { computeMotion, phaseAt } from '../src/lib/renderer';

describe('motion studio presets', () => {
  it('contains ten unique editable effects', () => {
    expect(effects).toHaveLength(10);
    expect(new Set(effects.map(x=>x.id)).size).toBe(10);
    for(const effect of effects)expect(applyEffectPreset(defaults,effect.id).effect).toBe(effect.id);
  });
  it('clamps corrupted settings to safe export limits', () => {
    const value=sanitizeSettings({width:90000,height:-500,fps:200,speed:0,duration:200});
    expect(value.width).toBe(1280);expect(value.height).toBe(160);
    expect(value.fps).toBe(30);expect(value.speed).toBe(.25);expect(value.duration).toBe(10);
  });
  it('honors requested aspect ratios and safe maximum dimensions', () => {
    expect(getCanvasSize({...defaults,aspect:'wide'},{width:400,height:600})).toEqual({width:960,height:540});
    expect(getCanvasSize({...defaults,aspect:'square'},{width:700,height:300}).width).toBe(800);
    expect(getCanvasSize(defaults,{width:6000,height:4000})).toEqual({width:960,height:640});
  });
  it('adjusts effective export duration with speed',()=>{
    expect(getExportDuration({...defaults,duration:4,speed:2})).toBe(2);
  });
  it('loops without phase discontinuity and supports reverse / pingpong',()=>{
    for(const mode of ['loop','pingpong'] as const){
      const cfg={...defaults,loopMode:mode,easing:'linear' as const};
      expect(phaseAt(0,cfg)).toBeCloseTo(phaseAt(1,cfg));
      expect(computeMotion(0,cfg).wave).toBeCloseTo(computeMotion(1,cfg).wave);
    }
    expect(phaseAt(.2,{...defaults,reverse:true,easing:'linear'})).toBeCloseTo(.8);
    expect(phaseAt(.2,{...defaults,loopMode:'pingpong',easing:'linear'})).toBeCloseTo(.4);
  });
  it('gives distinct motion amplitudes for different intensity settings',()=>{
    expect(computeMotion(.25,{...defaults,intensity:90}).amount).toBeGreaterThan(computeMotion(.25,{...defaults,intensity:10}).amount);
  });
});
