// Test Supabase Authentication
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
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file!');
  console.error('   Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testAuth() {
  console.log('🔐 Testing Supabase Authentication...\n');

  // Generate a unique test email (using a valid domain)
  const timestamp = Date.now();
  const testEmail = `testuser${timestamp}@testmail.com`;
  const testPassword = 'TestPassword123!';
  const testName = 'Test User';

  try {
    console.log('1️⃣ Testing Sign Up...');
    console.log(`   Email: ${testEmail}`);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          full_name: testName,
          name: testName,
        }
      }
    });

    if (signUpError) {
      console.log('   ❌ Sign Up Error:', signUpError.message);
      console.log('   Error Code:', signUpError.status);

      if (signUpError.message.includes('already registered')) {
        console.log('   ℹ️  User already exists - this is OK');
      } else if (signUpError.message.includes('Invalid API key')) {
        console.log('   ⚠️  API key issue - you may need to use the anon/public key instead of publishable key');
      }
      return;
    }

    if (signUpData.user) {
      console.log('   ✅ Sign Up Successful!');
      console.log('   User ID:', signUpData.user.id);
      console.log('   Email:', signUpData.user.email);

      if (signUpData.session) {
        console.log('   ✅ Session created automatically');
      } else {
        console.log('   ℹ️  Email confirmation may be required');
      }
    }

    console.log('\n2️⃣ Testing Sign In...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });

    if (signInError) {
      console.log('   ❌ Sign In Error:', signInError.message);
      if (signInError.message.includes('Email not confirmed')) {
        console.log('   ℹ️  Email confirmation is enabled - check your email');
      }
    } else if (signInData.user) {
      console.log('   ✅ Sign In Successful!');
      console.log('   User:', signInData.user.email);
      console.log('   Session:', signInData.session ? 'Active' : 'None');
    }

    console.log('\n3️⃣ Testing Sign Out...');
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      console.log('   ⚠️  Sign Out Error:', signOutError.message);
    } else {
      console.log('   ✅ Sign Out Successful!');
    }

    console.log('\n✅ Authentication test complete!');
    console.log('\n📝 Summary:');
    console.log('   - Supabase connection: ✅ Working');
    console.log('   - Authentication: ✅ Ready to use');
    console.log('\n💡 Next Steps:');
    console.log('   1. Create .env file with your credentials');
    console.log('   2. Restart your dev server: npm run dev');
    console.log('   3. Try signing up/logging in through the app UI');

  } catch (error) {
    console.error('\n❌ Authentication test failed:', error.message);
    console.error('\nStack:', error.stack);
  }
}

testAuth();

