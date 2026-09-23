# Plan addendum — Public site, legal pages, and access URLs

Added to BROADCAST BRILLIANCE Master Development Plan (not in original §1–§33).

## Public surfaces

| Surface | Purpose | File / path |
|---------|---------|-------------|
| **Public Home (landing)** | Marketing entry for operators and visitors | `landing.html` |
| **Application (Studio)** | Full production control room | `index.html` (app shell) |
| **Terms of Service** | Legal terms for use of the platform | `terms.html` |
| **Privacy Policy** | Data and privacy practices | `privacy.html` |

These are **not** the same as the in-app **Home / Dashboard** (operational overview). Landing is the public front door; Dashboard remains inside the authenticated control UI.

## Links and redirect / callback URLs

Configure when deploying (and later for Supabase Auth):

| Name | Example path | Notes |
|------|----------------|-------|
| Public site / landing | `/` or `/landing.html` | Entry for anyone with the app link |
| Application | `/app/` or `/index.html` | Production studio |
| Terms | `/terms.html` | Linked from landing + app footer |
| Privacy | `/privacy.html` | Linked from landing + app footer |
| Auth callback (future) | `/auth/callback` | Supabase redirect URL when Auth is connected |
| Guest join (future) | `/guest?token=…` | Guest lobby deep link |

Until Auth is connected, “callback” means **navigation redirects** only (e.g. landing → Open Studio → `index.html`).

## App access link

Anyone who can open the deployment URL can use the app:

- **Local / lab:** serve the `broadcast-brilliance` folder over HTTP and share that origin.
- **Production:** host the same static files (and later API) on your domain, e.g. `https://studio.yourdomain.com/`.

Encoder / RTMP / payments remain subject to the honesty rules in the main plan (not connected until built).

## Guest join URL

| Name | Path |
|------|------|
| Guest lobby / device check | `/guest.html?token=…` |

Generated when an operator creates an invite in the Studio. WebRTC guest media into Program remains subject to Media Engine connectivity.

## Remote camera join URL

| Name | Path |
|------|------|
| Remote field join | `/remote.html?token=…` |

**Public base URL** is configured in Settings so guest/remote links use the deployed origin instead of only the current browser path.
