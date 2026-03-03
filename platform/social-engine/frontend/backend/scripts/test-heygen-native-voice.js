const fs = require('fs');
const path = require('path');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;

async function testWithNativeVoice() {
  console.log('='.repeat(60));
  console.log('Testing Talking Photo with HeyGen Native Voice');
  console.log('='.repeat(60));

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
        input_text: 'Hello, I am Raj. This is a test of the HeyGen photo avatar video generation.',
        voice_id: 'c8d184ef4d81484a97d70c94bb76fec3'  // HeyGen native voice
      }
    }]
  };

  console.log('\nPayload:', JSON.stringify(payload, null, 2));

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
      
      // Check status periodically
      await checkStatus(data.data.video_id);
    }
  } catch (e) {
    console.log('Response (not JSON):', text.substring(0, 500));
  }
}

async function checkStatus(videoId) {
  console.log('\n' + '='.repeat(60));
  console.log('Checking Video Status');
  console.log('='.repeat(60));
  
  for (let i = 0; i < 12; i++) {
    console.log(`\n[Check ${i+1}/12] Waiting 10 seconds...`);
    await new Promise(r => setTimeout(r, 10000));
    
    const response = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY }
    });
    
    const data = await response.json();
    const status = data.data?.status;
    const progress = data.data?.progress || 0;
    
    console.log(`Status: ${status} | Progress: ${progress}%`);
    
    if (status === 'completed') {
      console.log('\n' + '='.repeat(60));
      console.log('✅ VIDEO GENERATION COMPLETED!');
      console.log('='.repeat(60));
      console.log('\nVideo URL:', data.data.video_url);
      console.log('Thumbnail:', data.data.thumbnail_url || 'N/A');
      console.log('Duration:', data.data.duration || 'N/A', 'seconds');
      
      // Save result
      const resultPath = path.join(__dirname, '../test-results/talking-photo-test.json');
      fs.mkdirSync(path.dirname(resultPath), { recursive: true });
      fs.writeFileSync(resultPath, JSON.stringify(data.data, null, 2));
      console.log('\n📄 Result saved to:', resultPath);
      return;
    } else if (status === 'failed') {
      console.log('\n❌ Video generation failed!');
      console.log('Error:', JSON.stringify(data.data, null, 2));
      return;
    }
  }
  
  console.log('\n⏱️ Still processing after 2 minutes. Check later:');
  console.log('Video ID:', videoId);
  console.log('Dashboard:', `https://app.heygen.com/video/${videoId}`);
}

testWithNativeVoice().catch(console.error);
