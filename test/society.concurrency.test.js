/**
 * Society Subsystem Concurrency & Race Condition Test Suite
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import SocietyMember from '../src/modules/society_member/society_member.model.js';
import * as profileService from '../src/modules/society_profile/society_profile.service.js';
import * as pollService from '../src/modules/society_poll/society_poll.service.js';
import * as parkingService from '../src/modules/society_parking/society_parking.service.js';
import * as visitorService from '../src/modules/society_visitor/society_visitor.service.js';

test('Society Concurrency & Stress Resilience Suite', async (t) => {
  // Setup 25 test users
  let users = await User.findAll({ where: { is_deleted: false }, limit: 30 });
  while (users.length < 25) {
    const u = await User.create({
      userName: `SocRaceTester_${users.length + 1}`,
      email: `socrace_${users.length + 1}_${Date.now()}@smartgali.com`,
      phone: `97766${Math.floor(10000 + Math.random() * 90000)}`,
    });
    users.push(u);
  }

  const owner = users[0];
  const profile = await profileService.createProfile(owner.userId, {
    society_name: 'Concurrency Ridge Society',
  });
  const societyId = profile.id;

  // Add members
  for (let i = 1; i < 20; i++) {
    await SocietyMember.create({
      society_id: societyId,
      user_id: users[i].userId,
      role: 'member',
      status: 'active',
    });
  }

  await t.test('Poll Voting: 50 Simultaneous Votes from SAME User -> Exactly 1 Succeeds', async () => {
    const poll = await pollService.createPoll(societyId, owner.userId, {
      question: 'Concurrent vote duplicate prevention test',
      options: ['Option A', 'Option B'],
    });

    const voterId = users[1].userId;
    const attempts = Array.from({ length: 50 }, () =>
      pollService.votePoll(poll.pollId, societyId, voterId, { option_index: 0 })
        .then(() => ({ success: true }))
        .catch((err) => ({ success: false, error: err.message, status: err.statusCode }))
    );

    const results = await Promise.all(attempts);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    assert.equal(successCount, 1, 'Exactly 1 simultaneous vote should succeed');
    assert.equal(failureCount, 49, '49 simultaneous votes should be rejected');

    const freshPoll = await pollService.getPollById(poll.pollId, societyId, voterId);
    assert.equal(freshPoll.total_votes, 1, 'Total votes in DB must be exactly 1');
  });

  await t.test('Poll Voting: 15 Simultaneous Votes from 15 DISTINCT Users -> All 15 Succeed', async () => {
    const poll = await pollService.createPoll(societyId, owner.userId, {
      question: 'Multi-user parallel vote tally test',
      options: ['Approve Budget', 'Reject Budget'],
    });

    const voters = users.slice(1, 16); // 15 users
    const votePromises = voters.map((u, idx) =>
      pollService.votePoll(poll.pollId, societyId, u.userId, { option_index: idx % 2 })
    );

    await Promise.all(votePromises);

    const freshPoll = await pollService.getPollById(poll.pollId, societyId);
    assert.equal(freshPoll.total_votes, 15, 'All 15 distinct user votes must be tallied');
  });

  await t.test('Parking: 2 Simultaneous Allocations for SAME Slot -> Exactly 1 Succeeds', async () => {
    const slotNo = `RACE-SLOT-${Date.now()}`;

    const req1 = parkingService.createParking(societyId, owner.userId, {
      user_id: users[1].userId,
      parking_slot_no: slotNo,
      vehicle_type: '4_wheeler',
      vehicle_no: 'HR-26-AB-1111',
    }).then(() => ({ success: true })).catch((e) => ({ success: false, error: e.message }));

    const req2 = parkingService.createParking(societyId, owner.userId, {
      user_id: users[2].userId,
      parking_slot_no: slotNo,
      vehicle_type: '2_wheeler',
      vehicle_no: 'HR-26-CD-2222',
    }).then(() => ({ success: true })).catch((e) => ({ success: false, error: e.message }));

    const [res1, res2] = await Promise.all([req1, req2]);
    const successes = [res1, res2].filter((r) => r.success).length;
    const failures = [res1, res2].filter((r) => !r.success).length;

    assert.equal(successes, 1, 'Only one allocation must succeed');
    assert.equal(failures, 1, 'Conflicting allocation must fail with 409');
  });
});
