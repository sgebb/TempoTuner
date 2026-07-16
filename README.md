# Tempo Tuner

Tempo Tuner is a lightweight, mobile-first rhythm practice PWA for singers and musicians. Tap a beat, get instant BPM feedback, practice against a metronome, and watch your timing stability unfold in a simple SVG graph.

## Features

- Tap-to-measure BPM instantly
- Live BPM display with average and target difference
- Start/stop metronome with Web Audio API clicks
- Target BPM slider from 40 to 220
- Custom SVG tempo graph with color-coded accuracy
- Mobile-friendly PWA layout with dark mode support
- Local-only session reset and future recording placeholder

## Development

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## GitHub Pages deployment

This app is configured for GitHub Pages with a Vite base path of `/TempoTuner/`.
For the production site at https://tempotuner.app/, you can point your hosting setup at the generated `dist` folder or switch the base path if you host from a custom domain root.

1. Commit the project to your GitHub repository.
2. In the repository settings, enable GitHub Pages and choose the `main` branch with the `/root` folder.
3. Build the app locally:

```bash
npm run build
```

4. Deploy the generated files from the `dist` folder to GitHub Pages.

If you want a fully automated workflow later, you can add a GitHub Actions workflow to publish the contents of `dist` after each push.
