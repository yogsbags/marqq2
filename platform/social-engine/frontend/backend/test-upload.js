const fs = require('fs');
const FormData = require('form-data');

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const imagePath = './generated-avatars/raj_avatar.jpg';

async function tryUpload() {
  if (!HEYGEN_API_KEY) {
    throw new Error('Missing HEYGEN_API_KEY. Set it in the environment before running.');
  }

  // Try with 'circle_image' field
  console.log('Attempt 1: Using "circle_image" field...');
  let form = new FormData();
  form.append('circle_image', fs.createReadStream(imagePath));
  
  let response = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, ...form.getHeaders() },
    body: form
  });
  console.log('Status:', response.status);
  console.log('Response:', await response.text());

  // Try with 'image' field
  console.log('\nAttempt 2: Using "image" field...');
  form = new FormData();
  form.append('image', fs.createReadStream(imagePath));
  
  response = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, ...form.getHeaders() },
    body: form
  });
  console.log('Status:', response.status);
  console.log('Response:', await response.text());

  // Try with talking_photo field
  console.log('\nAttempt 3: Using "talking_photo" field...');
  form = new FormData();
  form.append('talking_photo', fs.createReadStream(imagePath));
  
  response = await fetch('https://upload.heygen.com/v1/talking_photo', {
    method: 'POST',
    headers: { 'X-Api-Key': HEYGEN_API_KEY, ...form.getHeaders() },
    body: form
  });
  console.log('Status:', response.status);
  console.log('Response:', await response.text());
}

tryUpload().catch(console.error);
