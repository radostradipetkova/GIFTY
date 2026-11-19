# GIFTY AI Motion Lab — Optional self-hosted backend

The public GIFTY site works **without** this backend. This FastAPI service is an optional private connector to a real ComfyUI image-to-video workflow running on a machine with suitable GPU memory. Cloudflare Pages **cannot** run the model itself. AI inference is not unlimited and may incur hardware/cloud costs.

## Setup

1. Install [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on your own GPU machine and install a compatible, maintained image-to-video model and its custom nodes. Follow the model's license and hardware requirements. A workflow with a **LoadImage** input, **CLIPTextEncode** prompt and a final video-saving node (e.g. VHS Video Combine) is needed. Confirm it generates a playable MP4 or WebM in ComfyUI first.
2. Export your working workflow using **Save (API Format)** from ComfyUI, place it in this directory as `workflow_api.json` (ignored by Git if it contains local machine-specific paths), and find the actual node IDs for the image loader, positive text prompt, and video output.
3. On your private backend host:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env      # Windows: copy .env.example .env
   # Edit .env and export its variables into your environment using your process manager.
   set -a; . ./.env; set +a   # Unix shell
   uvicorn main:app --host 127.0.0.1 --port 8000
   ```

4. Configure `GIFTY_COMFY_URL` to **your private ComfyUI host** (do not make the raw ComfyUI API public). Set `GIFTY_API_TOKEN` to a long random secret and `GIFTY_ALLOWED_ORIGINS` to your real Cloudflare site URL. Set the three required node IDs to match your API workflow.
5. Expose only the FastAPI gateway behind HTTPS via a reverse proxy or authenticated tunnel with rate limits. Keep the ComfyUI port private. For a multi-user deployment, replace the single in-memory queue with a persisted job manager, per-user authentication, quotas and request auditing.
6. In GIFTY → AI Motion Lab, enter your HTTPS backend URL and access token. They stay only in the component's memory and are not written into a public `.env` file or local storage. Submit an image and prompt. The backend tracks **actual** queued/running/completed/failed states; it never fakes percentage progress.

The backend rejects oversized/invalid images, limits concurrency and queue size, restricts CORS, uses bearer authorization and returns results from verified ComfyUI history. Restarting this dev-oriented process loses job status. Cleaning `backend/jobs/` is the operator's responsibility. GPU setup is not automated; an AI generation is only verified when a real workflow has been configured and run.

**Do not** put `GIFTY_API_TOKEN` into any frontend `VITE_*` variable. Never deploy with the sample token or allow origins `*`.
