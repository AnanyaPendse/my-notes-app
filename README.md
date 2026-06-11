# Paper — A Sage-Toned Notes App

A warm, paper-feeling note-taking app with cloud sync, image attachments, and a 30-day trash. Built on TanStack Start with a Supabase-backed (Lovable Cloud) backend.

![Stack](https://img.shields.io/badge/TanStack_Start-v1-1f6feb) ![React](https://img.shields.io/badge/React-19-61dafb) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-38bdf8) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

## Features

- Email/password and Google sign-in
- Create, edit, search, and delete notes
- Three-column layout: nav rail · note list (titles only) · full editor
- Attach multiple images per note (stored privately, served via signed URLs)
- Auto-titled, auto-timestamped notes
- Soft-delete trash with restore — items permanently removed after 30 days by a scheduled job
- Sage / warm-paper themed UI with custom serif (Fraunces) and handwriting (Caveat) fonts

## Tech Stack

| Layer | Tool |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR) |
| Routing | TanStack Router (file-based, type-safe) |
| Data | TanStack Query v5 |
| Build | Vite 7 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix) |
| Backend | Supabase — Postgres, Auth, Storage, pg_cron |
| Runtime | Cloudflare Workers (edge) |
| Language | TypeScript (strict) |

## Getting Started

```bash
bun install
bun run dev
```

Then open `http://localhost:5173`.

### Environment variables

Copy `.env` and fill in your Supabase project credentials:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=...
```

## Project Structure

```
src/
├─ routes/
│  ├─ __root.tsx              # App shell
│  ├─ index.tsx               # Redirects to /notes
│  ├─ auth.tsx                # Sign-in / sign-up
│  └─ _authenticated/
│     ├─ route.tsx            # Auth gate
│     └─ notes.tsx            # Notes UI (list + editor + trash)
├─ integrations/supabase/     # Auto-generated client + types
├─ components/ui/             # shadcn primitives
└─ styles.css                 # Theme tokens (OKLCH sage palette)

supabase/migrations/          # SQL schema, RLS policies, cron job
```

See [`TECHNICAL.md`](./TECHNICAL.md) for the deep dive (architecture, schema, RLS, auth flows, retention job).

## Data Model

`public.notes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `user_id` | uuid | FK → `auth.users` |
| `title` | text | |
| `content` | text | |
| `image_paths` | text[] | Storage keys in `note-images` bucket |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz | Soft-delete; purged after 30 days |

Row-Level Security ensures users only see their own notes. The `note-images` bucket is private; the client requests short-lived signed URLs for display.

## Deployment

The app targets Cloudflare Workers via the TanStack Start Vite plugin. Push to your hosting provider of choice (Lovable handles this automatically).

## License

MIT
