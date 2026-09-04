import sequelize from '../src/config/db.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { up as migrateCommunity } from '../scripts/migrations/010-enterprise-community.js';
import { schemas } from '../src/modules/community/community.validation.js';
import { requireCommunityReadAccess } from '../src/middleware/communityAuth.middleware.js';
import Community from '../src/modules/community/community.model.js';
import CommunityMember from '../src/modules/communityMember/communityMember.model.js';

test('community validation rejects malformed IDs and accepts cursor feed query', () => {
  assert.ok(schemas.id.params.validate({ id: 'nope' }).error);
  const result = schemas.feed.query.validate({ limit: '25', cursor: Buffer.from('cursor').toString('base64') });
  assert.equal(result.error, undefined);
  assert.equal(result.value.limit, 25);
  assert.ok(schemas.roleUpdate.body.validate({}).error);
  assert.equal(
    schemas.roleUpdate.body.validate({ role: 'moderator' }).error,
    undefined,
  );
  assert.ok(schemas.invitationResponse.params.validate({ id: 7, invitationId: 'bad' }).error);
});

test('enterprise community migration is idempotent with mock interfaces', async () => {
  const tables = ['posts', 'communities', 'community_members', 'community_join_requests', 'chats', 'chat_participants'];
  const columns = {
    posts: {},
    community_join_requests: {},
    chats: {},
  };
  const indexes = Object.fromEntries(tables.map((table) => [table, []]));
  const addedColumns = [];
  const addedIndexes = [];
  const updates = [];
  const constraints = [];
  const queryInterface = {
    showAllTables: async () => tables,
    describeTable: async (table) => columns[table] || {},
    addColumn: async (table, column, definition) => {
      columns[table] ||= {};
      columns[table][column] = definition;
      addedColumns.push(`${table}.${column}`);
    },
    createTable: async (table) => {
      tables.push(table);
      indexes[table] = [];
    },
    showIndex: async (table) => indexes[table] || [],
    addIndex: async (table, fields, options) => {
      indexes[table].push({ name: options.name });
      addedIndexes.push({ table, fields, options });
    },
    showConstraint: async () => constraints,
    addConstraint: async (_table, options) => constraints.push({ constraintName: options.name }),
    bulkUpdate: async (table, values, where) => updates.push({ table, values, where }),
  };
  const database = {
    query: async (sql) => {
      if (sql.includes('FROM community_join_requests')) {
        return [
          { id: 1, community_id: 10, user_id: 20 },
          { id: 2, community_id: 10, user_id: 20 },
        ];
      }
      if (sql.includes('FROM chats')) {
        return [
          { id: 3, community_id: 10 },
          { id: 4, community_id: 10 },
        ];
      }
      return [];
    },
  };

  await migrateCommunity({ queryInterface, database });
  await migrateCommunity({ queryInterface, database });

  assert.deepEqual(addedColumns.sort(), [
    'chat_participants.membership_key',
    'chats.community_chat_key',
    'community_join_requests.pending_key',
    'posts.community_id',
  ]);
  assert.equal(new Set(addedIndexes.map((entry) => entry.options.name)).size, addedIndexes.length);
  assert.ok(updates.some((entry) => entry.table === 'community_join_requests' && entry.where.id === 2 && entry.values.status === 'rejected'));
  assert.ok(updates.some((entry) => entry.table === 'chats' && entry.where.id === 4 && entry.values.is_deleted === true));
});

test('private community reads require active membership while public reads remain anonymous', async (t) => {
  const response = () => {
    const result = { statusCode: 200, body: null };
    result.status = (code) => { result.statusCode = code; return result; };
    result.json = (body) => { result.body = body; return result; };
    return result;
  };
  const privateCommunity = { communityId: 7, is_private: true, created_by: 1 };
  t.mock.method(Community, 'findOne', async () => privateCommunity);
  t.mock.method(CommunityMember, 'findOne', async () => null);
  const denied = response();
  await requireCommunityReadAccess({ params: { id: 7 }, query: {}, body: {} }, denied, () => {});
  assert.equal(denied.statusCode, 401);

  privateCommunity.is_private = false;
  let continued = false;
  await requireCommunityReadAccess(
    { params: { id: 7 }, query: {}, body: {} },
    response(),
    () => { continued = true; },
  );
  assert.equal(continued, true);
});


after(async () => {
  try { await sequelize.close(); } catch {}
});
