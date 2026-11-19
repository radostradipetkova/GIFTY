import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, Check, ChevronDown, CircleHelp, Clock3, Download, ImagePlus, Layers2, Maximize2, MoreHorizontal, Pause, Play, RotateCcw, Shuffle, SlidersHorizontal, Sparkles, Square, UploadCloud, WandSparkles, X } from 'lucide-react';
import { defaults, effects, applyEffectPreset, getCanvasSize, getExportDuration, sanitizeSettings, type EffectId, type Settings } from '../lib/presets';
import { renderFrame } from '../lib/renderer';
import { downloadBlob, exportImageGif, exportVideo, loadDemoImage, loadImageFromFile, supportedVideoFormats } from '../lib/exporters';

const DEMOS = [
  { name: 'Afterglow', url: '/demos/afterglow.svg' },
  { name: 'Dreamscape', url: '/demos/dreamscape.svg' },
  { name: 'Orbit', url: '/demos/orbit.svg' },
];
function SettingRange({ label, min, max, value, step = 1, suffix = '', onChange }: {label:string;min:number;max:number;value:number;step?:number;suffix?:string;onChange:(n:number)=>void}) {
  return <label className="range-row"><span className="range-top"><span>{label}</span><span className="range-value">{value}{suffix}</span></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/></label>;
}
function GroupTitle({ children }: {children:React.ReactNode}) { return <div className="section-eyebrow">{children}</div>; }

