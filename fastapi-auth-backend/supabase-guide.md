#### Project Organization
```
fastapi-auth-backend/
├─ .env
├─ main.py                              # se actualiza para incluir routers nuevos
├─ requirements.txt                     # se añaden dependencias (lista abajo)
└─ app/
   ├─ __init__.py
   ├─ api/
   │  ├─ auth/
   │  │  ├─ __init__.py
   │  │  └─ auth_service.py
   │  ├─ models/
   │  │  ├─ __init__.py
   │  │  └─ user.py
   │  ├─ security/
   │  │  ├─ __init__.py
   │  │  └─ anomaly_agent.py
   │  └─ routes/                        # ⬅ NUEVO (endpoints Routine Manager)
   │     ├─ __init__.py
   │     ├─ dashboard.py
   │     ├─ tasks.py
   │     ├─ planner.py
   │     ├─ settings.py
   │     ├─ chat.py
   │     └─ notifications.py
   ├─ core/                              # ⬅ NUEVO (infra común)
   │  ├─ __init__.py
   │  ├─ supabase_client.py
   │  ├─ openai_client.py
   │  └─ auth.py                         # validador de JWT Supabase (y atajo dev opcional)
   └─ schemas/                           # ⬅ NUEVO (Pydantic)
      ├─ __init__.py
      ├─ tasks.py
      ├─ chat.py
      └─ settings.py

```

#### Supabase SQL Editor
```
-- =========================================
-- Routine Manager + Authenticator (portable)
-- =========================================

-- 1) Extensiones + utilidades
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- para gen_random_uuid()
-- (uuid-ossp no es necesaria si usas gen_random_uuid())

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 2) Tipos ENUM (portable)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_tag') THEN
    CREATE TYPE task_tag AS ENUM ('Education','Workout','Home','Job','Other');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('pending','in_progress','done','canceled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_channel') THEN
    CREATE TYPE notif_channel AS ENUM ('sms','email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notif_status') THEN
    CREATE TYPE notif_status AS ENUM ('scheduled','sent','failed');
  END IF;
END
$$;

-- 3) AUTENTICADOR
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  notify_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('login_success','login_failed','logout')),
  ip inet,
  user_agent TEXT,
  location JSONB,
  risk_score NUMERIC(5,2),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_time ON public.login_history (user_id, created_at DESC);

ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='profiles_self_all') THEN
    CREATE POLICY "profiles_self_all" ON public.profiles
      FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_history' AND policyname='login_self_ins') THEN
    CREATE POLICY "login_self_ins" ON public.login_history
      FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_history' AND policyname='login_self_sel') THEN
    CREATE POLICY "login_self_sel" ON public.login_history
      FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_history' AND policyname='login_self_upd') THEN
    CREATE POLICY "login_self_upd" ON public.login_history
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_history' AND policyname='login_self_del') THEN
    CREATE POLICY "login_self_del" ON public.login_history
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END
$$;

-- 4) ROUTINE MANAGER
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  tag task_tag DEFAULT 'Other',
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ,
  status task_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_tasks_updated ON public.tasks;
CREATE TRIGGER trg_tasks_updated
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tasks_user_start ON public.tasks (user_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_tasks_user_tag   ON public.tasks (user_id, tag);

CREATE TABLE IF NOT EXISTS public.task_recurrence (
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  freq TEXT NOT NULL CHECK (freq IN ('DAILY','WEEKLY','MONTHLY')),
  interval INT NOT NULL DEFAULT 1,
  byweekday INT[] NULL,  -- 0=Mon..6=Sun
  until DATE NULL
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system','user','assistant','tool')),
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NULL REFERENCES public.tasks(id) ON DELETE SET NULL,
  channel notif_channel NOT NULL DEFAULT 'sms',
  scheduled_for TIMESTAMPTZ NOT NULL,
  status notif_status DEFAULT 'scheduled',
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_notifications_updated ON public.notifications;
CREATE TRIGGER trg_notifications_updated
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_recurrence  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tasks' AND policyname='tasks_self_all') THEN
    CREATE POLICY "tasks_self_all" ON public.tasks
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_recurrence' AND policyname='recur_self_all') THEN
    CREATE POLICY "recur_self_all" ON public.task_recurrence
      FOR ALL
      USING (task_id IN (SELECT id FROM public.tasks WHERE user_id = auth.uid()))
      WITH CHECK (task_id IN (SELECT id FROM public.tasks WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='chat_messages' AND policyname='chat_self_all') THEN
    CREATE POLICY "chat_self_all" ON public.chat_messages
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notif_self_all') THEN
    CREATE POLICY "notif_self_all" ON public.notifications
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;

-- =========================================
-- FIN
-- =========================================
```
#### Complements Tables & RLS

