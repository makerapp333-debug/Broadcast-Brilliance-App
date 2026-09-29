# Deferred — build later on DigitalOcean

Agreed / plan items **not** shipped as live infrastructure in v2.0.0:

| Item | Plan ref | Notes |
|------|----------|--------|
| Encoder + multi RTMP/SRT | §18–19, M5 | Bridge nacks destination start until encoder exists |
| WebRTC SFU guest/remote | §6, §10, M5–M6 | Join pages are lobby/device only |
| App auth + Postgres | §23–24 (DO) | Client role gates only |
| Spaces media storage | §24 DO | Object URLs are browser-local |
| M-Pesa / IntaSend | §11, §16 | Paid guest / ad payment pending |
| Multi-operator Realtime | §15, §25 | Single-browser state + localStorage |
| Mobile director app | §16, M16 | Responsive desktop first |
| Full audio DSP | §17 | Duck/mute/level only |

Do not remove honest “NOT CONNECTED” labels until the matching DO service is live.
