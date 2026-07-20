# TempoTuner

Free tap-tempo trainer and rhythm consistency checker for singers and musicians. Sing something, tap anywhere to the beat, and see exactly where you rushed or slowed down.

**Live at [tempotuner.app](https://tempotuner.app)**

## Features

- **Tap anywhere** — the whole screen is the tap surface; every tap measures your BPM and lands on the live graph
- **Target BPM** — draws a target line on the graph and unlocks the metronome
- **Fading metronome** — counts you in at full volume, then fades out so you keep time on your own
- **Voice recording** — record while you tap, play it back with a playhead synced to the graph to hear where your timing drifted
- **Stats** — average BPM, steadiness %, rushing/dragging trend
- **Share** — export your session (note + stats + graph) as an image
- Single-screen PWA, dark/light theme, fully offline-capable, no account, nothing leaves your device

## Development

```bash
npm install
npm run dev      # dev server
npm run build    # type-check + production build to dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy-pages.yml`.
