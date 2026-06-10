
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS notes_deleted_at_idx ON public.notes (deleted_at);

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.purge_expired_trashed_notes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.notes
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-trashed-notes') THEN
    PERFORM cron.unschedule('purge-expired-trashed-notes');
  END IF;
  PERFORM cron.schedule(
    'purge-expired-trashed-notes',
    '0 3 * * *',
    $cron$ SELECT public.purge_expired_trashed_notes(); $cron$
  );
END $$;
