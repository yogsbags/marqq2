#!/usr/bin/env node
/**
 * Check status of webinar video segments
 */

const { getHeyGenWebinarClient } = require('../integrations/heygen-webinar-client');

// Video IDs from the webinar we just created
const videoIds = [
  'acc259efb70d4012ba826f6eb0d1deb7', // Introduction
  '70b0cf275be6479a8982c67c5cf625fb', // Main Content
  '19b64973284549c48f76712f2d5974bd'  // Conclusion
];

const segmentNames = ['Introduction', 'Main Content', 'Conclusion'];

async function checkStatus() {
  console.log('🔍 Checking webinar video status...\n');

  if (!process.env.HEYGEN_API_KEY) {
    console.error('❌ HEYGEN_API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    const client = getHeyGenWebinarClient();
    const statuses = await client.getWebinarStatus(videoIds);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('VIDEO STATUS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    let allComplete = true;
    statuses.forEach((status, index) => {
      const icon = status.status === 'completed' ? '✅' : status.status === 'failed' ? '❌' : '⏳';
      console.log(`${icon} ${segmentNames[index]}`);
      console.log(`   Video ID: ${status.video_id}`);
      console.log(`   Status: ${status.status}`);
      if (status.video_url) {
        console.log(`   Video URL: ${status.video_url}`);
      } else {
        console.log(`   Video URL: Not ready yet`);
        allComplete = false;
      }
      console.log('');
    });

    if (allComplete) {
      console.log('✅ All videos are ready! You can now download and combine them.\n');
    } else {
      console.log('⏳ Some videos are still generating. Check again in a few minutes.\n');
    }

  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    process.exit(1);
  }
}

checkStatus();