export default function Studio({ active, initialEffect }: {active:boolean;initialEffect:EffectId|null}) {
  const [settings, setSettings] = useState<Settings>(() => {
    try { const raw = localStorage.getItem('gifty-settings-v1'); return sanitizeSettings(raw ? JSON.parse(raw) as Partial<Settings> : null); }
    catch { return defaults; }
  });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState('');
  const [drag, setDrag] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const [before, setBefore] = useState(false);
  const [exportKind, setExportKind] = useState('gif');
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCrop, setShowCrop] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playheadRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const formats = supportedVideoFormats();
  const { width, height } = image ? getCanvasSize(settings, image) : {width:960, height:600};
  const duration = getExportDuration(settings);
  const set = useCallback(<K extends keyof Settings>(key:K,value:Settings[K])=>setSettings(current=>({...current,[key]:value})),[]);

  useEffect(() => {
    loadDemoImage(DEMOS[0].url).then(img=>{ setImage(old=>old ?? img); setImageName(old=>old || DEMOS[0].name + ' · demo'); }).catch(()=>{});
  },[]);
  useEffect(() => { if (initialEffect) setSettings(s=>applyEffectPreset(s,initialEffect)); },[initialEffect]);
  useEffect(() => { localStorage.setItem('gifty-settings-v1', JSON.stringify(settings)); },[settings]);
  useEffect(() => {
    const node = canvasRef.current;
    if (!image || !node) return;
    node.width = width; node.height = height;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    let animation = 0;
    let lastUpdate = 0;
    const started = performance.now() - playheadRef.current * duration * 1000;
    const draw = (now: number) => {
      if (playing && active) {
        const elapsed = (now - started) / (duration * 1000);
        playheadRef.current = settings.loopMode === 'once' ? Math.min(.9999, elapsed) : ((elapsed % 1) + 1) % 1;
        if (settings.loopMode === 'once' && elapsed >= 1) setPlaying(false);
      }
      renderFrame(ctx, image, before ? { ...settings, intensity: 0 } : settings, playheadRef.current);
      if (now - lastUpdate > 95) { setPlayhead(playheadRef.current); lastUpdate = now; }
      if (playing && active) animation = requestAnimationFrame(draw);
    };
    animation = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animation);
  },[image,settings,width,height,duration,playing,active,before]);

  const fileUpload = async (file?:File) => {
    if (!file) return;
    setError(''); setSuccess('');
    try { const next = await loadImageFromFile(file); setImage(next); setImageName(file.name); playheadRef.current=0; setPlaying(true); }
    catch(err){setError(err instanceof Error ? err.message : String(err));}
  };
  const selectDemo = async (demo:typeof DEMOS[number]) => {
    try { setImage(await loadDemoImage(demo.url)); setImageName(demo.name + ' · demo'); setError(''); setPlaying(true); playheadRef.current=0; }
    catch(err){setError(String(err));}
  };
  const reset = () => {setSettings(defaults);setError('');setSuccess('');playheadRef.current=0;};
  const randomize = () => { const effect = effects[Math.floor(Math.random()*effects.length)].id;
    setSettings(s=>({...applyEffectPreset(s,effect),intensity:Math.floor(28+Math.random()*60),direction:Math.floor(Math.random()*360),speed:Math.round((.65+Math.random()*1.3)*10)/10})); };
  const exportNow = async () => {
    if (!image || exporting) return;
    setError(''); setSuccess(''); setExporting(true);setExportProgress(0);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const onProgress = (fraction:number)=>setExportProgress(Math.round(fraction*100));
      let blob:Blob, extension:string;
      if (exportKind === 'gif') {
        blob = await exportImageGif(image, settings, width, height, controller.signal, onProgress); extension='gif';
      } else {
        blob=await exportVideo(image,settings,width,height,exportKind,controller.signal,onProgress);
        extension=exportKind.includes('mp4')?'mp4':'webm';
      }
      if (blob.size < 100) throw new Error('The encoded file is unexpectedly small.');
      downloadBlob(blob,`gifty-${settings.effect}-${Date.now()}.${extension}`);
      setSuccess(`${extension.toUpperCase()} exported · ${(blob.size/1024/1024).toFixed(2)} MB`);
    } catch(err) { if (!(err instanceof DOMException && err.name === 'AbortError')) setError(err instanceof Error ? err.message : String(err)); }
    finally { setExporting(false); abortRef.current=null; }
  };
  const changePlayhead = (value:number) => {
    setPlaying(false); playheadRef.current=value;setPlayhead(value);
    const ctx=canvasRef.current?.getContext('2d');
    if(ctx&&image) renderFrame(ctx,image,before?{...settings,intensity:0}:settings,value);
  };
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{
    if(!active || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey)return;
    if(e.code==='Space'){e.preventDefault();setPlaying(p=>!p);}
    if(e.key==='r')reset();
  };window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);},[active]);
  const chooseEffect = (effect:EffectId)=>{setSettings(current=>applyEffectPreset(current,effect));setError('');};

  return <div className="studio-page">
    <div className="studio-titlebar"><div><div className="eyebrow lime">THE CREATIVE PLAYGROUND <span className="tiny-star">✳</span></div><h1>Motion <em>studio.</em></h1><p>One still image. Infinite possibilities.</p></div>
      <div className="titlebar-actions"><span className="private-pill"><span className="green-dot"/> 100% LOCAL EDITING</span><button className="btn btn-ghost small" onClick={reset}><RotateCcw size={15}/> Reset all</button></div></div>
    <div className="studio-grid">
      <aside className="effects-panel"><div className="panel-heading"><div><GroupTitle>01 / CHOOSE YOUR MOTION</GroupTitle><h2>Effects <span className="count">10</span></h2></div><button className="mini-icon" title="Random effect" onClick={randomize}><Shuffle size={17}/></button></div>
        <div className="effect-list">{effects.map(effect=><button key={effect.id} className={'effect-card '+(settings.effect===effect.id?'selected':'')} onClick={()=>chooseEffect(effect.id)}>
          <span className="effect-symbol">{effect.symbol}</span><span className="effect-meta"><strong>{effect.name}</strong><small>{effect.group}</small></span>{settings.effect===effect.id&&<span className="effect-indicator"><Check size={14}/></span>}</button>)}</div>
        <button className="surprise-btn" onClick={randomize}><Shuffle size={15}/> Surprise me <span>↗</span></button>
      </aside>
      <main className="editor-panel">
        <div className="editor-head"><div className="editor-tag"><span className="status-dot"/> LIVE PREVIEW <span className="editor-separator">/</span> {width} × {height}</div>
          <div className="editor-head-actions"><button className="text-icon" onClick={()=>setBefore(b=>!b)} title="Toggle before/after"><ArrowLeftRight size={16}/> {before?'Original':'Compare'}</button><button className="mini-icon" title="Change image" onClick={()=>inputRef.current?.click()}><ImagePlus size={18}/></button></div></div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{void fileUpload(e.target.files?.[0]);e.target.value='';}}/>
        <div className={'preview-stage '+(drag?'drag-active':'')} onDragEnter={e=>{e.preventDefault();setDrag(true);}} onDragOver={e=>e.preventDefault()} onDragLeave={e=>{e.preventDefault();setDrag(false);}} onDrop={e=>{e.preventDefault();setDrag(false);void fileUpload(e.dataTransfer.files[0]);}}>
          {image ? <div className="preview-content"><canvas ref={canvasRef} width={width} height={height} aria-label="Animated image preview" style={{aspectRatio:`${width}/${height}`}}/><div className="preview-corner top-left">GIFTY PREVIEW <span>●</span></div><div className="preview-corner bottom-right">{settings.effect.toUpperCase()} / LOOP 01</div></div> : <div className="empty-upload"><div className="empty-upload-icon"><UploadCloud size={28}/></div><h3>Drop something beautiful.</h3><p>JPEG, PNG or WebP · up to 18 MB</p><button className="btn btn-lime" onClick={()=>inputRef.current?.click()}>Choose an image <ImagePlus size={16}/></button></div>}
          {drag&&<div className="drop-cover">DROP IMAGE TO CREATE <Sparkles size={32}/></div>}
        </div>
        <div className="preview-footer"><div className="file-name"><div className="file-thumbnail"><Layers2 size={18}/></div><div><strong>{imageName||'No image selected'}</strong><small>{image?`${image.width} × ${image.height} original`:'Choose a demo below'}</small></div></div>
          <button className="outline-small" onClick={()=>inputRef.current?.click()}><UploadCloud size={15}/> Replace</button>
          <button className="mini-icon" onClick={()=>{setImage(null);setImageName('');}} title="Remove image"><X size={17}/></button>
        </div>
        <div className="timeline"><div className="timeline-heading"><GroupTitle>PLAYBACK / TIMELINE</GroupTitle><span className="timecounter">{(playhead*duration).toFixed(1)}s <span>/</span> {duration.toFixed(1)}s</span></div>
          <div className="timeline-controls"><button className="play-btn" aria-label={playing?'Pause':'Play'} onClick={()=>{if(playheadRef.current>=.99)playheadRef.current=0;setPlaying(p=>!p);}}>{playing?<Pause size={17} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}</button>
          <input aria-label="Scrub animation timeline" type="range" className="timeline-scrub" min="0" max="1" step=".001" value={playhead} onChange={e=>changePlayhead(Number(e.target.value))}/>
          <button className="mini-icon" title="Restart" onClick={()=>{changePlayhead(0);setPlaying(true);}}><RotateCcw size={17}/></button></div></div>
        <div className="demo-section"><div className="demos-header"><GroupTitle>NO IMAGE? START WITH A DEMO</GroupTitle><span>Designed in-house. Free to explore.</span></div>
          <div className="demo-grid">{DEMOS.map(d=><button key={d.name} className="demo-tile" onClick={()=>void selectDemo(d)}><img src={d.url} alt={d.name}/><span>{d.name} ↗</span></button>)}</div></div>
      </main>
      <aside className="settings-panel"><div className="panel-heading"><div><GroupTitle>02 / MAKE IT YOURS</GroupTitle><h2>Fine tune <SlidersHorizontal size={19}/></h2></div></div>
        <div className="settings-content"><GroupTitle>MOTION</GroupTitle>
          <SettingRange label="Intensity" min={0} max={100} value={settings.intensity} suffix="%" onChange={n=>set('intensity',n)}/>
          <SettingRange label="Speed" min={.25} max={3} step={.05} value={settings.speed} suffix="×" onChange={n=>set('speed',n)}/>
          <SettingRange label="Direction" min={0} max={360} value={settings.direction} suffix="°" onChange={n=>set('direction',n)}/>
          <div className="input-grid"><label className="form-field"><span>Duration</span><select value={settings.duration} onChange={e=>set('duration',Number(e.target.value))}><option value="1">1 second</option><option value="2">2 seconds</option><option value="3">3 seconds</option><option value="4">4 seconds</option><option value="5">5 seconds</option><option value="6">6 seconds</option><option value="8">8 seconds</option><option value="10">10 seconds</option></select></label>
            <label className="form-field"><span>Loop mode</span><select value={settings.loopMode} onChange={e=>set('loopMode',e.target.value as Settings['loopMode'])}><option value="loop">Seamless loop</option><option value="pingpong">Ping-pong</option><option value="once">Play once</option></select></label></div>
          <label className="form-field block"><span>Motion easing</span><select value={settings.easing} onChange={e=>set('easing',e.target.value as Settings['easing'])}><option value="sine">Soft sine</option><option value="smooth">Smooth step</option><option value="linear">Linear</option></select></label>
          <label className="toggle-line"><span>Reverse motion</span><input type="checkbox" checked={settings.reverse} onChange={e=>set('reverse',e.target.checked)}/><span className="toggle-switch"/></label>
          <div className="panel-divider"/><GroupTitle>CANVAS</GroupTitle>
          <div className="aspect-grid">{([['original','Free'],['square','1:1'],['wide','16:9'],['vertical','9:16']] as const).map(([value,label])=><button key={value} className={'aspect-choice '+(settings.aspect===value?'on':'')} onClick={()=>set('aspect',value)}>{label}</button>)}</div>
          <button className={'advanced-toggle '+(showCrop?'open':'')} onClick={()=>setShowCrop(v=>!v)}><Maximize2 size={15}/> Crop & position <ChevronDown size={14}/></button>
          {showCrop&&<div className="nested-settings"><div className="input-grid"><label className="form-field"><span>Fit</span><select value={settings.fit} onChange={e=>set('fit',e.target.value as Settings['fit'])}><option value="cover">Fill</option><option value="contain">Fit</option></select></label>
            <label className="form-field"><span>Custom size</span><button className="selectlike" onClick={()=>set('aspect','custom')}>Custom ↗</button></label></div>
            {settings.aspect==='custom'&&<div className="input-grid"><label className="form-field"><span>Width</span><input type="number" min="160" max="1280" value={settings.width} onChange={e=>set('width',Math.min(1280,Math.max(160,Number(e.target.value))))}/></label><label className="form-field"><span>Height</span><input type="number" min="160" max="1280" value={settings.height} onChange={e=>set('height',Math.min(1280,Math.max(160,Number(e.target.value))))}/></label></div>}
            <SettingRange label="Horizontal position" min={0} max={100} value={settings.positionX} suffix="%" onChange={n=>set('positionX',n)}/>
            <SettingRange label="Vertical position" min={0} max={100} value={settings.positionY} suffix="%" onChange={n=>set('positionY',n)}/></div>}
          <button className={'advanced-toggle '+(showAdvanced?'open':'')} onClick={()=>setShowAdvanced(v=>!v)}><WandSparkles size={15}/> Color & adjustments <ChevronDown size={14}/></button>
          {showAdvanced&&<div className="nested-settings"><SettingRange label="Brightness" min={40} max={180} value={settings.brightness} suffix="%" onChange={n=>set('brightness',n)}/><SettingRange label="Contrast" min={50} max={200} value={settings.contrast} suffix="%" onChange={n=>set('contrast',n)}/><SettingRange label="Saturation" min={0} max={220} value={settings.saturation} suffix="%" onChange={n=>set('saturation',n)}/><SettingRange label="Blur" min={0} max={12} value={settings.blur} suffix="px" onChange={n=>set('blur',n)}/><label className="color-pick">Background <input type="color" value={settings.background} onChange={e=>set('background',e.target.value)}/></label></div>}
          <div className="panel-divider"/><GroupTitle>03 / TAKE IT WITH YOU</GroupTitle><h2 className="export-title">Export your magic. <Sparkles size={17}/></h2>
          <div className="export-formats"><button className={exportKind==='gif'?'active':''} onClick={()=>setExportKind('gif')}>GIF</button>{formats.map(f=><button key={f.mime} className={exportKind===f.mime?'active':''} onClick={()=>setExportKind(f.mime)}>{f.extension==='mp4'?'MP4':f.label.replace('WebM · ','')}</button>)}</div>
          <div className="input-grid"><label className="form-field"><span>Frame rate</span><select value={settings.fps} onChange={e=>set('fps',Number(e.target.value))}><option value="10">10 FPS</option><option value="15">15 FPS</option><option value="20">20 FPS</option><option value="24">24 FPS</option><option value="30">30 FPS</option></select></label>
          <div className="export-spec"><span>Resolution</span><strong>{width} × {height}</strong></div></div>
          <button className="btn btn-lime export-btn" onClick={()=>void exportNow()} disabled={!image||exporting}>{exporting?<><Clock3 size={18}/> Exporting {exportProgress}%</>:<><ArrowDownToLine size={19}/> Download {exportKind==='gif'?'GIF':exportKind.includes('mp4')?'MP4':'video'} <span>↗</span></>}</button>
          {exporting&&<><div className="export-progress" role="progressbar" aria-valuenow={exportProgress} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${exportProgress}%`}}/></div><button className="cancel-btn" onClick={()=>abortRef.current?.abort()}>Cancel export</button></>}
          {success&&<div role="status" className="success-message"><Check size={16}/>{success}</div>}
          {error&&<div role="alert" className="error-message"><CircleHelp size={16}/>{error}</div>}
          <p className="export-note"><Check size={13}/> Your image never leaves your browser. <span>GIFs are limited to 960px for reliability.</span></p>
        </div></aside>
    </div>
    <div className="studio-bottom"><span>MADE TO MOVE. NOT MADE TO COMPLICATE.</span><div><Square size={11}/> NO LOGIN <MoreHorizontal size={15}/> NO WATERMARK <MoreHorizontal size={15}/> ALL YOU</div></div>
  </div>;
}
