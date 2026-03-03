import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Try to load .env manually if process.env misses it (e.g. not running via Vite)
if (!process.env.VITE_SUPABASE_URL) {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const envPath = path.join(__dirname, '..', '..', '.env')
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8')
      envFile.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/)
        if (match) {
          const key = match[1].trim()
          const value = match[2].trim().replace(/^["']|["']$/g, '')
          if (!process.env[key]) process.env[key] = value
        }
      })
    }
  } catch (e) {
    // ignore
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

if (!supabase) {
  console.warn('⚠️  Supabase omitted from backend-server: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Falling back to in-memory state.')
}

function normalizeWebsiteUrl(url) {
  if (!url) return null
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    parsed.hash = ''
    parsed.search = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return String(url).trim().replace(/\/$/, '')
  }
}

/**
 * Ensures a company exists in Supabase.
 */
export async function saveCompany(company) {
  if (!supabase) return company
  try {
    const { data, error } = await supabase
      .from('companies')
      .upsert({
        id: company.id,
        company_name: company.companyName,
        website_url: company.websiteUrl,
        profile: company.profile || {}
      }, { onConflict: 'id' })
      .select()
      .single()

    if (error) {
      if (error.code === '42P01') console.warn('Supabase: "companies" table does not exist yet.')
      else console.error('Supabase Save Company Error:', error)
    }
  } catch (err) { }
  return company
}

/**
 * Ensures an artifact is saved in Supabase.
 */
export async function saveArtifact(companyId, artifact) {
  if (!supabase) return artifact
  try {
    const { data, error } = await supabase
      .from('company_artifacts')
      .upsert({
        company_id: companyId,
        artifact_type: artifact.type,
        data: artifact.data
      }, { onConflict: 'company_id,artifact_type' })

    if (error) {
      console.error('Supabase Save Artifact Error:', error)
    }
  } catch (err) { }
  return artifact
}

export async function clearArtifactsForCompany(companyId) {
  if (!supabase || !companyId) return
  try {
    const { error } = await supabase
      .from('company_artifacts')
      .delete()
      .eq('company_id', companyId)

    if (error) {
      console.error('Supabase Clear Artifacts Error:', error)
    }
  } catch {
    // ignore cleanup failures
  }
}

/**
 * Fetch company and artifacts from Supabase (or null if fail)
 */
export async function loadCompanyWithArtifacts(companyId) {
  if (!supabase) return null
  try {
    const { data: companyRow, error: cErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (cErr || !companyRow) return null

    const { data: artifactRows, error: aErr } = await supabase
      .from('company_artifacts')
      .select('*')
      .eq('company_id', companyId)

    const artifacts = {}
    if (!aErr && artifactRows) {
      for (const row of artifactRows) {
        artifacts[row.artifact_type] = {
          type: row.artifact_type,
          data: row.data,
          updatedAt: row.updated_at
        }
      }
    }

    return {
      company: {
        id: companyRow.id,
        companyName: companyRow.company_name,
        websiteUrl: companyRow.website_url,
        profile: companyRow.profile,
        createdAt: companyRow.created_at,
        updatedAt: companyRow.updated_at
      },
      artifacts
    }
  } catch (err) {
    return null
  }
}

export async function loadCompanies() {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error || !data) return []

    const mapped = data.map((row) => ({
      id: row.id,
      companyName: row.company_name,
      websiteUrl: row.website_url,
      profile: row.profile,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    const seen = new Set()
    return mapped.filter((company) => {
      const key = normalizeWebsiteUrl(company.websiteUrl) || `id:${company.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch {
    return []
  }
}

export async function loadCompanyByWebsiteUrl(websiteUrl) {
  if (!supabase || !websiteUrl) return null
  try {
    const normalizedTarget = normalizeWebsiteUrl(websiteUrl)
    const companies = await loadCompanies()
    return companies.find((company) => normalizeWebsiteUrl(company.websiteUrl) === normalizedTarget) || null
  } catch {
    return null
  }
}

export async function deleteDuplicateCompaniesByWebsiteUrl(websiteUrl, keepCompanyId) {
  if (!supabase || !websiteUrl || !keepCompanyId) return
  try {
    const normalizedTarget = normalizeWebsiteUrl(websiteUrl)
    const { data, error } = await supabase
      .from('companies')
      .select('id, website_url')
      .eq('website_url', normalizedTarget)

    if (error || !data?.length) return

    const duplicateIds = data
      .filter((row) => row.id !== keepCompanyId && normalizeWebsiteUrl(row.website_url) === normalizedTarget)
      .map((row) => row.id)

    if (!duplicateIds.length) return

    const { error: deleteError } = await supabase
      .from('companies')
      .delete()
      .in('id', duplicateIds)

    if (deleteError) {
      console.error('Supabase Delete Duplicate Companies Error:', deleteError)
    }
  } catch {
    // ignore cleanup failures
  }
}

export async function deletePlaceholderCompanies() {
  if (!supabase) return
  try {
    const placeholderUrls = ['https://example.com', 'http://example.com']
    const placeholderNames = ['Example Domain']

    const [{ data: byUrl }, { data: byName }] = await Promise.all([
      supabase
        .from('companies')
        .select('id')
        .in('website_url', placeholderUrls),
      supabase
        .from('companies')
        .select('id')
        .in('company_name', placeholderNames)
    ])

    const ids = Array.from(new Set([...(byUrl || []), ...(byName || [])].map((row) => row.id).filter(Boolean)))
    if (!ids.length) return

    const { error } = await supabase
      .from('companies')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('Supabase Delete Placeholder Companies Error:', error)
    }
  } catch {
    // ignore cleanup failures
  }
}
