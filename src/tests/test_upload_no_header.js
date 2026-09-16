import { issueAccessToken } from '../modules/auth/auth.tokens.js';

const run = async () => {
  const token = issueAccessToken({ userId: 6, userRole: 'super_admin', email: 'admin@smartgali.com' });

  // 1. Test image upload (JPEG / PNG)
  console.log('Testing image upload (PNG)...');
  const imageFormData = new FormData();
  imageFormData.append('society_id', '1');
  imageFormData.append('file', new Blob([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])], { type: 'image/png' }), 'notice_photo.png');

  const imgRes = await fetch('http://localhost:5000/api/v1/society-announcement/upload-attachment', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: imageFormData,
  });
  const imgBody = await imgRes.json();
  console.log('Image upload status:', imgRes.status);
  console.log('Image upload response:', imgBody);

  // 2. Test PDF upload
  console.log('\nTesting document upload (PDF)...');
  const docFormData = new FormData();
  docFormData.append('society_id', '1');
  docFormData.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'circular_2026.pdf');

  const docRes = await fetch('http://localhost:5000/api/v1/society-announcement/upload-attachment', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: docFormData,
  });
  const docBody = await docRes.json();
  console.log('Doc upload status:', docRes.status);
  console.log('Doc upload response:', docBody);

  if (imgRes.status === 200 && docRes.status === 200) {
    console.log('\n🎉 BOTH IMAGE AND DOCUMENT UPLOADS SUCCEEDED!');
    process.exit(0);
  } else {
    console.error('\n❌ UPLOAD TEST FAILED');
    process.exit(1);
  }
};

run().catch(err => {
  console.error(err);
  process.exit(1);
});
