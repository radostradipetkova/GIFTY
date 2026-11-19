import { describe, expect, it } from 'vitest';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { GifReader } from 'omggif';

describe('GIF encoder interoperability',()=>{
  it('writes multi-frame GIFs independently readable by omggif with different frame pixels',()=>{
    const w=24,h=16;
    const gif=GIFEncoder();
    for(let frame=0;frame<4;frame++){
      const pixels=new Uint8ClampedArray(w*h*4);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;
        pixels[i]=(x*13+frame*47)%256;
        pixels[i+1]=(y*17+frame*21)%256;
        pixels[i+2]=80+frame*20;
        pixels[i+3]=255;
      }
      const palette=quantize(pixels,128);
      gif.writeFrame(applyPalette(pixels,palette),w,h,{palette,delay:100,repeat:0,dispose:2});
    }
    gif.finish();
    const bytes=gif.bytes();
    expect(bytes.length).toBeGreaterThan(200);
    expect(new TextDecoder().decode(bytes.slice(0,6))).toBe('GIF89a');
    expect(bytes[bytes.length-1]).toBe(0x3b);
    const reader=new GifReader(bytes);
    expect(reader.width).toBe(w);expect(reader.height).toBe(h);
    expect(reader.numFrames()).toBe(4);
    const first=new Uint8Array(w*h*4), last=new Uint8Array(w*h*4);
    reader.decodeAndBlitFrameRGBA(0,first);
    reader.decodeAndBlitFrameRGBA(3,last);
    expect(Array.from(first)).not.toEqual(Array.from(last));
  });
});
