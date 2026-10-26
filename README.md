# NASHYOL Server

Backend for the Android app «НАШЁЛ».

## Endpoints

- `GET /health` — server health.
- `POST /api/frame/identify` — identify likely movie/series/media from a frame. Send `multipart/form-data` with field `image` (JPG/PNG/WEBP, max 10 MB).

## Local start

1. Install Node.js 20+.
2. Run `npm install`.
3. Set `GEMINI_API_KEY` in your environment (never commit it).
4. Run `npm start`.

## Render

Use `npm install` as build command and `npm start` as start command. Add `GEMINI_API_KEY` in Render Environment. Do not put the key into GitHub or the Android APK.
