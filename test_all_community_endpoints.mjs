// Comprehensive Community Sub-Endpoints Test
import http from 'http';
import jwt from 'jsonwebtoken';
import env from './src/config/env.js';

const TOKEN = jwt.sign(
  { id: 27, userId: 27, sub: '27', role: 'resident', email: 'pawankr138@gmail.com', phone: '8709879987', type: 'access' },
  env.jwt.secret,
  { expiresIn: '1h' }
);

function request(options, postData = null) {
  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', (err) => resolve({ status: 0, data: err.message }));
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Community Sub-Endpoints for Community ID: 6\n');
  const communityId = 6;

  const endpoints = [
    { name: '1. Community Details', path: `/api/v1/communities/${communityId}`, method: 'GET' },
    { name: '2. Community Feed', path: `/api/v1/communities/${communityId}/feed`, method: 'GET' },
    { name: '3. Community Members', path: `/api/v1/communities/${communityId}/members`, method: 'GET' },
    { name: '4. Community Polls', path: `/api/v1/communities/${communityId}/polls`, method: 'GET' },
    { name: '5. Community Announcements', path: `/api/v1/communities/${communityId}/announcements`, method: 'GET' },
    { name: '6. Community Documents', path: `/api/v1/communities/${communityId}/documents`, method: 'GET' },
    { name: '7. Community Gallery', path: `/api/v1/communities/${communityId}/gallery`, method: 'GET' },
    { 
      name: '8. Create Feed Post', 
      path: `/api/v1/communities/${communityId}/feed`, 
      method: 'POST', 
      body: { content: 'Hello community! Welcome to our group.' },
      headers: { 'Content-Type': 'application/json' }
    },
    { 
      name: '9. Create Poll', 
      path: `/api/v1/communities/${communityId}/polls`, 
      method: 'POST', 
      body: { question: 'When should we have our first meetup?', options: ['Saturday morning', 'Sunday evening', 'Next weekend'] },
      headers: { 'Content-Type': 'application/json' }
    },
    { 
      name: '10. Create Announcement', 
      path: `/api/v1/communities/${communityId}/announcements`, 
      method: 'POST', 
      body: { title: 'Welcome Notice', message: 'Please follow group rules.' },
      headers: { 'Content-Type': 'application/json' }
    },
  ];

  for (const ep of endpoints) {
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: ep.path,
      method: ep.method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(ep.headers || {}),
      },
    };

    const res = await request(options, ep.body);
    const isOk = res.status >= 200 && res.status < 300;
    const icon = isOk ? '✅' : '❌';
    console.log(`${icon} [${res.status}] ${ep.name} (${ep.method} ${ep.path})`);
    if (!isOk) {
      console.log('   Error response:', JSON.stringify(res.data).slice(0, 300));
    } else {
      const summary = res.data?.data ? (Array.isArray(res.data.data) ? `Array(${res.data.data.length})` : typeof res.data.data) : 'OK';
      console.log(`   Response summary:`, summary);
    }
  }

  setTimeout(() => process.exit(0), 100).unref();
}

runTests();
