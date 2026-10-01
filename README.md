# Glitter GIF Maker

Turn one or more photos into sparkly animated GIFs with a glitter effect — right in your browser. No backend, no uploads: your images never leave your device.

## Features

- Add one or multiple images (tap to browse, drag & drop, or paste from the clipboard)
- Images are processed one by one with per-image and overall progress
- Download finished GIFs individually or grab them all as a ZIP
- Three output sizes (Small 320 px / Medium 480 px / Large 640 px)
- Works on desktop and mobile
- Start over at any time — including mid-conversion

## The effect

Each GIF gets a twinkling sequin border, twinkling sparkles, rounded corners, and a thin frame. The glittery/ball border is only at the top and bottom of the image.

## Tech

- [Next.js](https://nextjs.org) (App Router) + [Tailwind CSS](https://tailwindcss.com)
- [gifenc](https://github.com/mattdesl/gifenc) for client-side GIF encoding
- [JSZip](https://stuk.github.io/jszip/) for the bulk ZIP download
- [Vercel Speed Insights](https://vercel.com/docs/speed-insights) for Core Web Vitals

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Deploy to Vercel with `npx vercel` or by connecting the repository — the Speed Insights collection routes are added automatically.

## Sizing note

The size selector includes an **Original** option, selected by default, which keeps the image at its own size (capped at 1920 px on the longest side to keep files and encode times sane). The glitter and ball borders keep working and stay glittery at any size — the sequin bands, sparkles, and frame scale proportionally with the image.