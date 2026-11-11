# Sir Mahee Learning World — app + reminder backend

One small Node.js server (no npm packages) that:
- serves the app (`public/`),
- stores each student's push subscription and language,
- sends a phone notification **every day at 5:00 AM and 8:00 PM IST** (change `TZ_NAME` for another zone).

## Run it
```
node server.js          # needs Node 18+
node test.js            # offline self-test (mock push service)
```
Open http://localhost:3000 → Settings or Notifications → **Turn on reminders**.

## Put it online (required for real phones)
Push notifications only work on **HTTPS**. Deploy the folder to any Node host (Render, Railway, Fly.io, a VPS behind Caddy/Nginx) and open the HTTPS address.

| Setting (environment variable) | Meaning | Default |
|---|---|---|
| `PORT` | server port | 3000 |
| `TZ_NAME` | reminder time zone | Asia/Kolkata |
| `ADMIN_TOKEN` | secret for broadcast/stats (leave empty to disable them) | empty |
| `VAPID_SUBJECT` | contact for push services, e.g. `mailto:you@school.in` | mailto:admin@example.com |
| `DATA_DIR` | where subscribers + keys are stored | ./data |
| `TRUST_PROXY` | set `1` behind a proxy so rate limits use the real IP | off |

**Important:** keep `DATA_DIR` on a persistent disk and back up `data/vapid.json`. If that key file is lost, every student must turn reminders on again. Free hosts with temporary disks will lose subscribers on restart.

## Phones
- **Android (Chrome):** works in the browser; "Add to Home screen" is optional.
- **iPhone (iOS 16.4+):** the app must first be added to the Home Screen (Share → Add to Home Screen), then reminders can be turned on.
- If a student blocks notifications, they must allow them in phone/browser settings.

## Admin: send a one-off message to everyone
```
curl -X POST https://YOUR-SITE/api/broadcast \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Holiday","body":"No class tomorrow"}'
```
The message replaces the daily text for the next 10 minutes. `GET /api/stats` (same header) shows subscriber counts.

## How it works / limits
- The server sends an empty push at the scheduled minute; the app's service worker fetches the text (Hindi or English, per student) and shows it. A restart within 30 minutes after a slot still delivers that slot, never twice.
- Subscribers are kept in `data/subscriptions.json` (fine for thousands; move to a database beyond ~100k).
- Notifications are not personalised yet (no login, so there is no student identity to attach).
- Sending to real phones cannot be tested offline; run the self-test, then use **Send test notification** in the app after deploying.