```
-- =========================================
-- Routine Manager — Add-ons (safe/idempotent)
-- Requiere: public.set_updated_at() ya creada
-- =========================================

-- 1) Extensiones (por si acaso)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- 2) ENUM prioridad (no toca tu task_status)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('low','medium','high','urgent');
  END IF;
END
$$;

-- 3) Ampliar tabla EXISTENTE public.tasks (sin romper datos)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority    task_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS position    double precision,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- Índices útiles extra
CREATE INDEX IF NOT EXISTS idx_tasks_user_status   ON public.tasks (user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_endts    ON public.tasks (user_id, end_ts);
CREATE INDEX IF NOT EXISTS idx_tasks_user_position ON public.tasks (user_id, position);

-- 4) Full-Text Search en tasks (title + description)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tsv tsvector;
CREATE INDEX IF NOT EXISTS idx_tasks_tsv ON public.tasks USING GIN (tsv);

CREATE OR REPLACE FUNCTION public.tasks_tsv_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.tsv := to_tsvector('simple',
              coalesce(NEW.title,'') || ' ' || coalesce(NEW.description,''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_tsv ON public.tasks;
CREATE TRIGGER trg_tasks_tsv
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_tsv_trigger();

-- Inicializar tsv en filas existentes (inocuo)
UPDATE public.tasks SET title = title;

-- 5) Vista API: due_at como alias de end_ts (solo lectura)
CREATE OR REPLACE VIEW public.tasks_api AS
SELECT
  id, user_id, title, description, tag, status, priority,
  start_ts,
  end_ts AS due_at,
  position, created_at, updated_at, completed_at, deleted_at
FROM public.tasks
WHERE deleted_at IS NULL;

-- =========================================
-- 6) Etiquetas múltiples (tags y relación M:N)
-- =========================================

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

DROP TRIGGER IF EXISTS trg_tags_updated ON public.tags;
CREATE TRIGGER trg_tags_updated
BEFORE UPDATE ON public.tags
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.task_tags (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id  uuid NOT NULL REFERENCES public.tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_task_tags_task ON public.task_tags (task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag  ON public.task_tags (tag_id);

-- RLS
ALTER TABLE public.tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='tags' AND policyname='tags_self_all'
  ) THEN
    CREATE POLICY "tags_self_all" ON public.tags
      FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  -- En task_tags garantizamos que solo relacione recursos del mismo usuario
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='task_tags' AND policyname='task_tags_self_all'
  ) THEN
    CREATE POLICY "task_tags_self_all" ON public.task_tags
      FOR ALL
      USING (
        (SELECT user_id FROM public.tasks t WHERE t.id = task_id) = auth.uid()
        AND
        (SELECT user_id FROM public.tags  g WHERE g.id = tag_id)  = auth.uid()
      )
      WITH CHECK (
        (SELECT user_id FROM public.tasks t WHERE t.id = task_id) = auth.uid()
        AND
        (SELECT user_id FROM public.tags  g WHERE g.id = tag_id)  = auth.uid()
      );
  END IF;
END
$$;

-- =========================================
-- 7) Subtareas (checklist)
-- =========================================

CREATE TABLE IF NOT EXISTS public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_subtasks_updated ON public.subtasks;
CREATE TRIGGER trg_subtasks_updated
BEFORE UPDATE ON public.subtasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_subtasks_task ON public.subtasks (task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_user ON public.subtasks (user_id);

-- RLS
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='subtasks' AND policyname='subtasks_self_all'
  ) THEN
    CREATE POLICY "subtasks_self_all" ON public.subtasks
      FOR ALL
      USING (
        user_id = auth.uid()
        AND (SELECT user_id FROM public.tasks t WHERE t.id = task_id) = auth.uid()
      )
      WITH CHECK (
        user_id = auth.uid()
        AND (SELECT user_id FROM public.tasks t WHERE t.id = task_id) = auth.uid()
      );
  END IF;
END
$$;

-- =========================================
-- 8) Recordatorios (reminders)
-- =========================================

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  remind_at timestamptz NOT NULL,       -- primer disparo
  channel text NOT NULL DEFAULT 'email', -- 'email' | 'push' | 'webhook' (define en app)
  payload jsonb,
  next_fire_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_reminders_updated ON public.reminders;
CREATE TRIGGER trg_reminders_updated
BEFORE UPDATE ON public.reminders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_reminders_due  ON public.reminders (active, next_fire_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders (user_id);

-- RLS
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reminders' AND policyname='reminders_self_all'
  ) THEN
    CREATE POLICY "reminders_self_all" ON public.reminders
      FOR ALL
      USING (
        user_id = auth.uid()
        AND (SELECT user_id FROM public.tasks t WHERE t.id = task_id) = auth.uid()
      )
      WITH CHECK (
        user_id = auth.uid()
        AND (SELECT user_id FROM public.tasks t WHERE t.id = task_id) = auth.uid()
      );
  END IF;
END
$$;

-- =========================================
-- FIN (add-ons)
-- =========================================

```


