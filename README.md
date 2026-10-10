# GO LIVE STREAM — app + API foundation

The public web UI is hosted as a Render static site. This repository now also includes an Express/PostgreSQL API foundation.

## API endpoints
- GET /health
- POST /api/auth/register — username, email, password (10+ chars)
- POST /api/auth/login — email, password
- GET /api/me and PATCH /api/me (Bearer token)
- GET /api/rooms
- POST /api/rooms (Bearer token; kind voice or live)
- GET /api/rooms/:id/messages (Bearer token)
- Socket.IO authenticated events: room:join and room:message

## Separate API deployment
Create a Render Web Service from this repository, branch main, runtime Node, build command `npm install`, start command `npm start`. Add a managed PostgreSQL database and set DATABASE_URL, JWT_SECRET (random secret, at least 32 characters), ALLOWED_ORIGINS and NODE_ENV=production. Do not commit real secrets.

## Important: not production-complete yet
This backend is a foundation, not a finished streaming platform. Real-time media is NOT implemented: configure LiveKit/Agora and server-side token issuance before enabling live audio/video. Payments, coin purchase ledger, creator earnings, withdrawals, identity/age checks, moderation, reports/blocks, privacy policy/terms, admin/agency panels, backups and security/load testing are still required. The current wallet and gifts in the web UI are demo-only and must not be used for real money.

## Provider integration scaffolding added
- POST /api/live/token issues short-lived authenticated LiveKit room tokens when LiveKit env vars are set.
- POST /api/payments/order creates a Razorpay INR order when keys are configured.
- POST /api/payments/verify validates Razorpay checkout signature. It does NOT credit coins; an idempotent payment ledger and verified webhook are required before real coin sales.
- Add LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to the API Render service environment. Never commit actual keys.
