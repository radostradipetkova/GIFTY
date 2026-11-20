import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeAI, type AIEnv } from '../src/worker/ai';

function env(override: Partial<AIEnv> = {}): AIEnv {
  return { AI: { run: vi.fn().mockResolvedValue({ state: 'Completed', result: { video: 'https://video.cf.vidu.com/clip.mp4' } }) },
    AI_RATE: { limit: vi.fn().mockResolvedValue({ success: true }) },
    GIFTY_AI_ENABLED: 'true', GIFTY_OWNER_PASSCODE: 'private-test-password', ...override };
}
function jpeg() { const bytes = new Uint8Array(128); bytes.set([255,216,255,224]); bytes.set([255,217],126); return new File([bytes], 'portrait.jpg', {type:'image/jpeg'}); }
function post({ passcode='private-test-password', image=jpeg(), duration=3, prompt='Make the clouds move softly.' }: {passcode?: string; image?: File; duration?: number; prompt?: string} = {}) {
  const body = new FormData(); body.set('image',image);body.set('duration', String(duration));body.set('prompt', prompt);
  return new Request('https://gifty.example/api/ai/generate', {method:'POST', body,headers: { Origin:'https://gifty.example', 'X-Gifty-Owner':passcode, 'CF-Connecting-IP':'203.0.113.7' }});
}
afterEach(()=>vi.restoreAllMocks());
describe('GIFTY paid video generation gateway',()=>{
  it('starts disabled, never revealing owner secrets', async()=>{
    const res=await routeAI(new Request('https://gifty.example/api/ai/config'),env({GIFTY_AI_ENABLED:undefined}));
    expect(res.status).toBe(200);
    const text=await res.text();expect(text).toContain('"enabled":false');expect(text).not.toContain('private-test-password');
  });
  it('rejects requests from other origins and without owner verification',async()=>{
    const e=env();
    const cross=post();cross.headers.set('Origin','https://attacker.example');
    expect((await routeAI(cross,e)).status).toBe(403);
    expect((await routeAI(post({passcode:'wrong'}),e)).status).toBe(403);
    expect(e.AI?.run).not.toHaveBeenCalled();
  });
  it('validates inputs and rate limits before inference',async()=>{
    const e=env();
    expect((await routeAI(post({prompt:'a'}),e)).status).toBe(422);
    expect((await routeAI(post({duration:20}),e)).status).toBe(422);
    const bad=new File([new Uint8Array(200)],'not-image.jpg',{type:'image/jpeg'});
    expect((await routeAI(post({image:bad}),e)).status).toBe(422);
    e.AI_RATE!.limit=vi.fn().mockResolvedValue({success:false});
    expect((await routeAI(post(),e)).status).toBe(429);
    expect(e.AI?.run).not.toHaveBeenCalled();
  });
  it('calls the real model contract and signs the returned video URL',async()=>{
    const e=env();
    const response=await routeAI(post(),e);
    expect(response.status).toBe(200);
    const data=await response.json() as {videoUrl:string};
    expect(data.videoUrl).toMatch(/^\/api\/ai\/video\?e=/);
    expect(e.AI?.run).toHaveBeenCalledWith('vidu/q3-turbo',expect.objectContaining({duration:3,resolution:'540p',audio:false,prompt:'Make the clouds move softly.',start_image:expect.stringMatching(/^data:image\/jpeg;base64,\/9j/)}));
    const tampered=new URL(data.videoUrl,'https://gifty.example');tampered.searchParams.set('u','https://evil.example/clip.mp4');
    expect((await routeAI(new Request(tampered),e)).status).toBe(403);
    const getter=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(new Uint8Array([0,0,0,1]),{headers:{'Content-Type':'video/mp4'}}));
    const video=await routeAI(new Request(new URL(data.videoUrl,'https://gifty.example')),e);
    expect(video.status).toBe(200);
    expect(video.headers.get('Content-Type')).toBe('video/mp4');
    expect(getter).toHaveBeenCalledWith('https://video.cf.vidu.com/clip.mp4',expect.objectContaining({redirect:'error'}));
  });
  it('rejects unsupported provider output, never inventing a video',async()=>{
    const e=env({AI:{run:vi.fn().mockResolvedValue({state:'Completed',result:{video:'https://untrusted.example/video.mp4'}})}});
    const response=await routeAI(post(),e);
    expect(response.status).toBe(502);
    expect((await response.json() as {error:string}).error).toContain('unsupported');
  });
});
