/**
 * Society Subsystem Enterprise Functional & Integration Test Suite
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../src/modules/user/user.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import SocietyMember from '../src/modules/society_member/society_member.model.js';
import SocietyAnnouncement from '../src/modules/society_announcement/society_announcement.model.js';
import SocietyComplaint from '../src/modules/society_complaint/society_complaint.model.js';
import SocietyFacility from '../src/modules/society_facility/society_facility.model.js';
import SocietyParking from '../src/modules/society_parking/society_parking.model.js';
import SocietyPoll from '../src/modules/society_poll/society_poll.model.js';
import SocietyPollVote from '../src/modules/society_poll/society_poll_vote.model.js';
import SocietyVisitor from '../src/modules/society_visitor/society_visitor.model.js';
import * as profileService from '../src/modules/society_profile/society_profile.service.js';
import * as memberService from '../src/modules/society_member/society_member.service.js';
import * as announcementService from '../src/modules/society_announcement/society_announcement.service.js';
import * as complaintService from '../src/modules/society_complaint/society_complaint.service.js';
import * as facilityService from '../src/modules/society_facility/society_facility.service.js';
import * as parkingService from '../src/modules/society_parking/society_parking.service.js';
import * as pollService from '../src/modules/society_poll/society_poll.service.js';
import * as visitorService from '../src/modules/society_visitor/society_visitor.service.js';

test('Society Functional Suite: Complete 8-Module Lifecycle Test', async (t) => {
  // 1. Setup Test Users
  let users = await User.findAll({ where: { is_deleted: false }, limit: 10 });
  while (users.length < 5) {
    const u = await User.create({
      userName: `SocTester_${users.length + 1}`,
      email: `soctest_${users.length + 1}_${Date.now()}@smartgali.com`,
      phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
    });
    users.push(u);
  }

  const owner = users[0];
  const resident1 = users[1];
  const resident2 = users[2];
  const guard = users[3];

  let testSocietyId = null;

  await t.test('1. Society Profile Creation & Auto-Admin Binding', async () => {
    const profile = await profileService.createProfile(owner.userId, {
      society_name: 'Palm Grove Heights',
      registration_no: 'REG-PGH-2026',
      address: 'Plot 42, Sector 15, Smart City',
      total_flats: 120,
    });

    assert.ok(profile);
    assert.equal(profile.society_name, 'Palm Grove Heights');
    testSocietyId = profile.id;

    // Check creator was automatically bound as active admin
    const adminMembership = await SocietyMember.findOne({
      where: { society_id: testSocietyId, user_id: owner.userId, is_deleted: false },
    });
    assert.ok(adminMembership);
    assert.equal(adminMembership.role, 'admin');
    assert.equal(adminMembership.status, 'active');
  });

  await t.test('2. Society Membership Registration & Approval Lifecycle', async () => {
    // Resident 1 registers
    const member1 = await memberService.createMember(testSocietyId, resident1.userId, {
      flat_no: 'A-401',
      role: 'member',
    });
    assert.ok(member1);
    assert.equal(member1.status, 'pending');

    // Admin approves Resident 1
    const approvedMember = await memberService.approveMember(member1.id, testSocietyId, {
      status: 'active',
      remark: 'Verified owner documentation',
    }, owner.userId);
    assert.equal(approvedMember.status, 'active');

    // Resident 2 registers as Tenant
    const member2 = await memberService.createMember(testSocietyId, resident2.userId, {
      flat_no: 'B-202',
      role: 'tenant',
      status: 'active',
    });
    assert.ok(member2);
  });

  await t.test('3. Society Announcement Publishing & Pinned Filtering', async () => {
    const announcement = await announcementService.createAnnouncement(testSocietyId, owner.userId, {
      title: 'Water Tank Maintenance Notice',
      message: 'Water supply will be interrupted between 10 AM and 2 PM tomorrow.',
      priority: 'high',
      is_pinned: true,
      category: 'maintenance',
    });

    assert.ok(announcement);
    assert.equal(announcement.is_pinned, true);
    assert.equal(announcement.priority, 'high');

    const result = await announcementService.getAllAnnouncements(testSocietyId, { limit: 10 });
    assert.ok(result.data.length >= 1);
    assert.equal(result.data[0].title, 'Water Tank Maintenance Notice');
  });

  await t.test('4. Society Complaint SLA & Assignment Lifecycle', async () => {
    // Resident 1 creates complaint
    const complaint = await complaintService.createComplaint(testSocietyId, resident1.userId, {
      title: 'Elevator Lift #2 Malfunction',
      description: 'Lift #2 in Block A is making loud screeching noises and stopping abruptly.',
      category: 'lift',
      priority: 'urgent',
    });

    assert.ok(complaint);
    assert.equal(complaint.status, 'open');
    assert.equal(complaint.priority, 'urgent');

    // Admin updates complaint to in_progress
    const inProgress = await complaintService.updateComplaintStatus(complaint.id, testSocietyId, {
      status: 'in_progress',
      remark: 'Technician dispatched to site',
    }, owner.userId);
    assert.equal(inProgress.status, 'in_progress');

    // Admin resolves complaint
    const resolved = await complaintService.updateComplaintStatus(complaint.id, testSocietyId, {
      status: 'resolved',
      remark: 'Motor pulleys lubricated and tension adjusted. Tested OK.',
    }, owner.userId);
    assert.equal(resolved.status, 'resolved');
    assert.ok(resolved.resolved_at);
  });

  await t.test('5. Society Facility Amenity Lookup & Caching', async () => {
    const facility = await facilityService.createFacility(testSocietyId, owner.userId, {
      name: 'Olympic Swimming Pool',
      description: 'Heated outdoor swimming pool for all residents',
      operating_hours: '6:00 AM - 10:00 PM',
      max_capacity: 40,
    });

    assert.ok(facility);
    assert.equal(facility.name, 'Olympic Swimming Pool');

    const facilities = await facilityService.getAllFacilities(testSocietyId);
    assert.ok(facilities.length >= 1);
    assert.equal(facilities[0].name, 'Olympic Swimming Pool');
  });

  await t.test('6. Society Parking Slot Allotment & Unique Check', async () => {
    const parking = await parkingService.createParking(testSocietyId, owner.userId, {
      user_id: resident1.userId,
      parking_slot_no: 'P-101',
      vehicle_type: '4_wheeler',
      vehicle_no: 'DL-01-AB-1234',
      vehicle_model: 'Hyundai Creta',
    });

    assert.ok(parking);
    assert.equal(parking.parking_slot_no, 'P-101');

    // Duplicate allocation of the same slot should fail
    await assert.rejects(async () => {
      await parkingService.createParking(testSocietyId, owner.userId, {
        user_id: resident2.userId,
        parking_slot_no: 'P-101',
        vehicle_type: '2_wheeler',
        vehicle_no: 'DL-02-CD-5678',
      });
    }, (err) => err.statusCode === 409);
  });

  await t.test('7. Society Poll Creation, Vote Tally & Percentage Breakdown', async () => {
    const poll = await pollService.createPoll(testSocietyId, owner.userId, {
      question: 'Should we install solar panels on the clubhouse rooftop?',
      options: ['Yes, fully support', 'No, not needed', 'Need more budget info'],
    });

    assert.ok(poll);

    // Resident 1 votes Option 0
    const votedPoll1 = await pollService.votePoll(poll.pollId, testSocietyId, resident1.userId, {
      option_index: 0,
    });
    assert.equal(votedPoll1.total_votes, 1);
    assert.equal(votedPoll1.options[0].count, 1);
    assert.equal(votedPoll1.options[0].percentage, 100);

    // Resident 2 votes Option 0
    const votedPoll2 = await pollService.votePoll(poll.pollId, testSocietyId, resident2.userId, {
      option_index: 0,
    });
    assert.equal(votedPoll2.total_votes, 2);
    assert.equal(votedPoll2.options[0].count, 2);
    assert.equal(votedPoll2.options[0].percentage, 100);

    // Duplicate vote by Resident 1 rejected
    await assert.rejects(async () => {
      await pollService.votePoll(poll.pollId, testSocietyId, resident1.userId, {
        option_index: 1,
      });
    }, (err) => err.statusCode === 409);
  });

  await t.test('8. Visitor Gate Pass State Machine Transitions', async () => {
    // Resident 1 pre-approves visitor
    const visitor = await visitorService.createVisitor(testSocietyId, resident1.userId, {
      visitor_name: 'John Electrician',
      visitor_phone: '9876543210',
      purpose: 'AC servicing',
      flat_no: 'A-401',
    });

    assert.ok(visitor);
    assert.equal(visitor.status, 'expected');

    // Security marks at_gate
    const atGate = await visitorService.updateVisitorStatus(visitor.visitorId, testSocietyId, {
      status: 'at_gate',
    }, guard.userId);
    assert.equal(atGate.status, 'at_gate');

    // Resident approves
    const approved = await visitorService.updateVisitorStatus(visitor.visitorId, testSocietyId, {
      status: 'approved',
    }, resident1.userId);
    assert.equal(approved.status, 'approved');

    // Security checks in
    const checkedIn = await visitorService.updateVisitorStatus(visitor.visitorId, testSocietyId, {
      status: 'checked_in',
    }, guard.userId);
    assert.equal(checkedIn.status, 'checked_in');
    assert.ok(checkedIn.check_in_time);

    // Security checks out
    const checkedOut = await visitorService.updateVisitorStatus(visitor.visitorId, testSocietyId, {
      status: 'checked_out',
    }, guard.userId);
    assert.equal(checkedOut.status, 'checked_out');
    assert.ok(checkedOut.check_out_time);

    // Illegal state transition: CHECKED_OUT -> CHECKED_IN rejected
    await assert.rejects(async () => {
      await visitorService.updateVisitorStatus(visitor.visitorId, testSocietyId, {
        status: 'checked_in',
      }, guard.userId);
    }, (err) => err.statusCode === 422);
  });
});
