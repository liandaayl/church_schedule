CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tables
CREATE TABLE IF NOT EXISTS public.members (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT NOT NULL,
    gender        TEXT NOT NULL CHECK (gender IN ('L', 'P')),
    can_liturgos  BOOLEAN DEFAULT false,
    can_kolektan  BOOLEAN DEFAULT false,
    can_singer    BOOLEAN DEFAULT false,
    partner_id    UUID REFERENCES public.members(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'members' 
        AND column_name = 'partner_id'
    ) THEN
        ALTER TABLE public.members ADD COLUMN partner_id UUID REFERENCES public.members(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.schedules (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year        INTEGER NOT NULL,
    semester    INTEGER NOT NULL CHECK (semester IN (1, 2)),
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(year, semester)
);

CREATE TABLE IF NOT EXISTS public.schedule_assignments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    schedule_id   UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
    service_date  DATE NOT NULL,
    member_id     UUID NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
    role          TEXT NOT NULL CHECK (role IN ('Liturgos', 'Kolektan', 'Singer')),
    UNIQUE(schedule_id, service_date, member_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    created_at  TIMESTAMPTZ DEFAULT now()
);


DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'schedule_assignments_member_id_fkey' 
        AND table_name = 'schedule_assignments'
    ) THEN
        ALTER TABLE public.schedule_assignments DROP CONSTRAINT schedule_assignments_member_id_fkey;
        ALTER TABLE public.schedule_assignments ADD CONSTRAINT schedule_assignments_member_id_fkey 
            FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_schedule_id ON public.schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_member_id ON public.schedule_assignments(member_id);
CREATE INDEX IF NOT EXISTS idx_schedule_assignments_service_date ON public.schedule_assignments(service_date);
CREATE INDEX IF NOT EXISTS idx_schedules_year_semester ON public.schedules(year, semester);

-- Row Level Security
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$;

-- Policies: members
DROP POLICY IF EXISTS "members_select_authenticated" ON public.members;
DROP POLICY IF EXISTS "members_select_anon" ON public.members;
DROP POLICY IF EXISTS "members_insert_admin" ON public.members;
DROP POLICY IF EXISTS "members_update_admin" ON public.members;
DROP POLICY IF EXISTS "members_delete_admin" ON public.members;

CREATE POLICY "members_select_authenticated" ON public.members FOR SELECT TO authenticated USING (true);
CREATE POLICY "members_select_anon" ON public.members FOR SELECT TO anon USING (
    EXISTS (
        SELECT 1 FROM public.schedule_assignments sa
        JOIN public.schedules s ON s.id = sa.schedule_id
        WHERE sa.member_id = members.id AND s.status = 'published'
    )
);
CREATE POLICY "members_insert_admin" ON public.members FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "members_update_admin" ON public.members FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "members_delete_admin" ON public.members FOR DELETE TO authenticated USING (public.is_admin());

-- Policies: schedules
DROP POLICY IF EXISTS "schedules_select_authenticated" ON public.schedules;
DROP POLICY IF EXISTS "schedules_select_anon" ON public.schedules;
DROP POLICY IF EXISTS "schedules_insert_admin" ON public.schedules;
DROP POLICY IF EXISTS "schedules_update_admin" ON public.schedules;
DROP POLICY IF EXISTS "schedules_delete_admin" ON public.schedules;

CREATE POLICY "schedules_select_authenticated" ON public.schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "schedules_select_anon" ON public.schedules FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "schedules_insert_admin" ON public.schedules FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "schedules_update_admin" ON public.schedules FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "schedules_delete_admin" ON public.schedules FOR DELETE TO authenticated USING (public.is_admin());

-- Policies: schedule_assignments
DROP POLICY IF EXISTS "assignments_select_authenticated" ON public.schedule_assignments;
DROP POLICY IF EXISTS "assignments_select_anon" ON public.schedule_assignments;
DROP POLICY IF EXISTS "assignments_insert_admin" ON public.schedule_assignments;
DROP POLICY IF EXISTS "assignments_update_admin" ON public.schedule_assignments;
DROP POLICY IF EXISTS "assignments_delete_admin" ON public.schedule_assignments;

CREATE POLICY "assignments_select_authenticated" ON public.schedule_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignments_select_anon" ON public.schedule_assignments FOR SELECT TO anon USING (
    EXISTS (
        SELECT 1 FROM public.schedules
        WHERE schedules.id = schedule_assignments.schedule_id AND schedules.status = 'published'
    )
);
CREATE POLICY "assignments_insert_admin" ON public.schedule_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "assignments_update_admin" ON public.schedule_assignments FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "assignments_delete_admin" ON public.schedule_assignments FOR DELETE TO authenticated USING (public.is_admin());

-- Policies: profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Auto-create profile trigger on signup (first user is admin, others viewer)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_count INTEGER;
    assigned_role TEXT;
BEGIN
    SELECT COUNT(*) INTO admin_count FROM public.profiles WHERE role = 'admin';

    IF admin_count = 0 AND (
        (NEW.email_confirmed_at IS NOT NULL AND (NEW.confirmation_token IS NULL OR NEW.confirmation_token = ''))
        OR (NEW.raw_app_meta_data->>'role' = 'admin')
        OR (NEW.raw_user_meta_data->>'role' = 'admin')
    ) THEN
        assigned_role := 'admin';
    ELSE
        assigned_role := 'viewer';
    END IF;

    INSERT INTO public.profiles (id, role)
    VALUES (NEW.id, assigned_role)
    ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Public view for published schedules
CREATE OR REPLACE VIEW public.public_schedule_view AS
SELECT
    s.id            AS schedule_id,
    s.year          AS schedule_year,
    s.semester      AS schedule_semester,
    sa.service_date,
    sa.role,
    m.name          AS member_name
FROM public.schedules s
JOIN public.schedule_assignments sa ON sa.schedule_id = s.id
JOIN public.members m ON m.id = sa.member_id
WHERE s.status = 'published'
ORDER BY sa.service_date, sa.role, m.name;

GRANT SELECT ON public.public_schedule_view TO anon;
GRANT SELECT ON public.public_schedule_view TO authenticated;
