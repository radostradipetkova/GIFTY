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

Browser-local GIF/video processing keeps the source image on your device. AI generation is different: it sends the selected image and prompt to an external model through an authenticated Cloudflare Worker endpoint. A GPU running a model is required; AI video generation is a paid third-party model accessed through Cloudflare Workers AI. Learn more in [`backend/README.md`](backend/README.md).

## Deploy to Cloudflare Workers (already in use)

GIFTY is deployed at [gifty.radostradipetkova.workers.dev](https://gifty.radostradipetkova.workers.dev). Its GitHub-connected Cloudflare Worker builds with `npm run build` and deploys with `npx wrangler deploy`; leave the Cloudflare root directory blank. The `wrangler.jsonc` file configures static assets, SPA routing, the AI model binding and a per-client rate limiter. Do **not** add a `public/_redirects` file: it caused Cloudflare error 100324.

## Real AI video generation (opt-in)

The AI Motion Lab uses Cloudflare Workers AI's third-party **Vidu Q3 Turbo** image-to-video model. It can generate short 540p videos from a user image and prompt, and the returned MP4 can be converted to a GIF locally. AI generation runs through a same-origin Worker endpoint: visitors never enter the provider API key or a backend URL.

**AI is disabled by default to prevent unintended bills.** A site owner must activate Cloudflare third-party AI credits/billing and secure the endpoint with Cloudflare Turnstile (or a private owner passcode), then set `GIFTY_AI_ENABLED=true` in the Cloudflare Worker environment. Cloudflare pricing currently lists $0.04 per second at 540p, or about $0.12 for 3 seconds (pricing subject to change). There is no unlimited free AI generation.

See **[full activation guide](docs/cloudflare-ai.md)**. The existing optional `backend/` ComfyUI server remains available for developers, but is not required by the default Cloudflare UI.

## License

MIT. Original GIFTY brand and demo SVG artwork may be reused under the same license. Dependencies retain their respective licenses, including `gifenc`, React, Vite, Motion, Lucide, Tailwind and Wrangler.
