import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, CircleAlert, CloudUpload, Film, LockKeyhole, PlayCircle, Sparkles, WandSparkles, Zap } from 'lucide-react';
import { downloadBlob, exportAnimatedGif } from '../lib/exporters';

type AIConfig = { enabled: boolean; siteKey: string|null; requiresOwner: boolean; model: string; costPerSecond540pUSD: number };
type TurnstileAPI = { render(element: HTMLElement, options: { sitekey: string; action: string; callback: (token:string)=>void; 'expired-callback':()=>void; 'error-callback':()=>void }): string; reset(id:string):void; remove(id:string):void };
declare global { interface Window { turnstile?: TurnstileAPI } }
async function seek(video:HTMLVideoElement,time:number) {
  if(Math.abs(video.currentTime-time)<.008)return;
  await new Promise<void>((resolve,reject)=>{
    const timer=window.setTimeout(()=>{cleanup();reject(new Error('Video could not be decoded at this frame.'));},10000);
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',ok);video.removeEventListener('error',fail);};
    const ok=()=>{cleanup();resolve();};const fail=()=>{cleanup();reject(new Error('Video decoding failed.'));};
    video.addEventListener('seeked',ok,{once:true});video.addEventListener('error',fail,{once:true});video.currentTime=time;
  });
}
async function prepareImage(file:File):Promise<File> {
  const bitmap=await createImageBitmap(file);
  try{
    const scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas is unavailable.');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
    if(!blob)throw new Error('Could not prepare the image for AI generation.');
    if(blob.size>2*1024*1024)throw new Error('Compressed image is too large. Try a smaller photo.');
    return new File([blob],'gifty-source.jpg',{type:'image/jpeg'});
  }finally{bitmap.close();}
}
export default function AIMotionLab(){
  const [config,setConfig]=useState<AIConfig|null>(null);
  const [prompt,setPrompt]=useState('Make the scene come alive with gentle, cinematic movement.');
  const [image,setImage]=useState<File|null>(null);
  const [imageUrl,setImageUrl]=useState('');
  const [duration,setDuration]=useState<3|5>(3);
  const [passcode,setPasscode]=useState('');
  const [captcha,setCaptcha]=useState('');
  const [generating,setGenerating]=useState(false);
  const [outputVideo,setOutputVideo]=useState('');
  const [importedVideo,setImportedVideo]=useState('');
  const [processing,setProcessing]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState('');
  const videoRef=useRef<HTMLVideoElement>(null);
  const controller=useRef<AbortController|null>(null);
  const aiController=useRef<AbortController|null>(null);
  const turnstileSlot=useRef<HTMLDivElement>(null);
  const turnstileWidget=useRef<string|null>(null);

  useEffect(()=>{
    let active=true;
    fetch('/api/ai/config',{headers:{Accept:'application/json'}}).then(async r=>{
      if(!r.ok||!r.headers.get('Content-Type')?.includes('application/json'))throw new Error('AI API is not available.');
      return r.json() as Promise<AIConfig>;
    }).then(data=>{if(active)setConfig(data);}).catch(()=>{if(active)setConfig({enabled:false,siteKey:null,requiresOwner:false,model:'vidu/q3-turbo',costPerSecond540pUSD:.04});});
    return()=>{active=false;aiController.current?.abort();};
  },[]);
  useEffect(()=>{return()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);};},[imageUrl]);
  useEffect(()=>{return()=>{if(importedVideo)URL.revokeObjectURL(importedVideo);};},[importedVideo]);
  useEffect(()=>{
    if(!config?.enabled||!config.siteKey||!turnstileSlot.current)return;
    let active=true;
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.onload=()=>{
      if(!active||!turnstileSlot.current||!window.turnstile)return;
      turnstileWidget.current=window.turnstile.render(turnstileSlot.current,{
        sitekey:config.siteKey!,action:'gifty_ai',callback:setCaptcha,'expired-callback':()=>setCaptcha(''),'error-callback':()=>setCaptcha('')
      });
    };
    script.onerror=()=>{if(active)setError('Could not load the Cloudflare verification widget.');};
    document.head.appendChild(script);
    return()=>{active=false;if(turnstileWidget.current&&window.turnstile)window.turnstile.remove(turnstileWidget.current);turnstileWidget.current=null;script.remove();};
  },[config?.enabled,config?.siteKey]);

  const submit=async()=>{
    if(!config?.enabled||!image||!prompt.trim()||generating)return;
    if(config.siteKey&&!captcha){setError('Complete the verification before generating.');return;}
    if(config.requiresOwner&&!passcode){setError('Enter the private studio passcode.');return;}
    setError('');setOutputVideo('');setGenerating(true);
    const abort=new AbortController();aiController.current=abort;
    try{
      const prepared=await prepareImage(image);
      if(abort.signal.aborted)return;
      const body=new FormData();body.set('image',prepared);body.set('prompt',prompt.trim());body.set('duration',String(duration));
      if(captcha)body.set('turnstile',captcha);
      const headers:Record<string,string>={};if(config.requiresOwner)headers['X-Gifty-Owner']=passcode;
      const response=await fetch('/api/ai/generate',{method:'POST',headers,body,signal:abort.signal});
      const result=await response.json() as {error?:string;videoUrl?:string;status?:string};
      if(!response.ok)throw new Error(result.error||`AI generation failed (${response.status}).`);
      if(!result.videoUrl||result.status!=='completed')throw new Error('No AI video was returned.');
      setOutputVideo(result.videoUrl);setImportedVideo('');
    }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:String(e));}
    finally{
      aiController.current=null;setGenerating(false);setCaptcha('');
      if(turnstileWidget.current&&window.turnstile)window.turnstile.reset(turnstileWidget.current);
    }
  };
  const onImage=(file?:File)=>{
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('Choose a JPEG, PNG or WebP image smaller than 10 MB.');return;}
    setImage(file);setImageUrl(URL.createObjectURL(file));setOutputVideo('');setError('');
  };
  const onVideo=(file?:File)=>{
    if(!file)return;
    if(!file.type.startsWith('video/')||file.size>75*1024*1024){setError('Choose a video smaller than 75 MB.');return;}
    setImportedVideo(URL.createObjectURL(file));setError('');setProgress(0);
  };
  const videoToGif=async()=>{
    const video=videoRef.current;
    if(!video||!Number.isFinite(video.duration)||!video.videoWidth||!video.videoHeight){setError('Load the video before converting.');return;}
    const seconds=Math.min(5,video.duration);
    const scale=Math.min(1,480/Math.max(video.videoWidth,video.videoHeight));
    const width=Math.max(1,Math.round(video.videoWidth*scale));const height=Math.max(1,Math.round(video.videoHeight*scale));
    const abort=new AbortController();controller.current=abort;setProcessing(true);setError('');setProgress(0);video.pause();
    try{
      const blob=await exportAnimatedGif({width,height,fps:12,duration:seconds,signal:abort.signal,onProgress:f=>setProgress(Math.round(f*100)),render:async(ctx,t)=>{await seek(video,Math.min(seconds-.001,t*seconds));ctx.drawImage(video,0,0,width,height);}});
      downloadBlob(blob,'gifty-ai-motion.gif');
    }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:String(e));}
    finally{setProcessing(false);controller.current=null;}
  };
  const videoSrc=importedVideo||outputVideo;
  const videoDownload=outputVideo ? outputVideo+(outputVideo.includes('?')?'&':'?')+'download=1' : '';
  return <div className="lab-page"><div className="lab-head"><div className="eyebrow lime"><Sparkles size={14}/> AI IMAGE TO VIDEO / POWERED BY CLOUDFLARE</div><h1>AI Motion <em>lab.</em></h1><p>Upload a photograph, describe what should move, and generate real AI video. Convert the result into a looping GIF.</p></div>
    <div className="lab-layout"><section className="lab-primary"><div className="lab-card"><div className="lab-section-head"><div className="number-tag">01</div><div><h2>Describe the impossible.</h2><p>One image. One prompt. Your image becomes a short AI video.</p></div></div>
      <div role="status" className={'lab-hint '+(config?.enabled?'lab-ready':'')}><Zap size={16}/>{config===null?'Checking AI availability…':config.enabled?'AI model connected. Generate with verified access.':'AI generation is not enabled yet. The site owner must enable Cloudflare AI billing and verification.'}</div>
      <div className="lab-upload"><label><CloudUpload size={25}/><strong>{image?image.name:'Choose an image to animate'}</strong><span>JPEG / PNG / WebP · 10 MB maximum</span><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>onImage(e.target.files?.[0])}/></label>{imageUrl&&<img src={imageUrl} alt="Selected source"/>}</div>
      <label className="lab-field">Motion prompt<textarea rows={3} value={prompt} maxLength={900} onChange={e=>setPrompt(e.target.value)} placeholder="Make the subject blink or turn their head…"/></label>
      <label className="lab-field">Video length <small>(540p preview, estimated provider cost)</small><select value={duration} onChange={e=>setDuration(Number(e.target.value) as 3|5)}><option value={3}>3 seconds · approximately $0.12</option><option value={5}>5 seconds · approximately $0.20</option></select></label>
      {config?.enabled&&config.siteKey&&<div className="lab-verification"><p>Verify you're a person before starting paid AI generation.</p><div ref={turnstileSlot}/></div>}
      {config?.enabled&&config.requiresOwner&&<label className="lab-field">Private studio passcode <small>(no provider API key required)</small><input type="password" value={passcode} onChange={e=>setPasscode(e.target.value)} autoComplete="off"/></label>}
      <button className="btn btn-lime lab-submit" disabled={!config?.enabled||!image||generating||(Boolean(config.siteKey)&&!captcha)||(Boolean(config.requiresOwner)&&!passcode)} onClick={()=>void submit()}><WandSparkles size={18}/>{generating?'AI is generating your video…':'Generate AI motion'}<ArrowRight size={18}/></button>
      {generating&&<div role="status" className="lab-status">Working with the real video model. This can take a minute or longer; the percentage is not estimated. <button className="btn btn-ghost small" onClick={()=>aiController.current?.abort()}>Stop waiting</button><small>Stopping the browser request may not cancel provider charges.</small></div>}
      {outputVideo&&<p role="status" className="lab-hint lab-ready"><Check size={17}/> AI video ready! Preview, download or convert it to a GIF below.</p>}
      </div>
      <div className="lab-card convert-card"><div className="lab-section-head"><div className="number-tag">02</div><div><h2>Your video, as a GIF.</h2><p>Preview your AI result or import any video and convert its first five seconds — locally, for free.</p></div></div>
        <label className="video-import"><Film size={24}/><strong>Import a video</strong><span>Local MP4 / WebM, up to 75 MB</span><input type="file" accept="video/*" hidden onChange={e=>onVideo(e.target.files?.[0])}/></label>
        {videoSrc&&<><video className="lab-video" ref={videoRef} src={videoSrc} controls playsInline preload="auto" crossOrigin="anonymous"/><div className="lab-video-actions"><button className="btn btn-lime" disabled={processing} onClick={()=>void videoToGif()}><ArrowDownToLine size={17}/>{processing?`Encoding ${progress}%`:'Convert video to GIF'}</button>{processing&&<button className="btn btn-ghost" onClick={()=>controller.current?.abort()}>Cancel</button>}{outputVideo&&<a href={videoDownload} download="gifty-ai-motion.mp4" className="btn btn-ghost"><ArrowDownToLine size={16}/> Save AI video</a>}</div></>}
      </div>
      {error&&<p role="alert" className="error-message"><CircleAlert size={16}/>{error}</p>}
    </section><aside className="lab-aside"><div className="lab-side-card"><div className="side-icon"><Zap size={24}/></div><h3>Real AI. No illusions.</h3><p>GIFTY connects to Vidu Q3 Turbo through your Cloudflare Worker. You never need to paste a provider API key into the website.</p>
      <div className="lab-points"><div><Check size={15}/> Real image-to-video generation</div><div><Check size={15}/> AI processing via your Cloudflare account</div><div><Check size={15}/> Verification and rate limiting</div><div><Check size={15}/> No fake progress or fabricated videos</div></div>
      <a href="https://github.com/radostradipetkova/GIFTY/blob/main/docs/cloudflare-ai.md" target="_blank" rel="noreferrer" className="side-link">AI activation instructions <ArrowRight size={17}/></a></div>
      <div className="lab-side-card secondary"><PlayCircle size={22}/><h3>Keep the editor free.</h3><p>Browser-based effects and GIF exports remain free. AI video generation uses paid GPU compute, billed to the website owner's Cloudflare account. Cost shown is an estimate, not a guarantee.</p><p><LockKeyhole size={14}/> Only the AI request sends your photo to an external AI model.</p></div></aside></div>
  </div>;
}
