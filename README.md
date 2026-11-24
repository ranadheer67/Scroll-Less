# ScrollLess

ScrollLess is a React + Vite frontend for understanding screen time, with a separate Express API that sends screenshots to Google's Gemini API for structured visual extraction.

## Run locally

1. Install frontend packages from the repository root: `npm install`.
2. Copy `server/.env.example` to `server/.env` and set `GEMINI_API_KEY` using a key created in [Google AI Studio](https://aistudio.google.com/app/apikey). The key stays in the backend environment; do not put it in a `VITE_` variable or frontend source.
3. Install backend packages once: `npm --prefix server install`.
4. Start the backend in one terminal: `npm --prefix server run dev` (port 3001).
5. Start the frontend in another terminal: `npm run dev` (port 5173). Vite proxies `/api` to the backend.

`POST /api/analyze` accepts multiple JPEG, PNG, or WebP screenshots as multipart `screenshots` fields and returns per-image dates, total screen time, and app usage records. Images are held in memory for the request and are not written to disk. The API does not implement recommendations.

`GET /api/health` reports API status and whether the server sees a Gemini key without exposing it. `POST /api/test-gemini` is a temporary text-only connectivity check; remove it before production deployment.

See [server/README.md](server/README.md) for the API limits and endpoint details.
