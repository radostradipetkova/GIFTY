"""Opt-in GIFTY AI gateway for a self-hosted ComfyUI image-to-video workflow.

Do not expose ComfyUI to the public. This gateway requires a bearer token and
restricts CORS. A GPU, working ComfyUI workflow, and model weights are required.
"""
from __future__ import annotations

import asyncio
import copy
import io
import json
import os
import secrets
import time
import uuid
from pathlib import Path
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

HERE = Path(__file__).resolve().parent
API_TOKEN = os.environ.get('GIFTY_API_TOKEN', '')
COMFY_URL = os.environ.get('GIFTY_COMFY_URL', 'http://127.0.0.1:8188').rstrip('/')
WORKFLOW_FILE = HERE / os.environ.get('GIFTY_WORKFLOW_FILE', 'workflow_api.json')
IMAGE_NODE = os.environ.get('GIFTY_IMAGE_NODE_ID', '')
PROMPT_NODE = os.environ.get('GIFTY_PROMPT_NODE_ID', '')
OUTPUT_NODE = os.environ.get('GIFTY_OUTPUT_NODE_ID', '')
MAX_JOBS = max(1, min(int(os.environ.get('GIFTY_MAX_JOBS', '20')), 100))
PARALLEL_JOBS = max(1, min(int(os.environ.get('GIFTY_MAX_PARALLEL_JOBS', '1')), 3))
ORIGINS = [x.strip() for x in os.environ.get('GIFTY_ALLOWED_ORIGINS', 'http://localhost:5173').split(',') if x.strip()]
JOBS_DIR = HERE / 'jobs'
JOBS_DIR.mkdir(exist_ok=True)

app = FastAPI(title='GIFTY private AI gateway', version='1.0')
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=False,
                   allow_methods=['GET', 'POST'], allow_headers=['Authorization', 'Content-Type'])

class Job(BaseModel):
    id: str
    status: Literal['queued', 'running', 'completed', 'failed']
    progress: float | None = None
    error: str | None = None
    created: float = Field(default_factory=time.time)
    result_path: str | None = None

jobs: dict[str, Job] = {}
semaphore = asyncio.Semaphore(PARALLEL_JOBS)

async def require_auth(authorization: str | None = Header(default=None)):
    if not API_TOKEN:
        raise HTTPException(status_code=503, detail='Set GIFTY_API_TOKEN to enable AI generation.')
    expected = f'Bearer {API_TOKEN}'
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail='Invalid access token.')

@app.get('/health')
async def health():
    return {'status': 'ok', 'configured': bool(API_TOKEN and WORKFLOW_FILE.exists() and IMAGE_NODE and PROMPT_NODE)}

@app.post('/jobs', dependencies=[Depends(require_auth)])
async def create_job(image: UploadFile = File(...), prompt: str = Form(...)):
    if not WORKFLOW_FILE.is_file() or not IMAGE_NODE or not PROMPT_NODE:
        raise HTTPException(status_code=503, detail='Configure an exported ComfyUI API workflow and required node IDs.')
    if len(prompt.strip()) < 3 or len(prompt) > 1000:
        raise HTTPException(status_code=422, detail='Prompt must be between 3 and 1000 characters.')
    if image.content_type not in ('image/png', 'image/jpeg', 'image/webp'):
        raise HTTPException(status_code=415, detail='JPEG, PNG or WebP required.')
    data = await image.read(10 * 1024 * 1024 + 1)
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail='Maximum image size is 10 MB.')
    try:
        picture = Image.open(io.BytesIO(data))
        picture.verify()
        picture = Image.open(io.BytesIO(data))
        if picture.width * picture.height > 24_000_000:
            raise HTTPException(status_code=413, detail='Image dimensions exceed the safe limit.')
        fmt = picture.format
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail='Image is invalid or corrupted.') from exc
    if fmt not in ('PNG', 'JPEG', 'WEBP'):
        raise HTTPException(status_code=415, detail='Unsupported actual image encoding.')
    if len(jobs) >= MAX_JOBS:
        # In-memory job metadata is bounded; evict the oldest completed/failed job.
        evictable = sorted((x for x in jobs.values() if x.status in ('completed', 'failed')),
                          key=lambda x: x.created)
        if not evictable:
            raise HTTPException(status_code=429, detail='Generation queue is full. Try later.')
        old = evictable[0]
        jobs.pop(old.id, None)
        if old.result_path:
            Path(old.result_path).unlink(missing_ok=True)
    job_id = str(uuid.uuid4())
    job = Job(id=job_id, status='queued')
    jobs[job_id] = job
    asyncio.create_task(execute_job(job_id, data, prompt.strip(), fmt.lower()))
    return job.model_dump(exclude={'result_path'})

