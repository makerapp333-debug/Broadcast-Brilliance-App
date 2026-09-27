# BROADCAST BRILLIANCE v2.0.0

Browser-based TV news production & live broadcasting studio control surface.

**Hosting target:** DigitalOcean (see `docs/PLAN_ADDENDUM_DIGITALOCEAN.md` and `docs/DIGITALOCEAN_DEPLOY.md`).

**Architecture rule:** ONE PROGRAM OUTPUT — every module feeds the central Program Engine.

---

## Quick start (local)

```bash
# From this folder — any static server
python3 -m http.server 8765
# Open http://localhost:8765/index.html
```

Optional Director Bridge skeleton:

```bash
cd server && node src/index.js
# ws://localhost:8787/bridge
```

In Studio Settings, set Bridge URL and disable stub if using the server.

---

## Included (built)

| Area | Status |
|------|--------|
| Studio Preview / Program / Switcher | CUT, FADE, AUTO, BLACK, HOLD, layouts |
| Source Engine | Cameras, screen, media, image, YouTube, remote, guest slots |
| Local Media | getUserMedia, screen share, canvas compositor, MediaRecorder |
| Graphics | 7 lower-third templates, colours, logo upload, ticker, LIVE, clock |
| News Director | Rundown, Timed Auto, persist |
| Guests | Invite, tiers, join page, join inbox |
| Remote field | remote.html + share links |
| Ads | Scheduling, priority AD, audio duck |
| Audio mixer | Levels, mute/solo, meters, duck on ad |
| Destinations | YouTube / Facebook / RTMP shell + Bridge status |
| Recordings | Local WebM list + auto-record option |
| Analytics / Home | Operational dashboards |
| Users / roles | Client-side capability gates |
| Emergency / Breaking | Priority stack |
| Public | landing, terms, privacy, guest, remote, auth callback |
| Docs | Bridge API, DO deploy, plan addenda |

---

## Explicitly later (not in this package as live services)

These remain **not connected** until you deploy them on DigitalOcean:

1. Real multi-bitrate **encoder / RTMP / SRT** push  
2. **WebRTC SFU** guest & remote ingest into Program  
3. **App auth + Managed Postgres** (sessions, RLS-equivalent)  
4. **Spaces** cloud storage for media/recordings  
5. **Payment gateways** (M-Pesa / IntaSend) for paid guests / ads  
6. Multi-operator **realtime sync** across machines  
7. Mobile / tablet dedicated control apps  

The UI stays honest: Encoder offline, Media Engine local/bridge, payments pending.

---

## Deploy on DigitalOcean

See `docs/DIGITALOCEAN_DEPLOY.md`.

1. Upload this folder to App Platform (static) or Droplet + Nginx  
2. HTTPS domain  
3. Studio → Settings → Public site URL = `https://your-domain.com`  
4. Later: Bridge process + Postgres + Spaces  

---

## File map

```
index.html          Studio application shell
app.js              Program Engine + all modules
bridge.js           Director Bridge client
landing.html        Public home
guest.html          Guest join / lobby
remote.html         Remote camera join
terms.html / privacy.html
auth/callback.html  Future DO app auth redirect
server/             Director Bridge skeleton (Node, zero deps)
docs/               API, deploy, plan addenda
```
