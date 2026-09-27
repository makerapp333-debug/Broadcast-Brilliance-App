# DigitalOcean deploy checklist — Broadcast Brilliance

Production target: **DigitalOcean** (not Supabase).

## 1. What to upload

Upload the whole app folder (static + client):

```
index.html          ← Studio
app.js
bridge.js
landing.html
guest.html
remote.html
terms.html
privacy.html
auth/callback.html  ← future app auth
docs/               ← optional
```

## 2. App Platform (static site) — simplest UI host

1. Create **App** → **Static Site** (or GitHub deploy).
2. Point to this folder; output dir = project root.
3. Enable **HTTPS** and attach your domain.
4. After deploy, open **Settings → Public site URL** in the studio and set:
   `https://your-domain.com` (no trailing slash).
5. Guest / remote links will use that base.

**Camera / screen share** require a **secure context (HTTPS)** — DO App Platform TLS is enough.

## 3. Droplet (if you also run Bridge / media later)

1. Ubuntu Droplet + Nginx.
2. Serve static files from `/var/www/broadcast-brilliance`.
3. Reverse-proxy WebSocket Bridge later, e.g. `wss://your-domain.com/bridge` → `localhost:8787`.
4. Put secrets only in **environment variables** / server config — never in `app.js`.

## 4. Managed services (when you connect backend)

| Need | DigitalOcean product |
|------|----------------------|
| Database | Managed PostgreSQL |
| Media files / recordings | Spaces |
| App API + Bridge | App Platform service or Droplet process |

## 5. Post-deploy checks

- [ ] `https://your-domain.com/landing.html` loads  
- [ ] `https://your-domain.com/index.html` Studio loads  
- [ ] Settings → Public site URL set  
- [ ] Guest invite link opens `guest.html?token=…`  
- [ ] Camera works only on HTTPS  
- [ ] Encoder still shows offline until Bridge is deployed  

## 6. Honest limits after static deploy only

- Local Program / MediaRecorder work in the browser  
- Multi-destination RTMP needs Bridge + encoder on DO  
- Real multi-user auth needs app API + Postgres on DO  
