const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

async function testCloudinaryUpload() {
  // Use the most recent video
  const videoPath = '/tmp/veo-text-1764752339612.mp4';

  if (!fs.existsSync(videoPath)) {
    console.error('❌ Video file not found:', videoPath);
    return;
  }

  // Parse Cloudinary URL
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (!cloudinaryUrl) {
    console.error('❌ CLOUDINARY_URL not set');
    return;
  }

  console.log('🧪 Testing Cloudinary Upload');
  console.log('━'.repeat(50));

  try {
    // Parse credentials
    const urlMatch = cloudinaryUrl.match(/cloudinary:\/\/(\d+):([^@]+)@(.+)/);
    if (!urlMatch) {
      console.error('❌ Invalid CLOUDINARY_URL format');
      return;
    }

    const [, apiKey, apiSecret, cloudName] = urlMatch;

    console.log(`📁 Video: ${path.basename(videoPath)}`);
    console.log(`📊 Size: ${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`☁️  Cloud: ${cloudName}`);
    console.log(`🔑 API Key: ${apiKey.substring(0, 10)}...`);
    console.log('');

    // Generate timestamp and signature
    const timestamp = Math.floor(Date.now() / 1000);

    const paramsToSign = {
      timestamp: timestamp.toString()
    };

    const sortedParams = Object.keys(paramsToSign)
      .sort()
      .map(key => `${key}=${paramsToSign[key]}`)
      .join('&');
    const signatureString = `${sortedParams}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureString).digest('hex');

    console.log('🔐 Signature Generation:');
    console.log(`   Params to sign: ${JSON.stringify(paramsToSign)}`);
    console.log(`   Sorted params: ${sortedParams}`);
    console.log(`   Signature string: ${sortedParams}[API_SECRET]`);
    console.log(`   SHA-1 signature: ${signature.substring(0, 30)}...`);
    console.log('');

    // Create form data
    const FormData = (await import('form-data')).default;
    const formData = new FormData();

    // Add file as stream
    formData.append('file', fs.createReadStream(videoPath), {
      filename: path.basename(videoPath),
      contentType: 'video/mp4'
    });
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`;

    console.log('📤 Uploading to Cloudinary...');
    console.log(`   URL: ${uploadUrl}`);
    console.log(`   Method: POST`);
    console.log(`   Headers:`, formData.getHeaders());
    console.log('   Form fields:');
    console.log(`      - file: [stream]`);
    console.log(`      - api_key: ${apiKey}`);
    console.log(`      - timestamp: ${timestamp}`);
    console.log(`      - signature: ${signature}`);
    console.log('');

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    console.log('');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Upload failed:');
      console.error(errorText);
      return;
    }

    const result = await response.json();
    console.log('✅ Upload successful!');
    console.log(`   URL: ${result.secure_url}`);
    console.log(`   Public ID: ${result.public_id}`);
    console.log(`   Format: ${result.format}`);
    console.log(`   Duration: ${result.duration}s`);
    console.log(`   Size: ${(result.bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
    console.log('🎉 Cloudinary upload test PASSED!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCloudinaryUpload();
