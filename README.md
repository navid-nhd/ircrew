# IRCrew

Mobile-first React PWA for Iran Air crew schedule (`crew.iranair.com`).

## Run

```bash
npm run install:all   # first time
npm run dev           # starts both server (3001) and client (5173)
```

Open `http://localhost:5173` on your phone (same WiFi) or your laptop.

## Architecture

- `server/` — Node 20+ Express proxy. Iran Air's site has no CORS and the
  Flight Crew page uses ASP.NET WebForms (`__VIEWSTATE` postbacks), so the
  proxy logs in, drives postbacks, and parses the resulting HTML into JSON.
- `client/` — Vite + React 19 + TypeScript + Tailwind v4. RTL, Vazirmatn,
  mobile-first with bottom tab nav.

## Endpoints

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /api/login` | `{code, pass}` | `{periods: string[]}` |
| `POST /api/roster` | `{code, pass, period}` | `{rangeLabel, rows[]}` |
| `POST /api/flight-crew/flights` | `{code, pass, date}` | `{flights[]}` |
| `POST /api/flight-crew/crew` | `{code, pass, date, eventTarget, eventArgument}` | `{crew[], flights[]}` |