#### Consultar Tables & RLS
```
-- ⚙️ Tabla a inspeccionar
CREATE TEMP TABLE _vars(schema_name text, table_name text);
INSERT INTO _vars VALUES ('public','tasks'); -- ← cambia 'tasks'

SELECT section, data
FROM (
  -- columns
  SELECT 'columns' AS section,
         (
           SELECT jsonb_agg(jsonb_build_object(
             'ordinal', c.ordinal_position,
             'name', c.column_name,
             'type', c.data_type,
             'nullable', c.is_nullable,
             'default', c.column_default
           ) ORDER BY c.ordinal_position)
           FROM information_schema.columns c
           JOIN _vars v ON v.schema_name = c.table_schema AND v.table_name = c.table_name
         ) AS data

  UNION ALL
  -- constraints (PK/UNIQUE)
  SELECT 'constraints',
         (
           SELECT jsonb_agg(jsonb_build_object(
             'name', tc.constraint_name,
             'type', tc.constraint_type,
             'column', kcu.column_name,
             'position', kcu.ordinal_position
           ) ORDER BY tc.constraint_type, tc.constraint_name, kcu.ordinal_position)
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           JOIN _vars v ON v.schema_name = tc.table_schema AND v.table_name = tc.table_name
           WHERE tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
         )

  UNION ALL
  -- indexes
  SELECT 'indexes',
         (
           SELECT jsonb_agg(jsonb_build_object(
             'name', i.relname,
             'definition', pg_get_indexdef(ix.indexrelid)
           ) ORDER BY i.relname)
           FROM pg_index ix
           JOIN pg_class t ON t.oid = ix.indrelid
           JOIN pg_class i ON i.oid = ix.indexrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           JOIN _vars v ON v.schema_name = n.nspname AND v.table_name = t.relname
         )

  UNION ALL
  -- foreign_keys_out (esta → otras)
  SELECT 'foreign_keys_out',
         (
           SELECT jsonb_agg(jsonb_build_object(
             'child_column', kcu.column_name,
             'parent_table', ccu.table_name,
             'parent_column', ccu.column_name,
             'on_update', rc.update_rule,
             'on_delete', rc.delete_rule
           ) ORDER BY kcu.column_name)
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           JOIN information_schema.referential_constraints rc
             ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
           JOIN information_schema.constraint_column_usage ccu
             ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.constraint_schema
           JOIN _vars v ON v.schema_name = tc.table_schema AND v.table_name = tc.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
         )

  UNION ALL
  -- foreign_keys_in (otras → esta)
  SELECT 'foreign_keys_in',
         (
           SELECT jsonb_agg(jsonb_build_object(
             'child_table', tc.table_name,
             'child_column', kcu.column_name,
             'on_update', rc.update_rule,
             'on_delete', rc.delete_rule
           ) ORDER BY tc.table_name, kcu.column_name)
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           JOIN information_schema.referential_constraints rc
             ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
           JOIN information_schema.constraint_column_usage ccu
             ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.constraint_schema
           JOIN _vars v ON v.schema_name = ccu.table_schema AND v.table_name = ccu.table_name
           WHERE tc.constraint_type = 'FOREIGN KEY'
         )

  UNION ALL
  -- triggers
  SELECT 'triggers',
         (
           SELECT jsonb_agg(jsonb_build_object(
             'name', t.trigger_name,
             'timing', t.action_timing,
             'event', t.event_manipulation,
             'statement', t.action_statement
           ) ORDER BY t.trigger_name)
           FROM information_schema.triggers t
           JOIN _vars v ON v.schema_name = t.trigger_schema AND v.table_name = t.event_object_table
         )

  UNION ALL
  -- rls_state
  SELECT 'rls_state',
         (
           SELECT jsonb_build_object(
             'enabled', c.relrowsecurity,
             'forced',  c.relforcerowsecurity
           )
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN _vars v ON v.schema_name = n.nspname AND v.table_name = c.relname
           WHERE c.relkind='r'
         )

  UNION ALL
  -- rls_policies
  SELECT 'rls_policies',
         (
           SELECT jsonb_agg(jsonb_build_object(
             'policy', pol.polname,
             'command', pol.polcmd,
             'using', pg_get_expr(pol.polqual, pol.polrelid),
             'check', pg_get_expr(pol.polwithcheck, pol.polrelid),
             'roles', ARRAY(SELECT rolname FROM pg_roles r WHERE r.oid = ANY(pol.polroles))
           ) ORDER BY pol.polname)
           FROM pg_policy pol
           JOIN pg_class c ON c.oid = pol.polrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN _vars v ON v.schema_name = n.nspname AND v.table_name = c.relname
         )

  UNION ALL
  -- size
  SELECT 'size',
         (
           SELECT jsonb_build_object(
             'total',  pg_size_pretty(pg_total_relation_size(st.relid)),
             'table',  pg_size_pretty(pg_relation_size(st.relid)),
             'indexes',pg_size_pretty(pg_total_relation_size(st.relid) - pg_relation_size(st.relid))
           )
           FROM pg_statio_all_tables st
           JOIN _vars v ON v.schema_name = st.schemaname AND v.table_name = st.relname
         )

  UNION ALL
  -- approx_rows
  SELECT 'approx_rows',
         (
           SELECT to_jsonb(c.reltuples::bigint)
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN _vars v ON v.schema_name = n.nspname AND v.table_name = c.relname
           WHERE c.relkind='r'
         )
) s
WHERE data IS NOT NULL;

```