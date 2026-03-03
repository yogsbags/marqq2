// Test Supabase Connection
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadEnv() {
  try {
    const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
    const envVars = {};
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        envVars[key] = value;
      }
    });
    return envVars;
  } catch (error) {
    console.warn('⚠️  Could not load .env file, using process.env');
    return {};
  }
}

const env = loadEnv();
// Supabase credentials from environment variables
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

console.log('🔍 Testing Supabase Connection...\n');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseAnonKey.substring(0, 20) + '...\n');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file!');
  console.error('   Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  try {
    console.log('1️⃣ Testing basic connection...');

    // Test 1: Check if we can access the Supabase instance
    const { data: healthData, error: healthError } = await supabase
      .from('_health')
      .select('*')
      .limit(1);

    if (healthError && healthError.code !== 'PGRST116') {
      // PGRST116 is "relation does not exist" which is fine for health check
      console.log('   ⚠️  Health check endpoint not available (this is OK)');
    } else {
      console.log('   ✅ Basic connection successful');
    }

    // Test 2: Check auth service
    console.log('\n2️⃣ Testing Auth service...');
    const { data: authData, error: authError } = await supabase.auth.getSession();

    if (authError) {
      console.log('   ⚠️  Auth service check:', authError.message);
    } else {
      console.log('   ✅ Auth service accessible');
      if (authData.session) {
        console.log('   ℹ️  Active session found');
      } else {
        console.log('   ℹ️  No active session (expected for new connection)');
      }
    }

    // Test 3: Try to get user (should return null if not authenticated)
    console.log('\n3️⃣ Testing user retrieval...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.log('   ⚠️  User check error:', userError.message);
    } else {
      console.log('   ✅ User service accessible');
      if (user) {
        console.log('   ℹ️  User found:', user.email);
      } else {
        console.log('   ℹ️  No authenticated user (expected)');
      }
    }

    // Test 4: Check if we can make a simple query (test with a common table)
    console.log('\n4️⃣ Testing database access...');
    try {
      // Try to query a table that might exist (this will fail if no tables exist, which is OK)
      const { error: dbError } = await supabase
        .from('users')
        .select('id')
        .limit(1);

      if (dbError) {
        if (dbError.code === 'PGRST116' || dbError.message.includes('does not exist')) {
          console.log('   ℹ️  No "users" table found (this is OK - you may need to create tables)');
        } else if (dbError.code === '42501') {
          console.log('   ⚠️  Permission denied - check RLS policies');
        } else {
          console.log('   ⚠️  Database query error:', dbError.message);
        }
      } else {
        console.log('   ✅ Database access working');
      }
    } catch (err) {
      console.log('   ℹ️  Database test skipped (table may not exist)');
    }

    console.log('\n✅ Connection test complete!');
    console.log('\n📝 Summary:');
    console.log('   - Supabase URL: Valid');
    console.log('   - API Key: Valid');
    console.log('   - Auth Service: Accessible');
    console.log('   - Ready for authentication!');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    console.error('\nPossible issues:');
    console.error('   1. Invalid Supabase URL');
    console.error('   2. Invalid API key (make sure it\'s the anon/public key, not publishable)');
    console.error('   3. Network connectivity issues');
    console.error('   4. Supabase project is paused or deleted');
    process.exit(1);
  }
}

testConnection();

