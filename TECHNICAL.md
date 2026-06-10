# Sage Notes — Technical Documentation

A cloud-synced note-taking app with text, image attachments, soft-delete trash (30-day retention), and authenticated multi-user access. Built on TanStack Start with a Supabase (Lovable Cloud) backend.

---

## 1. Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | [TanStack Start](https://tanstack.com/start) v1 (React 19 + SSR) |
| Router | TanStack Router (file-based, type-safe) |
| Build tool | Vite 7 |
| Runtime target | Cloudflare Workers (edge) |
| Styling | Tailwind CSS v4 (via `src/styles.css`, native `@import` + theme tokens) |
| UI primitives | shadcn/ui + Radix UI |
| Data fetching | TanStack Query v5 |
| Backend (BaaS) | Supabase — Postgres, Auth, Storage, pg_cron |
| Language | TypeScript (strict) |

---

## 2. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Browser (React 19 + TanStack Router)                       │
│  ─ Routes  ─ TanStack Query cache  ─ Supabase JS client     │
└───────────────┬─────────────────────────────────┬───────────┘
                │ HTTPS (publishable key + JWT)   │
                │                                 │
                ▼                                 ▼
┌──────────────────────────┐        ┌─────────────────────────┐
│  Supabase Auth           │        │  Supabase REST / PostgREST│
│  (email + Google OAuth)  │        │  RLS scoped to auth.uid()│
└──────────────────────────┘        └────────────┬─────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  Postgres              │
                                    │  ─ public.notes        │
                                    │  ─ pg_cron daily purge │
                                    └────────────────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  Supabase Storage      │
                                    │  ─ note-images (private)│
                                    └────────────────────────┘
```

App-internal data access goes directly from the browser to Supabase via the publishable key. Row Level Security enforces per-user isolation. The SSR server (Cloudflare Worker) only renders the shell and protected route gating — there is no custom API layer.

---

## 3. Frontend Layer

### 3.1 Routing
File-based under `src/routes/`. Dots in filenames become URL slashes.

| File | URL | Notes |
| --- | --- | --- |
| `__root.tsx` | — | App shell, providers, `<Outlet />` |
| `index.tsx` | `/` | Redirects to `/notes` |
| `auth.tsx` | `/auth` | Email + Google sign-in |
| `_authenticated/route.tsx` | (layout) | Auth gate; `ssr: false`; redirects to `/auth` if no session |
| `_authenticated/notes.tsx` | `/notes` | Notes app (editor + sidebar + trash) |

The `_authenticated` layout is integration-managed. It runs `supabase.auth.getUser()` client-side and redirects unauthenticated visitors.

### 3.2 Design System
`src/styles.css` defines semantic CSS variables (OKLCH) consumed by Tailwind v4 utilities and shadcn variants. The palette is a warm sage/green theme with paper-grain gradients.

- Fonts: `Fraunces` (serif headings), `Caveat` (handwriting accents)
- Tokens: `--background`, `--foreground`, `--primary`, `--card`, `--sidebar-*`, etc.
- No hardcoded colors in components — always semantic tokens.

### 3.3 State & Data
- **Server state**: TanStack Query (`useQuery`, `useMutation`) wraps all Supabase calls. Caches: `["notes"]`, `["trash"]`.
- **Local UI state**: React `useState` (selected note, dialog open, etc.).
- **Auth state**: `supabase.auth.onAuthStateChange` wired once in `__root.tsx`. Filters to identity events and invalidates router/query cache.

---

## 4. Backend Layer (Lovable Cloud / Supabase)

### 4.1 Database Schema

```sql
public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  title       text not null default '',
  content     text not null default '',
  image_paths text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz                     -- null = active, set = in trash
)
```

`image_paths` stores object keys in the `note-images` storage bucket. Display URLs are generated on demand via short-lived signed URLs.

### 4.2 Row Level Security
RLS is enabled. All four policies scope to `auth.uid() = user_id`:

| Operation | Policy |
| --- | --- |
| SELECT | `auth.uid() = user_id` |
| INSERT | `WITH CHECK auth.uid() = user_id` |
| UPDATE | `USING + WITH CHECK auth.uid() = user_id` |
| DELETE | `auth.uid() = user_id` |

Grants: `SELECT, INSERT, UPDATE, DELETE` on `public.notes` to `authenticated`; full access to `service_role`. No `anon` grants.

### 4.3 Trash & Retention

Soft delete: setting `deleted_at = now()` removes the note from active queries but keeps it restorable. The notes screen filters by `deleted_at IS NULL` for the inbox and `deleted_at IS NOT NULL` for the trash view.

Permanent purge after 30 days is automated via `pg_cron`:

```sql
create or replace function public.purge_expired_trashed_notes()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.notes
  where deleted_at is not null
    and deleted_at < now() - interval '30 days';
