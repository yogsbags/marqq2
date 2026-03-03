-- Torqq AI: Company Intelligence Flow Schema
-- Run this in your Supabase SQL Editor to create the required tables for company intelligence and artifact generation.

-- Enable the uuid-ossp extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    website_url TEXT,
    profile JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create company_artifacts table
CREATE TABLE IF NOT EXISTS public.company_artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, artifact_type) -- Ensures only one artifact per type per company
);

-- 3. Setup Row Level Security (RLS) policies
-- For a multi-tenant B2B app, you should add a user_id or tenant_id to the companies table.
-- For now, we allow authenticated access or anonymous if it's an internal tool.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_artifacts ENABLE ROW LEVEL SECURITY;

-- Allow all temporary authenticated/anon operations for MVP
CREATE POLICY "Enable all operations for anon and authenticated users on companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all operations for anon and authenticated users on company_artifacts" ON public.company_artifacts FOR ALL USING (true) WITH CHECK (true);

-- 4. Create trigger to automatically update `updated_at` column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_company_artifacts_updated_at
BEFORE UPDATE ON public.company_artifacts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
