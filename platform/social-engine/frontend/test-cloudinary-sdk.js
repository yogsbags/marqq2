const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dscxiwsqm',
  api_key: '854143146488244',
  api_secret: 'lw1u0N6rOQY3tHBQaFAHp_0vktM'
});

async function testCloudinarySDK() {
  const videoPath = '/tmp/veo-text-1764752339612.mp4';

  if (!fs.existsSync(videoPath)) {
    console.error('❌ Video file not found:', videoPath);
    return;
  }

  console.log('🧪 Testing Cloudinary SDK Upload');
  console.log('━'.repeat(50));
  console.log(`📁 Video: ${videoPath}`);
  console.log(`📊 Size: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(2)} MB`);
  console.log('');

  try {
    console.log('📤 Uploading with official Cloudinary SDK...');

    const result = await cloudinary.uploader.upload(videoPath, {
      resource_type: 'video',
      folder: 'social-media'
    });

    console.log('✅ Upload successful!');
    console.log(`   URL: ${result.secure_url}`);
    console.log(`   Public ID: ${result.public_id}`);
    console.log(`   Format: ${result.format}`);
    console.log(`   Duration: ${result.duration}s`);
    console.log(`   Size: ${(result.bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    console.log('🎉 Cloudinary SDK upload test PASSED!');

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    if (error.http_code) {
      console.error(`   HTTP Code: ${error.http_code}`);
    }
  }
}

testCloudinarySDK();
