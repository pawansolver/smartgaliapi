import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import SocietyAnnouncement, {
  ANNOUNCEMENT_PRIORITY,
  ANNOUNCEMENT_STATUS,
  ANNOUNCEMENT_AUDIENCE,
} from '../modules/society_announcement/society_announcement.model.js';
import * as announcementService from '../modules/society_announcement/society_announcement.service.js';
import OutboxEvent from '../modules/outbox/outbox_event.model.js';
import SocietyProfile from '../modules/society_profile/society_profile.model.js';

const runTests = async () => {
  console.log('🧪 Starting Enterprise Society Announcement Integration Tests...\n');
  await connectDB();

  // Pick or create test society
  let society = await SocietyProfile.findOne({ where: { is_deleted: false } });
  const societyId = society ? society.id : 1;
  const testUserId = 6; // Admin user

  console.log(`🏢 Using test society_id: ${societyId}, userId: ${testUserId}`);

  // Test 1: Create Draft Notice
  console.log('Test 1: Creating draft announcement...');
  const draft = await announcementService.createAnnouncement(societyId, testUserId, {
    title: 'Test Water Tank Maintenance Draft',
    summary: 'Maintenance planned for block A',
    message: 'Detailed maintenance instructions for water tank cleaning.',
    action_text: 'Store water before 9 AM',
    audience: ANNOUNCEMENT_AUDIENCE.ENTIRE_SOCIETY,
    priority: ANNOUNCEMENT_PRIORITY.HIGH,
    category: 'maintenance',
    status: ANNOUNCEMENT_STATUS.DRAFT,
    attachments: [
      {
        file_url: '/uploads/announcements/test_circular.pdf',
        file_name: 'test_circular.pdf',
        file_type: 'application/pdf',
        file_size: 1048576,
      }
    ],
  });

  assert.ok(draft.id, 'Draft should have an ID');
  assert.ok(draft.announcement_number.startsWith('ANN-'), `Announcement number should start with ANN-, got ${draft.announcement_number}`);
  assert.strictEqual(draft.status, 'draft', 'Status should be draft');
  assert.strictEqual(draft.published_at, null, 'Draft should have null published_at');
  assert.strictEqual(draft.attachments.length, 1, 'Draft should preserve attachments');
  console.log(`✅ Draft created successfully with number: ${draft.announcement_number}`);

  // Verify no outbox event was generated for the draft
  const draftEvent = await OutboxEvent.findOne({
    where: {
      event_type: 'society.announcement_created',
      'payload.announcementId': Number(draft.id),
    }
  });
  assert.strictEqual(draftEvent, null, 'Draft should NOT generate an outbox event');
  console.log('✅ Verified: No outbox notification generated for draft notice');

  // Test 2: Resident feed should NOT show draft notice
  console.log('\nTest 2: Verifying draft is hidden from regular feed...');
  const feedBeforePublish = await announcementService.getAllAnnouncements(societyId, {
    status: 'published',
  });
  const foundDraftInFeed = feedBeforePublish.data.some(a => Number(a.id) === Number(draft.id));
  assert.strictEqual(foundDraftInFeed, false, 'Draft notice must not appear in regular published feed');
  console.log('✅ Verified: Draft is hidden from published feed');

  // Test 3: Admin feed CAN see draft notices
  console.log('\nTest 3: Verifying admin draft query returns draft...');
  const draftFeed = await announcementService.getAllAnnouncements(societyId, {
    status: 'draft',
  });
  const foundInDrafts = draftFeed.data.some(a => Number(a.id) === Number(draft.id));
  assert.strictEqual(foundInDrafts, true, 'Admin draft filter should find the draft');
  console.log('✅ Verified: Admin draft filter returns the draft');

  // Test 4: Update draft
  console.log('\nTest 4: Updating draft announcement...');
  const updatedDraft = await announcementService.updateAnnouncement(
    draft.id,
    societyId,
    {
      title: 'Updated Water Tank Maintenance Draft',
      action_text: 'Store water before 8 AM sharp',
    },
    testUserId
  );
  assert.strictEqual(updatedDraft.title, 'Updated Water Tank Maintenance Draft');
  assert.strictEqual(updatedDraft.action_text, 'Store water before 8 AM sharp');
  console.log('✅ Verified: Draft updated successfully');

  // Test 5: Publish the draft notice
  console.log('\nTest 5: Publishing draft announcement...');
  const publishedNotice = await announcementService.updateAnnouncement(
    draft.id,
    societyId,
    {
      status: ANNOUNCEMENT_STATUS.PUBLISHED,
      is_pinned: true,
    },
    testUserId
  );
  assert.strictEqual(publishedNotice.status, 'published', 'Notice status should now be published');
  assert.ok(publishedNotice.published_at, 'published_at timestamp should now be set');
  assert.strictEqual(publishedNotice.is_pinned, true, 'Notice should be pinned');

  // Verify outbox event IS now generated on publication
  const publishEvent = await OutboxEvent.findOne({
    where: {
      event_type: 'society.announcement_created',
      'payload.announcementId': Number(draft.id),
    }
  });
  assert.ok(publishEvent, 'Outbox event should be generated when transitioning draft to published');
  console.log('✅ Verified: Outbox notification event generated on publish');

  // Test 6: Published notice now appears in resident feed
  console.log('\nTest 6: Verifying published notice appears in resident feed...');
  const feedAfterPublish = await announcementService.getAllAnnouncements(societyId, {
    status: 'published',
  });
  const foundInFeed = feedAfterPublish.data.find(a => Number(a.id) === Number(draft.id));
  assert.ok(foundInFeed, 'Published notice should now appear in resident feed');
  assert.strictEqual(foundInFeed.announcement_number, draft.announcement_number);
  assert.strictEqual(foundInFeed.is_pinned, true, 'Notice should be pinned');
  console.log('✅ Verified: Notice appears in resident feed with pinned status and announcement number');

  // Test 7: Search by announcement number and keyword
  console.log('\nTest 7: Testing search functionality...');
  const searchResult = await announcementService.getAllAnnouncements(societyId, {
    search: draft.announcement_number,
    status: 'all',
  });
  assert.ok(searchResult.data.length >= 1, 'Search by announcement number should return result');
  assert.strictEqual(searchResult.data[0].announcement_number, draft.announcement_number);
  console.log('✅ Verified: Search by announcement number works');

  // Test 8: Expiry filtering
  console.log('\nTest 8: Testing expiry filtering...');
  const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
  await publishedNotice.update({ expires_at: pastDate });

  const activeFeed = await announcementService.getAllAnnouncements(societyId, {
    status: 'published',
    include_expired: false,
  });
  const expiredInActive = activeFeed.data.some(a => Number(a.id) === Number(draft.id));
  assert.strictEqual(expiredInActive, false, 'Expired notice should NOT appear in active feed');

  const includeExpiredFeed = await announcementService.getAllAnnouncements(societyId, {
    status: 'published',
    include_expired: true,
  });
  const expiredInAll = includeExpiredFeed.data.some(a => Number(a.id) === Number(draft.id));
  assert.strictEqual(expiredInAll, true, 'Expired notice SHOULD appear when include_expired=true');
  console.log('✅ Verified: Expiry filtering excludes expired notices from regular feed');

  // Test 9: Archive Notice
  console.log('\nTest 9: Archiving notice...');
  const archivedNotice = await announcementService.updateAnnouncement(
    draft.id,
    societyId,
    { status: ANNOUNCEMENT_STATUS.ARCHIVED },
    testUserId
  );
  assert.strictEqual(archivedNotice.status, 'archived');

  const residentFeedArchivedCheck = await announcementService.getAllAnnouncements(societyId, {
    status: 'published',
  });
  const foundArchived = residentFeedArchivedCheck.data.some(a => Number(a.id) === Number(draft.id));
  assert.strictEqual(foundArchived, false, 'Archived notice must not appear in published feed');
  console.log('✅ Verified: Notice archived successfully and hidden from resident feed');

  // Clean up test notice
  await publishedNotice.destroy();
  console.log('\n🎉 ALL 9 ENTERPRISE BACKEND INTEGRATION TESTS PASSED!\n');
};

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
