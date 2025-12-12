-- =========================================================
-- Notifications: columnas para robustez mínima
-- =========================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS attempts int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing boolean DEFAULT false;

-- Índice para buscar “vencidas” no procesando
CREATE INDEX IF NOT EXISTS idx_notif_due_sched
ON public.notifications (scheduled_for)
WHERE status = 'scheduled'
  AND channel = 'whatsapp'
  AND (processing IS FALSE OR processing IS NULL);

-- =========================================================
-- RPC: claim_notifications(p_limit int)
--  - Selecciona notificaciones vencidas y no en procesamiento
--  - Hace claim atómico con FOR UPDATE SKIP LOCKED
--  - Marca processing=true dentro de una transacción
--  - Devuelve las filas ya reclamadas
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_notifications(p_limit int DEFAULT 20)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.notifications
    WHERE channel = 'whatsapp'
      AND status  = 'scheduled'
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND scheduled_for <= now()
      AND COALESCE(processing,false) = false
    ORDER BY scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notifications n
     SET processing = true,
         updated_at = now()
    FROM candidates c
   WHERE n.id = c.id
  RETURNING n.*;
END;
$$;

-- Permisos: que sólo el service_role lo ejecute (tu backend worker)
REVOKE ALL ON FUNCTION public.claim_notifications(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notifications(int) TO service_role;
