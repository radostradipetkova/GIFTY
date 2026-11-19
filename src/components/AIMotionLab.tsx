import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, CircleAlert, CloudUpload, Film, LockKeyhole, PlayCircle, Sparkles, WandSparkles, Zap } from 'lucide-react';
import { downloadBlob, exportAnimatedGif } from '../lib/exporters';

type JobStatus = 'idle'|'queued'|'running'|'completed'|'failed';
type Job = { id:string;status:JobStatus;error?:string;progress?:number };

async function seek(video:HTMLVideoElement, time:number) {
  if (Math.abs(video.currentTime-time)<.008) return;
  await new Promise<void>((resolve,reject)=>{
    const timer=window.setTimeout(()=>{cleanup();reject(new Error('Video could not be decoded at this frame.'));},10000);
    const cleanup=()=>{clearTimeout(timer);video.removeEventListener('seeked',ok);video.removeEventListener('error',fail);};
    const ok=()=>{cleanup();resolve();}; const fail=()=>{cleanup();reject(new Error('Video decoding failed.'));};
    video.addEventListener('seeked',ok,{once:true});video.addEventListener('error',fail,{once:true});video.currentTime=time;
  });
}
export default function AIMotionLab(){
  const [url,setUrl]=useState(import.meta.env.VITE_GIFTY_AI_URL || '');
  const [token,setToken]=useState('');
  const [prompt,setPrompt]=useState('Make the scene come alive with gentle, cinematic movement.');
  const [image,setImage]=useState<File|null>(null);
  const [imageUrl,setImageUrl]=useState('');
  const [job,setJob]=useState<Job|null>(null);
  const [outputVideo,setOutputVideo]=useState('');
  const [importedVideo,setImportedVideo]=useState('');
  const [processing,setProcessing]=useState(false);
  const [progress,setProgress]=useState(0);
  const [error,setError]=useState('');
  const videoRef=useRef<HTMLVideoElement>(null);
  const controller=useRef<AbortController|null>(null);
  const endpoint=url.trim().replace(/\/+$/,'');
  useEffect(()=>{return()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);};},[imageUrl]);
  useEffect(()=>{return()=>{if(outputVideo)URL.revokeObjectURL(outputVideo);};},[outputVideo]);
  useEffect(()=>{return()=>{if(importedVideo)URL.revokeObjectURL(importedVideo);};},[importedVideo]);

  const headers=()=>({Authorization:`Bearer ${token}`});
  const submit=async()=>{
    if(!endpoint||!token||!image||!prompt.trim())return;
    setError('');setJob(null);setOutputVideo('');
    try{
      const body=new FormData();body.set('image',image);body.set('prompt',prompt.trim());
      const response=await fetch(`${endpoint}/jobs`,{method:'POST',headers:headers(),body});
      if(!response.ok)throw new Error(`Server rejected the request (${response.status}). Check the endpoint, token and backend setup.`);
      const next=await response.json() as Job;
      if(!next.id)throw new Error('The AI server returned an invalid job ID.');
      setJob(next);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  useEffect(()=>{
    if(!job||!(job.status==='queued'||job.status==='running')||!endpoint||!token)return;
    let mounted=true;
    const poll=async()=>{try{
      const response=await fetch(`${endpoint}/jobs/${encodeURIComponent(job.id)}`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error('Could not check generation status.');
      const next=await response.json() as Job;
      if(mounted)setJob(next);
    }catch(e){if(mounted){setJob(old=>old?{...old,status:'failed',error:String(e)}:null);}}};
    const timer=window.setInterval(()=>void poll(),2500);
    return()=>{mounted=false;clearInterval(timer);};
  },[job?.id,job?.status,endpoint,token]);
  useEffect(()=>{
    if(job?.status!=='completed'||!endpoint||!token)return;
    let mounted=true;
    (async()=>{try{
      const response=await fetch(`${endpoint}/jobs/${encodeURIComponent(job.id)}/file`,{headers:{Authorization:`Bearer ${token}`}});
      if(!response.ok)throw new Error('AI video download failed.');
      const blob=await response.blob();
      if(!blob.size)throw new Error('The AI video was empty.');
      const blobUrl=URL.createObjectURL(blob);
      if(mounted)setOutputVideo(blobUrl);else URL.revokeObjectURL(blobUrl);
    }catch(e){if(mounted)setError(e instanceof Error?e.message:String(e));}})();
    return()=>{mounted=false;};
  },[job?.id,job?.status,endpoint,token]);
  const onImage=(file?:File)=>{
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024){setError('Choose a JPEG, PNG or WebP image smaller than 10 MB.');return;}
    setImage(file);setImageUrl(URL.createObjectURL(file));setJob(null);setError('');
  };
  const onVideo=(file?:File)=>{
    if(!file)return;
    if(!file.type.startsWith('video/')||file.size>75*1024*1024){setError('Choose a video smaller than 75 MB.');return;}
    setImportedVideo(URL.createObjectURL(file));setError('');setProgress(0);
  };
  const videoToGif=async()=>{
    const video=videoRef.current;
    if(!video||!Number.isFinite(video.duration)||!video.videoWidth||!video.videoHeight)return;
    const duration=Math.min(5,video.duration);
    const scale=Math.min(1,480/Math.max(video.videoWidth,video.videoHeight));
    const width=Math.max(1,Math.round(video.videoWidth*scale)); const height=Math.max(1,Math.round(video.videoHeight*scale));
    const abort=new AbortController();controller.current=abort;setProcessing(true);setError('');setProgress(0);
    video.pause();
    try{
      const blob=await exportAnimatedGif({width,height,fps:12,duration,signal:abort.signal,onProgress:f=>setProgress(Math.round(f*100)),
        render:async (ctx,t)=>{await seek(video,Math.min(duration-.001,t*duration));ctx.drawImage(video,0,0,width,height);} });
      downloadBlob(blob,'gifty-ai-motion.gif');
    }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:String(e));}
    finally{setProcessing(false);controller.current=null;}
  };
  const videoSrc=importedVideo||outputVideo;
  return <div className="lab-page"><div className="lab-head"><div className="eyebrow lime"><Sparkles size={14}/> EXPERIMENTAL WORKSPACE / BRING YOUR OWN AI</div><h1>AI Motion <em>lab.</em></h1><p>Turn a still moment into a living scene — with your own image-to-video server. Or turn any existing AI video into a GIF, for free.</p></div>
    <div className="lab-layout"><section className="lab-primary"><div className="lab-card"><div className="lab-section-head"><div className="number-tag">01</div><div><h2>Describe the impossible.</h2><p>Connect a compatible backend to generate real image-to-video motion.</p></div></div>
      <label className="lab-field">Backend URL <small>(HTTPS required when deployed)</small><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-private-ai-api.example.com" inputMode="url"/></label>
      <label className="lab-field">Access token <small>(stored only for this session in memory)</small><input value={token} onChange={e=>setToken(e.target.value)} placeholder="Private bearer token" type="password" autoComplete="off"/></label>
      <div className="lab-upload"><label><CloudUpload size={25}/><strong>{image?image.name:'Choose an image to animate'}</strong><span>JPEG / PNG / WebP · 10 MB maximum</span><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>onImage(e.target.files?.[0])}/></label>{imageUrl&&<img src={imageUrl} alt="Selected source"/>}</div>
      <label className="lab-field">Motion prompt<textarea rows={3} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Describe exactly how your image should move..."/></label>
      <button className="btn btn-lime lab-submit" disabled={!image||!endpoint||!token||job?.status==='queued'||job?.status==='running'} onClick={()=>void submit()}><WandSparkles size={18}/> Generate AI motion <ArrowRight size={18}/></button>
      {job&&<div role="status" className="lab-status"><span className="green-dot"/> Job {job.id.slice(0,8)} · <strong>{job.status}</strong>{typeof job.progress==='number'&&` · ${Math.round(job.progress)}%`}{job.error&&<span> · {job.error}</span>}</div>}
      {!endpoint&&<p className="lab-hint"><LockKeyhole size={15}/> No GPU backend connected. This is a real integration interface, not a simulated AI generator.</p>}
      </div>
      <div className="lab-card convert-card"><div className="lab-section-head"><div className="number-tag">02</div><div><h2>Already have an AI video?</h2><p>Import it and convert the first five seconds to a downloadable GIF. No server required.</p></div></div>
        <label className="video-import"><Film size={24}/><strong>Import a video</strong><span>Local MP4 / WebM, up to 75 MB</span><input type="file" accept="video/*" hidden onChange={e=>onVideo(e.target.files?.[0])}/></label>
        {videoSrc&&<><video className="lab-video" ref={videoRef} src={videoSrc} controls playsInline preload="auto"/><div className="lab-video-actions"><button className="btn btn-lime" disabled={processing} onClick={()=>void videoToGif()}><ArrowDownToLine size={17}/>{processing?`Encoding ${progress}%`:'Convert video to GIF'}</button>{processing&&<button className="btn btn-ghost" onClick={()=>controller.current?.abort()}>Cancel</button>}{outputVideo&&<a href={outputVideo} download="gifty-ai-motion.mp4" className="btn btn-ghost"><ArrowDownToLine size={16}/> Save video</a>}</div></>}
      </div>
      {error&&<p role="alert" className="error-message"><CircleAlert size={16}/>{error}</p>}
    </section><aside className="lab-aside"><div className="lab-side-card"><div className="side-icon"><Zap size={24}/></div><h3>Real AI. No illusions.</h3><p>Generating new movements in photographs needs a GPU model. GIFTY runs the entire creative editor free in your browser. AI generation is optional and requires a compatible backend you control.</p>
      <div className="lab-points"><div><Check size={15}/> Open-source ComfyUI compatible</div><div><Check size={15}/> User-owned compute</div><div><Check size={15}/> Never ships an API key in frontend code</div><div><Check size={15}/> No fabricated generation progress</div></div>
      <a href="https://github.com/radostradipetkova/GIFTY/blob/main/backend/README.md" target="_blank" rel="noreferrer" className="side-link">Read backend setup <ArrowRight size={17}/></a></div>
      <div className="lab-side-card secondary"><PlayCircle size={22}/><h3>The idea is simple.</h3><p>Your image. Your prompt. Your imagination. Connect a supported image-to-video model when you have one — the GIF maker already works without it.</p></div></aside></div>
  </div>;
}
