# Activate GIFTY's real AI Motion Lab (Cloudflare)

GIFTY now supports actual image-to-video generation using `vidu/q3-turbo` through the existing Cloudflare Worker. The Cloudflare Worker owns the model connection: visitors never enter an external AI API key, backend URL, or provider token.

**No inference runs until you explicitly enable the feature.** The browser-local Motion Studio works as before.

## 1. Check Cloudflare AI billing before enabling

- In the Cloudflare dashboard, open **AI → AI Gateway / AI Models**, configure **Unified Billing/credits** for third-party models and check the available account balance/access. The model runs on paid compute, not the free Worker hosting plan.
- Consult the latest Cloudflare model pricing before enabling: https://developers.cloudflare.com/ai/models/vidu/q3-turbo/ . At the documented 540p price of USD $0.04 per video-second, a 3-second video costs about $0.12 and a 5-second video about $0.20, subject to pricing changes, taxes, and provider billing policy.
- **Set an account-wide spending cap / AI Gateway budget** before enabling this on a public website, and monitor usage. A per-IP rate limiter is not a hard worldwide cost cap.

## 2. Secure the public endpoint (recommended)

1. Open **Cloudflare → Turnstile**, create a widget for `gifty.radostradipetkova.workers.dev` (and any custom domain you use).
2. Copy its **site key** and **secret key**. They are not interchangeable.
3. In **Cloudflare → Workers & Pages → gifty → Settings → Variables and Secrets**, add:

| Setting | Kind | Value |
| --- | --- | --- |
| `GIFTY_TURNSTILE_SITE_KEY` | Plain text variable | Your Turnstile site key |
| `GIFTY_TURNSTILE_SECRET` | Encrypted secret | Your Turnstile secret key |
| `GIFTY_AI_ENABLED` | Plain text variable | `true` |

   Turnstile verification must succeed server-side for every public video job. The site verifies the expected hostname and action. Turnstile verification and per-IP rate limiting reduce abuse but cannot guarantee a fixed bill. Protect the deployment using Cloudflare AI Gateway budget controls and Cloudflare WAF rules as needed.
4. Deploy/refresh your Worker configuration and check `https://gifty.radostradipetkova.workers.dev/api/ai/config`. The JSON should say `"enabled":true` and return a public Turnstile `siteKey` (never the secret).
5. Open the AI Motion Lab, upload a photo, complete Turnstile, and generate. This first **paid** test requires your Cloudflare AI account to be funded/authorized.

## 3. Private owner-only testing (alternative)

To test without a public Turnstile widget, create `GIFTY_OWNER_PASSCODE` as an encrypted **secret** on the Worker and set `GIFTY_AI_ENABLED=true`. The AI Motion Lab will show a private passcode field; visitors without the passcode cannot generate. Use a long, random passcode that is *not* your Cloudflare account password or API key. Never commit it. Remove this secret when launching a public Turnstile-protected version.

## 4. How the implementation works

- `wrangler.jsonc` provides the `AI` binding, `AI_RATE` per-IP limiter, and `/api/*` Worker routing alongside the original Vite static assets.
- `GET /api/ai/config` provides only safe public status and model information.
- `POST /api/ai/generate` requires the origin to match, an image compressed in-browser to a max 960px JPEG (<2MB), a bounded prompt, a verified Turnstile token or private owner passcode, and a successful per-IP rate check (one attempt per minute per Cloudflare region).
- Server-side `env.AI.run('vidu/q3-turbo', { prompt, start_image, duration, resolution:'540p', audio:false })` calls actual generative video inference. The uploaded image goes to the chosen third-party model; the client does not expose or store provider credentials.
- The signed, expiring `/api/ai/video` route proxies the returned MP4 from the known provider video domain so GIFTY can preview it and convert to a GIF in the browser. Video links expire after two hours. No upload is stored by GIFTY.
- No fake processing percentages are used. The UI can stop waiting; canceling the HTTP request **does not necessarily cancel provider billing**.

## Troubleshooting

- **Disabled AI**: Confirm `GIFTY_AI_ENABLED=true` and either both Turnstile values or a private owner passcode. Confirm Cloudflare bound `AI` and `AI_RATE` as configured in `wrangler.jsonc`.
- **403**: Check that Turnstile's allowed hostname matches the live site and that verification succeeds; or enter the correct private passcode.
- **429**: Wait a minute before requesting another video from the same IP/location.
- **502**: Verify Cloudflare AI credits, provider model permissions, and output status in Worker logs.
- **Cloudflare deployment fails**: Check the Wrangler output. The AI model integration has been coded but cannot be exercised against a real paid model without your Cloudflare account authorization.

Source: https://developers.cloudflare.com/ai/models/vidu/q3-turbo/ and https://developers.cloudflare.com/workers-ai/configuration/bindings/
