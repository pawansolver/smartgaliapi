/**
 * PRD Compliance Test Suite
 * Validates PRD Section 18.3, 18.4, 18.6 API contracts & Super Admin RBAC across:
 * - Community (/communities/:id/invite)
 * - Societies (/societies, /societies/:id, /join, /leave, /members, /announcements, /complaints, /complaints/:id)
 * - Events (/events/:id/join, /events/:id/leave, /events/my)
 * - Super Admin Global Bypass on Society
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../src/app.js';
import User from '../src/modules/user/user.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import SocietyMember from '../src/modules/society_member/society_member.model.js';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';
import Event from '../src/modules/event/event.model.js';
import EventCategory from '../src/modules/event_category/event_category.model.js';
import jwt from 'jsonwebtoken';
import env from '../src/config/env.js';
import sequelize from '../src/config/db.js';

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = 'http://127.0.0.1:' + port;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await sequelize.close();
  } catch {}
});

const makeToken = (user) => {
  return jwt.sign(
    {
      id: user.userId,
      userId: user.userId,
      role: user.userRole || 'user',
      userRole: user.userRole || 'user',
    },
    env.jwt.secret,
    { expiresIn: '1h' }
  );
};

test('PRD Compliance & Super Admin Multi-Module Suite', async (t) => {
  // 1. Create Test Users
  const superAdmin = await User.create({
    userName: 'PRD_SuperAdmin_' + Date.now(),
    email: 'prd_superadmin_' + Date.now() + '@smartgali.com',
    phone: '9876' + Math.floor(100000 + Math.random() * 900000),
    userRole: 'super_admin',
    is_active: true,
    status: 'active',
  });
  const saToken = makeToken(superAdmin);

  const resident1 = await User.create({
    userName: 'PRD_Resident1_' + Date.now(),
    email: 'prd_res1_' + Date.now() + '@smartgali.com',
    phone: '9876' + Math.floor(100000 + Math.random() * 900000),
    userRole: 'user',
    is_active: true,
    status: 'active',
  });
  const res1Token = makeToken(resident1);

  const resident2 = await User.create({
    userName: 'PRD_Resident2_' + Date.now(),
    email: 'prd_res2_' + Date.now() + '@smartgali.com',
    phone: '9876' + Math.floor(100000 + Math.random() * 900000),
    userRole: 'user',
    is_active: true,
    status: 'active',
  });
  const res2Token = makeToken(resident2);

  let testSocietyId = null;
  let testComplaintId = null;
  let testCommunityId = null;
  let testEventId = null;

  await t.test('1. PRD 18.4: POST /societies - Create Society', async () => {
    const res = await fetch(baseUrl + '/api/v1/societies', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res1Token,
      },
      body: JSON.stringify({
        society_name: 'PRD Test Heights',
        registration_no: 'REG-PRD-' + Date.now(),
        address: 'Sector 62, Noida',
        total_flats: 200,
      }),
    });
    const body = await res.json();

    assert.equal(res.status, 201);
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    testSocietyId = body.data.id;
  });

  await t.test('2. PRD 18.4: GET /societies & GET /societies/:id', async () => {
    const listRes = await fetch(baseUrl + '/api/v1/societies', {
      headers: { 'Authorization': 'Bearer ' + res1Token },
    });
    const listBody = await listRes.json();

    assert.equal(listRes.status, 200);
    assert.equal(listBody.success, true);
    assert.ok(Array.isArray(listBody.data));

    const getRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId, {
      headers: { 'Authorization': 'Bearer ' + res1Token },
    });
    const getBody = await getRes.json();

    assert.equal(getRes.status, 200);
    assert.equal(getBody.data.society_name, 'PRD Test Heights');
  });

  await t.test('3. PRD 18.4: POST /societies/:id/join - Resident joins society', async () => {
    const joinRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res2Token,
      },
      body: JSON.stringify({ flat_no: 'B-402' }),
    });
    const joinBody = await joinRes.json();

    assert.equal(joinRes.status, 201);
    assert.equal(joinBody.success, true);
    assert.equal(joinBody.data.status, 'pending');

    // Admin approves Resident 2
    const memberRec = await SocietyMember.findOne({
      where: { society_id: testSocietyId, user_id: resident2.userId, is_deleted: false },
    });
    memberRec.status = 'active';
    await memberRec.save();
  });

  await t.test('4. PRD 18.4 & RBAC: GET /societies/:id/members - Super Admin has universal access', async () => {
    const saRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/members', {
      headers: { 'Authorization': 'Bearer ' + saToken },
    });
    const saBody = await saRes.json();

    assert.equal(saRes.status, 200);
    assert.equal(saBody.success, true);
    assert.ok(saBody.data.length >= 2);
  });

  await t.test('5. PRD 18.4: POST & GET /societies/:id/announcements', async () => {
    const postRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/announcements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res1Token,
      },
      body: JSON.stringify({
        title: 'Water Tank Cleaning Tomorrow',
        message: 'Water supply will remain paused from 10 AM to 2 PM.',
        content: 'Water supply will remain paused from 10 AM to 2 PM.',
      }),
    });
    const postBody = await postRes.json();

    assert.equal(postRes.status, 201);
    assert.equal(postBody.success, true);

    const getRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/announcements', {
      headers: { 'Authorization': 'Bearer ' + res2Token },
    });
    const getBody = await getRes.json();

    assert.equal(getRes.status, 200);
    assert.ok(getBody.data.length >= 1);
  });

  await t.test('6. PRD 18.4: POST & GET & PUT /societies/:id/complaints', async () => {
    const complaintRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/complaints', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res2Token,
      },
      body: JSON.stringify({
        category: 'plumbing',
        title: 'Balcony Pipe Leakage',
        description: 'Water leaking into lower balcony flat.',
        priority: 'high',
      }),
    });
    const complaintBody = await complaintRes.json();

    assert.equal(complaintRes.status, 201);
    assert.ok(complaintBody.data.id);
    testComplaintId = complaintBody.data.id;

    const listRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/complaints', {
      headers: { 'Authorization': 'Bearer ' + res2Token },
    });
    const listBody = await listRes.json();

    assert.equal(listRes.status, 200);
    assert.ok(listBody.data.length >= 1);

    // Admin updates complaint status via PRD route PUT /societies/complaints/:id
    const putRes = await fetch(baseUrl + '/api/v1/societies/complaints/' + testComplaintId, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res1Token,
      },
      body: JSON.stringify({ status: 'in_progress', comment: 'Assigned to plumber team' }),
    });
    const putBody = await putRes.json();

    assert.equal(putRes.status, 200);
    assert.equal(putBody.data.status, 'in_progress');
  });

  await t.test('7. PRD 18.4: POST /societies/:id/leave', async () => {
    const leaveRes = await fetch(baseUrl + '/api/v1/societies/' + testSocietyId + '/leave', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + res2Token },
    });
    const leaveBody = await leaveRes.json();

    assert.equal(leaveRes.status, 200);
    assert.equal(leaveBody.success, true);

    // Verify member record is now inactive/deleted
    const checkMember = await SocietyMember.findOne({
      where: { society_id: testSocietyId, user_id: resident2.userId, is_deleted: false },
    });
    assert.equal(checkMember, null);
  });

  await t.test('8. PRD 18.3: POST /communities/:id/invite', async () => {
    const comm = await Community.create({
      communityName: 'PRD Tech Innovators ' + Date.now(),
      created_by: resident1.userId,
      is_private: true,
      status: 'active',
      is_deleted: false,
    });
    testCommunityId = comm.communityId;

    await CommunityMember.create({
      community_id: testCommunityId,
      user_id: resident1.userId,
      role: 'admin',
      status: 'active',
      joined_at: new Date(),
      created_by: resident1.userId,
    });

    const inviteRes = await fetch(baseUrl + '/api/v1/communities/' + testCommunityId + '/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res1Token,
      },
      body: JSON.stringify({ invitee_ids: [resident2.userId] }),
    });
    const inviteBody = await inviteRes.json();

    assert.ok(inviteRes.status === 200 || inviteRes.status === 201);
    assert.equal(inviteBody.success, true);
  });

  await t.test('9. PRD 18.6: POST /events/:id/join, POST /events/:id/leave, GET /events/my', async () => {
    const cat = await EventCategory.create({
      name: 'PRD Tech Meetup ' + Date.now(),
      is_active: true,
      is_deleted: false,
    });

    const startAt = new Date(Date.now() + 86400000);
    const endAt = new Date(Date.now() + 90000000);

    const event = await Event.create({
      title: 'Global Tech Summit ' + Date.now(),
      description: 'Annual developers gathering.',
      start_at: startAt,
      end_at: endAt,
      location: 'Auditorium 1',
      event_type: 'offline',
      visibility: 'public',
      status: 'published',
      category_id: cat.id,
      created_by: resident1.userId,
      going_count: 1,
      interested_count: 0,
      declined_count: 0,
      is_active: true,
      is_deleted: false,
    });
    testEventId = event.id;

    // Resident 2 calls POST /events/:id/join
    const joinRes = await fetch(baseUrl + '/api/v1/events/' + testEventId + '/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + res2Token,
      },
      body: JSON.stringify({ status: 'going' }),
    });
    const joinBody = await joinRes.json();

    assert.equal(joinRes.status, 200);
    assert.equal(joinBody.success, true);
    assert.equal(joinBody.data.participant?.status || joinBody.data.status, 'going');

    // Resident 2 calls GET /events/my
    const myRes = await fetch(baseUrl + '/api/v1/events/my', {
      headers: { 'Authorization': 'Bearer ' + res2Token },
    });
    const myBody = await myRes.json();

    assert.equal(myRes.status, 200);
    const rsvps = myBody.data?.rsvps || myBody.data || [];
    assert.ok(rsvps.some(r => r.event?.id === testEventId || r.id === testEventId || r.event_id === testEventId));

    // Resident 2 calls POST /events/:id/leave
    const leaveRes = await fetch(baseUrl + '/api/v1/events/' + testEventId + '/leave', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + res2Token },
    });
    const leaveBody = await leaveRes.json();

    assert.equal(leaveRes.status, 200);
    assert.equal(leaveBody.success, true);
  });
});
