declare module 'gifenc' {
  export type Palette = number[][];
  export interface GIFOptions { palette?: Palette; delay?: number; repeat?: number; dispose?: number; transparent?: boolean; transparentIndex?: number; }
  export interface GIFWriter { writeFrame(indexed:Uint8Array,width:number,height:number,options?:GIFOptions):void; finish():void; bytes():Uint8Array; }
  export function GIFEncoder(options?:{initialCapacity?:number;auto?:boolean}):GIFWriter;
  export function quantize(rgba:Uint8Array|Uint8ClampedArray,maxColors?:number,options?:Record<string,unknown>):Palette;
  export function applyPalette(rgba:Uint8Array|Uint8ClampedArray,palette:Palette,options?:Record<string,unknown>):Uint8Array;
}
