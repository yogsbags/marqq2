-- Torqq AI: Postgres Queue Schema for Artifact Generation
-- Run this in your Supabase SQL Editor to enable async processing without Redis.

-- 1. Create the generation_jobs table
CREATE TABLE IF NOT EXISTS public.generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    inputs JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    UNIQUE(company_id, artifact_type) -- Ensures only one pending/processing job per type per company
);

-- 2. Enable RLS
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all operations for anon and authenticated users on generation_jobs" ON public.generation_jobs FOR ALL USING (true) WITH CHECK (true);

-- 3. Add Trigger for updated_at
CREATE TRIGGER update_generation_jobs_updated_at
BEFORE UPDATE ON public.generation_jobs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 4. Create RPC Function for Atomic Locking (This is the Postgres "Queue" magic)
-- This function finds the oldest pending job, locks it (so no other worker grabs it),
-- marks it as processing, and returns the data.
CREATE OR REPLACE FUNCTION take_next_job()
RETURNS TABLE (
    id UUID,
    company_id UUID,
    artifact_type TEXT,
    inputs JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.generation_jobs
    SET status = 'processing',
        started_at = NOW(),
        updated_at = NOW()
    WHERE public.generation_jobs.id = (
        SELECT j.id
        FROM public.generation_jobs j
        WHERE j.status = 'pending'
        ORDER BY j.created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING public.generation_jobs.id, public.generation_jobs.company_id, public.generation_jobs.artifact_type, public.generation_jobs.inputs;
END;
$$;