$$;

-- Scheduled daily by pg_cron
```

Execute privileges are revoked from `PUBLIC`, `anon`, and `authenticated` — only the cron job (postgres role) runs it.

### 4.4 Storage
Bucket: `note-images` (private). Object path convention: `{user_id}/{note_id}/{uuid}.{ext}`. Reads use `createSignedUrl()` so images never become publicly addressable.

### 4.5 Authentication
- **Email + password** via `supabase.auth.signInWithPassword` / `signUp`.
- **Google OAuth** via the Lovable broker (`lovable.auth.signInWithOAuth("google")`), then `supabase.auth.setSession()`.
- Sessions are persisted in `localStorage` and auto-refreshed.

---

## 5. Request Flows

### 5.1 Read notes
1. Component calls `useQuery(["notes"], fetchNotes)`.
2. Browser sends `GET /rest/v1/notes?deleted_at=is.null` with JWT.
3. PostgREST applies RLS → returns only rows where `user_id = auth.uid()`.

### 5.2 Create / edit
1. `useMutation` invokes `supabase.from("notes").insert(...)` or `.update(...)`.
2. On success: `queryClient.invalidateQueries(["notes"])`.

### 5.3 Attach image
1. File → `supabase.storage.from("note-images").upload(path, file)`.
2. Save returned `path` into `image_paths[]` on the note.
3. Render via `createSignedUrl(path, 3600)`.

### 5.4 Delete / restore
- **Delete** → `UPDATE notes SET deleted_at = now()`.
- **Restore** → `UPDATE notes SET deleted_at = null`.
- **Purge now** → `DELETE FROM notes WHERE id = …` (also removes images).
- **Auto-purge** → daily `pg_cron` job runs `purge_expired_trashed_notes()`.

---

## 6. Project Structure

```text
src/
├── routes/
│   ├── __root.tsx              # App shell, providers, auth listener
│   ├── index.tsx               # → redirects to /notes
│   ├── auth.tsx                # Sign in / sign up
│   └── _authenticated/
│       ├── route.tsx           # Auth gate (ssr:false)
│       └── notes.tsx           # Notes UI (list, editor, trash)
├── integrations/
│   ├── supabase/
│   │   ├── client.ts           # Browser client (auto-generated)
│   │   ├── client.server.ts    # Service-role client (server-only)
│   │   ├── auth-middleware.ts  # requireSupabaseAuth for server fns
│   │   ├── auth-attacher.ts    # Attaches JWT to server-fn calls
│   │   └── types.ts            # Generated DB types
│   └── lovable/index.ts        # Google OAuth broker
├── components/ui/              # shadcn primitives
├── styles.css                  # Tailwind v4 + design tokens
└── start.ts                    # TanStack Start instance + middleware

supabase/
├── config.toml
└── migrations/                 # SQL migrations (table, RLS, cron, deleted_at)
```

---

## 7. Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | client | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Anonymous/publishable key |
| `SUPABASE_URL` | server | SSR fallback |
| `SUPABASE_PUBLISHABLE_KEY` | server | Server-side auth middleware |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Admin client (bypasses RLS); not used by app code today |

Service-role secrets are never bundled into client code.

---

## 8. Security Notes

- RLS is the single source of authorization. Every policy is scoped to `auth.uid()`.
- The `note-images` bucket is private; access is mediated by signed URLs.
- `purge_expired_trashed_notes()` is `SECURITY DEFINER` with execute revoked from public roles.
- No user-supplied SQL, no untrusted server endpoints — only typed Supabase queries from the client.
- Google OAuth flows through the Lovable broker to avoid exposing provider secrets.

---

## 9. Local Development

```bash
bun install
bun run dev          # starts Vite + TanStack Start dev server
```

Migrations live in `supabase/migrations/` and are applied via the Lovable Cloud pipeline.

---

## 10. Deployment

The production build targets Cloudflare Workers (edge runtime, `nodejs_compat` enabled). The Lovable platform handles build, deploy, and environment injection. Database/storage/auth are managed by Lovable Cloud (Supabase under the hood).
