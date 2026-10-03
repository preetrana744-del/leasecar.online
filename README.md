# LeaseCar.online

A full-stack, database-driven car rental website with a cinematic WebGL/Three.js hero, GSAP motion, six-car live fleet, secure admin authentication, editable prices, replaceable vehicle photos, and stored reservation requests.

## Run on your Mac

1. Install Node.js **22.5+**.
2. In Terminal, open this folder.
3. Optional but recommended before the first run: `cp .env.example .env` and set a strong `ADMIN_PASSWORD`.
4. Run: `npm start`
5. Open: `http://localhost:3000`
6. Admin: `http://localhost:3000/admin`

There are **no npm dependencies**. The server uses Node's built-in HTTP, crypto, filesystem and SQLite modules. The start command suppresses only Node 22's known `node:sqlite` experimental-status warning; application errors still print normally. Three.js and GSAP are loaded in the browser from jsDelivr. If `ADMIN_PASSWORD` is blank on the very first start, a strong one-time password is generated and printed in the Terminal.

## What is dynamic

The six car names, daily prices, and image URLs come from SQLite (`data/leasecar.db`). The homepage calls `/api/cars`; no fleet price or photo URL is embedded in the homepage markup. Admin updates are written to the database and appear on the public site on refresh.

## Security included

- scrypt password hashing with random salts
- random server-side session tokens stored only as SHA-256 hashes
- HttpOnly + SameSite=Strict cookie; Secure in production
- per-session CSRF tokens for admin mutations
- login rate limiting
- same-origin write checks
- file type and 8 MB upload limits
- restrictive Content Security Policy and other browser security headers
- SQL parameters for all user input

For internet deployment, run behind HTTPS and set `NODE_ENV=production`. Back up both `data/leasecar.db` and `public/uploads/`.

## Initial six-car database

The initial daily prices are editable demo rates: Scorpio N ₹5,500, Fortuner ₹7,500, Scorpio Classic ₹4,500, Thar ₹5,000, Innova Crysta ₹5,800, Swift Dzire ₹2,800. Replace them from the admin dashboard with your actual commercial rates.

Seed photos are remote Creative Commons demo images. Replace any/all of them from the admin dashboard with your own licensed fleet photos for production.
