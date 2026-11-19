# gifty. — Your pictures deserve to move.

**GIFTY** is a real browser-local image-to-GIF motion studio, built with React, TypeScript, Vite, Tailwind CSS, Canvas 2D and `gifenc`. Upload JPEG/PNG/WebP, apply ten adjustable effects, preview, scrub, crop, and export a real animated GIF or a browser-supported video. No account or server is required for the editor.

![GIFTY brand](public/favicon.svg)

## Run locally

Node 22 recommended (minimum Node 20.19):

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

## Tests and build

```bash
npm run check     # TypeScript
npm test          # Vitest presets + independent GIF decoder integrity check
npm run build     # Production distribution in dist/
npx playwright install chromium
npm run test:e2e  # Chromium end-to-end: real GIF download and frame integrity
```

The automated workflow at `.github/workflows/ci.yml` runs type checking, unit tests, the production build and browser tests on pushes to `main`. **A successful GitHub push is not proof that these tests passed; check Actions.**

## What's included

- Ten functional Canvas effects: Cinematic Zoom, Dream Float, Parallax Tilt, VHS Glitch, Ken Burns, Hypnotic Pulse, Orbital Motion, Reality Split, Dream Blur and Floating Product.
- Intensity, speed, direction, easing, duration, reverse and loop controls, crop/fit/position, image color adjustments and demo artwork.
- Timeline playback, pause, restart, scrubbing, original-vs-animated comparison and randomized presets.
- GIF encoding on a Web Worker with palette quantization, incremental frame rendering, encoding progress and cancellation. Exported frames use the **same Canvas renderer as the preview**.
- Video encoding through the browser's `MediaRecorder` / Canvas captureStream. WebM and MP4 buttons only appear when the browser reports support.
- An optional AI Motion Lab with authenticated ComfyUI/FastAPI integration and no fake generation; plus free browser-local existing-video-to-GIF conversion.
- Responsive layout, reduced-motion CSS, keyboard playback shortcut (Space), local settings persistence, file validation and no image uploads in Motion Studio.
- Three in-house SVG demonstration images released under the repository's MIT license.

### Practical limits

GIFs are rendered at up to 960px on the long edge (or a maximum of ~1.6 megapixels for video conversion) to limit memory and render time. GIF has a 256-color palette and is typically much larger than a modern video file. Some browsers do not support `MediaRecorder`, WebM or MP4: unavailable formats are not offered. Most browser video capture runs in real time.

Browser-local GIF/video processing keeps the source image on your device. AI generation is different: it sends the selected image and prompt to **the explicitly configured private backend**. A GPU running a model is required; Cloudflare Pages does not provide free GPU inference. Learn more in [`backend/README.md`](backend/README.md).

## Deploy to Cloudflare Pages (Free)

1. Push this repository to the `main` branch. Ensure Actions checks pass.
2. In **Cloudflare → Workers & Pages → Create application → Pages → Connect to Git**, grant Cloudflare access to `radostradipetkova/GIFTY`.
3. Select **Framework preset: Vite** (or None) and these settings:
   - **Production branch:** `main`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** repository root
   - **Node version:** 22 (set `NODE_VERSION=22` in build environment if needed)
4. Deploy. Visit the public `*.pages.dev` URL, navigate to `/studio`, apply an effect and download a real GIF.
5. Push another small change to `main`; Cloudflare should automatically create a new deployment. Open **Deployments** to confirm it completed successfully. If not, inspect the failed build logs; do not assume the website is live.

Cloudflare Pages serves the static app only. `public/_redirects` rewrites SPA routes to `/index.html`. Never expose private API tokens as `VITE_*` variables or commit `.env` files. You can optionally set `VITE_GIFTY_AI_URL` to an HTTPS backend URL. End users still enter their own access token during the session.

## Optional AI backend

See [`backend/README.md`](backend/README.md) for Python FastAPI, token-protected ComfyUI API gateway, secure origin restrictions, queue limits and workflow configuration. It is an **integration path**, not pre-provisioned AI inference. The live AI generation feature is unverified until a compatible ComfyUI model and workflow are configured on a working GPU host.

## License

MIT. Original GIFTY brand and demo SVG artwork may be reused under the same license. Dependencies retain their respective licenses: `gifenc` (MIT), React (MIT), Vite (MIT), Motion (MIT), lucide-react (ISC), Tailwind CSS (MIT), and others as specified in their distributions.
