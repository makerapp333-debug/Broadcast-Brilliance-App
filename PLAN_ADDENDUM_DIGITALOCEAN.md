# Plan addendum — Hosting & backend (DigitalOcean)

**Decision (operator):** Production hosting and backend infrastructure target **DigitalOcean**, not Supabase.

This supersedes Master Plan §24 (Supabase Backend) and related Auth/RLS wording where it assumed Supabase as the only platform.

---

## Target stack on DigitalOcean

| Layer | DigitalOcean approach |
|-------|------------------------|
| **App hosting** | App Platform and/or Droplet (Node/static + reverse proxy) |
| **HTTPS / domain** | DO load balancer or App Platform TLS |
| **Database** | Managed PostgreSQL (or self-managed Postgres on Droplet) |
| **Object storage** | Spaces (S3-compatible) for media, graphics assets, recordings |
| **Auth** | App-owned auth (sessions/JWT) against Postgres — *not* Supabase Auth |
| **Realtime** | App WebSocket / Director Bridge on DO (existing Bridge path), or managed messaging later |
| **Secrets** | Environment variables / DO secure env — stream keys never in client storage |

---

## What this means for Broadcast Brilliance

1. **Studio UI** remains the browser control surface (can be static assets on App Platform or CDN).
2. **Director Bridge / Media Engine** services should be deployed as DO apps or processes (not “Supabase Edge”).
3. **Users, roles, audit logs** persist in **Postgres on DigitalOcean** when connected; current client-side role gates are temporary.
4. **Storage** for uploads/recordings → **Spaces** (or Droplet disk for lab only).
5. **Public URLs** (landing, guest.html, remote.html, auth callback) are the deployed DO domain + paths already in the legal/public addendum.

---

## Auth callback (future)

| Name | Path | Notes |
|------|------|--------|
| Auth callback | `/auth/callback` | App-owned OAuth/session callback on the DigitalOcean domain — **not** Supabase |

Configure `Settings → Public site URL` to the DO HTTPS origin after deploy.

---

## Honest status (unchanged principle)

Until the DO media/auth services are connected:

- MEDIA ENGINE / Encoder / RTMP may still show **not connected** or **local only**
- Role gates remain **client-side only**
- Do not claim multi-tenant security until Postgres + server sessions are live

---

## Master Plan reference updates

| Original | Correction |
|----------|------------|
| §24 Supabase Backend | **DigitalOcean** (App Platform/Droplet + Managed Postgres + Spaces) |
| Supabase Auth / RLS | App auth + Postgres policies / server authorization |
| Supabase Storage | DigitalOcean Spaces |
| Supabase Realtime | Director Bridge / app WebSockets on DO |

All modules still feed **ONE PROGRAM OUTPUT** through the central Program Engine.


See also: [`DIGITALOCEAN_DEPLOY.md`](./DIGITALOCEAN_DEPLOY.md) for step-by-step publish checks.
