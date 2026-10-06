# FreshCV – Resume Builder for Freshers & College Students

```
resume-builder/
├── backend/    Node.js + Express REST API (JWT auth, JSON-file storage)
└── frontend/   Vanilla HTML/CSS/JS single-page app (no build step)
```

## Features
- Sign up / log in (bcrypt + JWT, auth endpoints rate-limited, show/hide password)
- **Mobile number captured at registration** (required, validated)
- **Separate admin panel** at `/admin.html`: first visit takes *your* details to create the admin account, then shows everyone who registered with their sign-up details
- Student-focused sections: objective, education, skills, projects, internships, certifications, achievements
- Live A4 preview, **Modern / Classic / Minimal** templates, accent colour picker
- **Resume strength meter** (0–100%) that updates as you type
- **One-click sample data** to see a fully filled-in example resume
- Auto-save to the backend, **Ctrl/Cmd+S to save instantly**, multiple resumes per user
- Dashboard: **search/filter resumes**, **duplicate** any resume, delete
- **Dark mode** toggle (persisted across sessions)
- Download as PDF (browser print → "Save as PDF")

## Run it
Requires Node.js 18+.

```bash
cd backend
npm install
npm start            # API on http://localhost:5000
```

Open **http://localhost:5000** – the backend also serves the `frontend/` folder for convenience.

Or host the frontend separately (e.g. `npx serve frontend`, VS Code Live Server) and set the API URL in `frontend/config.js`.

Optional: copy `backend/.env.example` and export `PORT` / `JWT_SECRET` (set a strong secret in production).

## API
| Method | Route | Description |
|---|---|---|
| POST | /api/auth/register | `{name,email,password,mobile}` |
| POST | /api/auth/login | `{email,password}` |
| GET | /api/auth/me | current user |
| GET/POST | /api/resumes | list / create |
| GET/PUT/DELETE | /api/resumes/:id | read / update / delete |
| POST | /api/resumes/:id/duplicate | copy a resume |
| GET | /api/health | health check |
| GET | /api/admin/setup | is the admin account claimed yet? |
| POST | /api/admin/setup | claim admin access (works only once, first run) |
| POST | /api/admin/login | admin login `{email,password}` |
| GET | /api/admin/users | registrations + stats (admin token required) |
| PUT | /api/admin/users/:id | edit a registration's name / email / mobile (admin) |
| DELETE | /api/admin/users/:id | delete a registration + its resumes (admin, not yourself) |

Unknown `/api/*` routes return a JSON 404. `backend/data/db.json` is auto-created; a `.bak`
snapshot of the previous state is kept next to it on every save.

## Hosting it as a website
The app is deploy-ready: the frontend calls the API on the **same origin** (`/api`),
and `TRUST_PROXY=1` makes the rate limiter see real visitor IPs behind a proxy.

1. **Push the repo to GitHub** (or any git host).
2. **Create a Web Service** on [Render](https://render.com) (or Fly.io / DigitalOcean App Platform):
   - Build command: `npm install`
   - Start command: `npm start` (run from `backend/` — set Root Directory to `backend`)
3. **Set environment variables**: `JWT_SECRET` (long random string — required!), `TRUST_PROXY=1`.
   `PORT` is provided by the platform; the server reads it automatically.
4. Deploy — you get `https://your-app.onrender.com` with HTTPS automatically.
   Attach a custom domain in the dashboard when ready.
5. Open `/admin.html` on the live site and claim the admin account.

**Alternatives**: Fly.io (containers + persistent volumes), DigitalOcean App Platform,
or any VPS with Nginx + PM2. Serverless hosts like Vercel/Netlify are **not** suitable —
this is a long-running server.

**Data warning**: users/resumes live in `backend/data/db.json`. On hosts with ephemeral
disk (free tiers) that file is wiped on every redeploy — use a plan with a persistent
volume, or swap the `load/save` helpers for a managed database.

## Admin panel
Open **http://localhost:5000/admin.html**. On first visit the panel asks for your name,
email, mobile and password — that creates the single admin account and signs you in.
Later visits show the admin login. The panel lists every registered user with the details
they provided at sign-up (name, email, mobile, time, resume count, role).
From the panel you can **edit** any registration's details (modal with name / email / mobile,
duplicate emails are rejected) or **delete** it — deletion also removes that person's resumes,
you can't delete your own admin account, and an admin account always remains.

## Notes
Data lives in `backend/data/db.json`. For production, swap the `load/save` helpers in `server.js` for MongoDB/PostgreSQL.