@app.get('/jobs/{job_id}', dependencies=[Depends(require_auth)])
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail='Job not found.')
    return job.model_dump(exclude={'result_path'})

@app.get('/jobs/{job_id}/file', dependencies=[Depends(require_auth)])
async def get_file(job_id: str):
    job = jobs.get(job_id)
    if not job or job.status != 'completed' or not job.result_path:
        raise HTTPException(status_code=404, detail='Video not ready.')
    path = Path(job.result_path)
    if not path.is_file():
        raise HTTPException(status_code=410, detail='Video file no longer available.')
    mime = {'mp4': 'video/mp4', 'webm': 'video/webm', 'gif': 'image/gif'}.get(path.suffix[1:], 'application/octet-stream')
    return FileResponse(path, media_type=mime, filename=f'gifty-ai-{job_id}{path.suffix}')

async def execute_job(job_id: str, data: bytes, prompt: str, extension: str):
    async with semaphore:
        job = jobs[job_id]
        job.status = 'running'
        try:
            workflow = json.loads(WORKFLOW_FILE.read_text(encoding='utf-8'))
            if IMAGE_NODE not in workflow or PROMPT_NODE not in workflow:
                raise ValueError('Configured node IDs not present in workflow JSON.')
            workflow = copy.deepcopy(workflow)
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=120.0)) as client:
                # Image input is sent to a private ComfyUI instance. No public ComfyUI endpoint.
                response = await client.post(f'{COMFY_URL}/upload/image', files={
                    'image': (f'gifty-{job_id}.{extension}', data, f'image/{"jpeg" if extension == "jpeg" else extension}')},
                    data={'overwrite': 'false'})
                response.raise_for_status()
                uploaded = response.json()['name']
                workflow[IMAGE_NODE]['inputs']['image'] = uploaded
                workflow[PROMPT_NODE]['inputs']['text'] = prompt
                response = await client.post(f'{COMFY_URL}/prompt', json={'prompt': workflow, 'client_id': f'gifty-{job_id}'})
                response.raise_for_status()
                prompt_id = response.json()['prompt_id']
                # ComfyUI does not have a universal percentage API. Poll actual completion only.
                deadline = time.monotonic() + 900
                history_entry = None
                while time.monotonic() < deadline:
                    await asyncio.sleep(3)
                    history_response = await client.get(f'{COMFY_URL}/history/{prompt_id}')
                    history_response.raise_for_status()
                    history_entry = history_response.json().get(prompt_id)
                    if history_entry:
                        break
                if not history_entry:
                    raise TimeoutError('GPU model did not complete within 15 minutes.')
                status = history_entry.get('status', {})
                if status.get('status_str') == 'error':
                    raise RuntimeError('The ComfyUI generation workflow failed.')
                outputs = history_entry.get('outputs', {})
                candidates = [outputs[OUTPUT_NODE]] if OUTPUT_NODE and OUTPUT_NODE in outputs else outputs.values()
                output_file = None
                for output in candidates:
                    for key in ('gifs', 'videos', 'images'):
                        for item in output.get(key, []):
                            ext = Path(item.get('filename', '')).suffix.lower()
                            if ext in ('.mp4', '.webm', '.gif'):
                                output_file = item
                                break
                        if output_file:
                            break
                    if output_file:
                        break
                if not output_file:
                    raise ValueError('No MP4/WebM/GIF output found. Configure a video-combine node in ComfyUI.')
                response = await client.get(f'{COMFY_URL}/view', params={
                    'filename': output_file['filename'], 'subfolder': output_file.get('subfolder', ''),
                    'type': output_file.get('type', 'output')})
                response.raise_for_status()
                ext = Path(output_file['filename']).suffix.lower()
                if len(response.content) > 150 * 1024 * 1024:
                    raise ValueError('Output exceeds the 150 MB download limit.')
                result = JOBS_DIR / f'{job_id}{ext}'
                result.write_bytes(response.content)
                job.result_path = str(result)
                job.status = 'completed'
        except Exception as exc:  # sent to user only through authenticated job endpoint
            job.error = str(exc)[:250]
            job.status = 'failed'
