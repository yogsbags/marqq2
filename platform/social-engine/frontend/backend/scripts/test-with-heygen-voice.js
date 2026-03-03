/**
 * Test with HeyGen's built-in voices first
 */

const fs = require('fs');
const path = require('path');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

const testScript = "Hello, I am Raj. This is a test of the HeyGen photo avatar video generation.";

console.log('Testing with HeyGen built-in voice...\n');

async function testWithHeyGenVoice() {
  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  const payload = {
    test: true,
    video_inputs: [{
      character: {
        type: 'talking_photo',
        talking_photo_id: '6f268f0fa28a41ce8b1fe4e83ac3867b'
      },
      voice: {
        type: 'text',
        input_text: testScript
      }
    }]
  };

  console.log('Payload:', JSON.stringify(payload, null, 2));

  const response = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'X-Api-Key': HEYGEN_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  console.log('\nStatus:', response.status);
  
  try {
    const data = JSON.parse(text);
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.data && data.data.video_id) {
      console.log('\n✅ Video generation started!');
      console.log('Video ID:', data.data.video_id);
      await checkStatus(data.data.video_id);
    }
  } catch (e) {
    console.log('Response:', text);
  }
}

async function checkStatus(videoId) {
  console.log('\nChecking status...');
  
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 10000));
    
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY }
    });
    
    const data = await response.json();
    console.log(`\n[${i+1}/5] Status: ${data.data?.status} | Progress: ${data.data?.progress || 0}%`);
    
    if (data.data?.status === 'completed') {
      console.log('\n✅ COMPLETED!');
      console.log('Video URL:', data.data.video_url);
      return;
    } else if (data.data?.status === 'failed') {
      console.log('\n❌ FAILED:', data.data.error);
      return;
    }
  }
  
  console.log('\n⏱️ Still processing. Video ID:', videoId);
}

testWithHeyGenVoice().catch(console.error);
