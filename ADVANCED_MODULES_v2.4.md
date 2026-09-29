# Advanced modules v2.4.0

## Custom Layout Builder
- Sidebar → Layouts
- New / add regions / drag / assign sources / Save / Apply
- Applied layouts feed Program compositor (`LAYOUTS[id].custom`)

## Audio DSP
- Audio page → Web Audio EQ + compressor + limiter
- Enable to process local streams (browser DSP)

## Advertiser Marketplace
- Sidebar → Marketplace
- Advertisers, submit creative, approve → Ads inventory

## Multi-operator realtime
- Home → Multi-operator room
- BroadcastChannel same-origin tab sync (presence, TAKE, layout)
- Bridge `production.sync` when WS connected

## Platform analytics
- Analytics → YouTube API key + live video ID → Fetch concurrent viewers
- Keys stored only in localStorage

## Multi-destination RTMP
- Existing Destinations UI + server `FFmpegWorker`
- Real push requires Bridge on DO with `RTMP_URL` / per-dest URLs and ffmpeg installed
- Without server: local pipeline status only
