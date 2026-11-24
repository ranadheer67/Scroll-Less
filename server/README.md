# ScrollLess API

## Configure

Copy `.env.example` to `.env` in this folder and set `GEMINI_API_KEY` to your key from Google AI Studio. Keep `.env` private; it is ignored by Git. The key is read only by this server and is never sent to the browser. `GEMINI_MODEL` and `PORT` are optional. The default model is `gemini-3.8-flash`.

## Run locally

From the repository root, install the frontend dependencies once with `npm install`. In one terminal, run `npm run dev` for Vite. In another, run `npm --prefix server install` once, then `npm --prefix server run dev` for the API at `http://localhost:3001`. Vite proxies `/api` requests to the backend while the frontend is running at `http://localhost:5173`.

`POST /api/analyze` accepts multipart form data with one or more `screenshots` files (JPEG, PNG, or WebP; at most 10 images, 8 MB each) and returns one structured result per screenshot. Files are held in memory for the request and are not written to disk. No usage data is stored. Gemini API retention and processing are governed by Google's service terms.

`GET /api/health` returns `{ "status": "ok", "geminiConfigured": true|false }`; it never returns the key. `POST /api/test-gemini` sends a short text-only probe and returns Gemini's response. This endpoint is temporary and should be removed before production deployment.
