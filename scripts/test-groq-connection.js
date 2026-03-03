// Test Groq API Connection
import { createClient } from '@supabase/supabase-js';

// Test Groq API directly
const GROQ_API_KEY = 'gsk_REDACTED_USE_VITE_GROQ_API_KEY';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function testGroqConnection() {
  console.log('🤖 Testing Groq AI Chat Connection...\n');
  console.log('API Key:', GROQ_API_KEY.substring(0, 20) + '...\n');

  try {
    console.log('1️⃣ Sending test message to Groq...');

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant for Torqq AI, a marketing intelligence platform.'
          },
          {
            role: 'user',
            content: 'Hello! Can you hear me?'
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_completion_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('   ❌ API Error:', response.status, response.statusText);
      console.log('   Error details:', errorText);

      if (response.status === 401) {
        console.log('   ⚠️  Authentication failed - API key may be invalid or expired');
      } else if (response.status === 429) {
        console.log('   ⚠️  Rate limit exceeded - too many requests');
      }
      return;
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content;

    if (aiResponse) {
      console.log('   ✅ Groq API Connection Successful!');
      console.log('   🤖 AI Response:', aiResponse);
      console.log('\n📝 Summary:');
      console.log('   - Groq API: ✅ Working');
      console.log('   - Model: llama-3.3-70b-versatile');
      console.log('   - Chat functionality: ✅ Ready');
      console.log('\n⚠️  SECURITY WARNING:');
      console.log('   - API key is currently hardcoded in frontend');
      console.log('   - This is a security risk - key is exposed to users');
      console.log('   - Recommendation: Move to environment variables');
    } else {
      console.log('   ⚠️  No response content received');
    }

  } catch (error) {
    console.error('\n❌ Connection test failed:', error.message);
    console.error('\nPossible issues:');
    console.error('   1. Invalid API key');
    console.error('   2. Network connectivity issues');
    console.error('   3. Groq API service unavailable');
  }
}

testGroqConnection();

