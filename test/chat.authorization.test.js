import test from 'node:test';
import assert from 'node:assert/strict';
import ChatParticipant from '../src/modules/chat_participant/chat_participant.model.js';
import {
  bindAuthenticatedIdentity,
  requireChatAdmin,
  requireMessageOwnerOrChatAdmin,
  verifyChatMember,
} from '../src/middleware/chatAuthorization.middleware.js';

// ---------------------------------------------------------------------------
// Helper: minimal res/next stubs
// ---------------------------------------------------------------------------
const res = () => {
  const r = { statusCode: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json   = (b) => { r.body = b; return r; };
  return r;
};
const noop = () => {};

// ===========================================================================
// bindAuthenticatedIdentity — IDOR protection
// ===========================================================================
test('bindAuthenticatedIdentity passes when body field matches authenticated user', () => {
  const req = { user: { id: 5 }, body: { sender_id: 5 }, query: {} };
  let called = false;
  bindAuthenticatedIdentity('sender_id')(req, res(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.body.sender_id, 5);
});

test('bindAuthenticatedIdentity rejects mismatched body field (IDOR)', () => {
  const req = { user: { id: 5 }, body: { sender_id: 99 }, query: {} };
  const r = res();
  bindAuthenticatedIdentity('sender_id')(req, r, noop);
  assert.equal(r.statusCode, 403);
  assert.match(r.body.message, /must match the authenticated user/);
});

test('bindAuthenticatedIdentity injects identity when field is absent', () => {
  const req = { user: { id: 7 }, body: {}, query: {} };
  let called = false;
  bindAuthenticatedIdentity('sender_id')(req, res(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.body.sender_id, 7);
});

test('bindAuthenticatedIdentity rejects request with no authenticated user', () => {
  const req = { user: null, body: {}, query: {} };
  const r = res();
  bindAuthenticatedIdentity('sender_id')(req, r, noop);
  assert.equal(r.statusCode, 401);
});

// ===========================================================================
// requireChatAdmin
// ===========================================================================
test('requireChatAdmin allows admin role through', () => {
  const req = { chatParticipant: { role: 'admin' } };
  let called = false;
  requireChatAdmin(req, res(), () => { called = true; });
  assert.equal(called, true);
});

test('requireChatAdmin rejects member role', () => {
  const req = { chatParticipant: { role: 'member' } };
  const r = res();
  requireChatAdmin(req, r, noop);
  assert.equal(r.statusCode, 403);
  assert.match(r.body.message, /Only chat admins/);
});

test('requireChatAdmin rejects absent participant', () => {
  const req = { chatParticipant: null };
  const r = res();
  requireChatAdmin(req, r, noop);
  assert.equal(r.statusCode, 403);
});

// ===========================================================================
// requireMessageOwnerOrChatAdmin
// ===========================================================================
test('requireMessageOwnerOrChatAdmin allows message sender through', () => {
  const req = {
    user:          { id: '10' },
    messageRecord: { sender_id: 10 },
    chatParticipant: { role: 'member' },
  };
  let called = false;
  requireMessageOwnerOrChatAdmin(req, res(), () => { called = true; });
  assert.equal(called, true);
});

test('requireMessageOwnerOrChatAdmin allows chat admin to modify any message', () => {
  const req = {
    user:          { id: '20' },
    messageRecord: { sender_id: 99 },
    chatParticipant: { role: 'admin' },
  };
  let called = false;
  requireMessageOwnerOrChatAdmin(req, res(), () => { called = true; });
  assert.equal(called, true);
});

test('requireMessageOwnerOrChatAdmin blocks non-owner non-admin', () => {
  const req = {
    user:          { id: '20' },
    messageRecord: { sender_id: 99 },
    chatParticipant: { role: 'member' },
  };
  const r = res();
  requireMessageOwnerOrChatAdmin(req, r, noop);
  assert.equal(r.statusCode, 403);
  assert.match(r.body.message, /sender or a chat admin/);
});

// ===========================================================================
// verifyChatMember — DB-backed test using mock
// ===========================================================================
test('verifyChatMember rejects when chatId is missing', async () => {
  const req = { user: { id: 1 }, params: {}, body: {} };
  const r = res();
  await verifyChatMember(req, r, noop);
  assert.equal(r.statusCode, 400);
  assert.match(r.body.message, /chatId is required/);
});

test('verifyChatMember rejects non-member (DB returns null)', async (t) => {
  t.mock.method(ChatParticipant, 'findOne', async () => null);
  const req = { user: { id: 1 }, params: { chatId: '99' }, body: {} };
  const r = res();
  await verifyChatMember(req, r, noop);
  assert.equal(r.statusCode, 403);
  assert.match(r.body.message, /not a member of this chat/);
});

test('verifyChatMember sets req.chatParticipant for valid member', async (t) => {
  const participant = { id: 1, chat_id: 5, user_id: 3, role: 'member' };
  t.mock.method(ChatParticipant, 'findOne', async () => participant);
  const req = { user: { id: 3 }, params: { chatId: '5' }, body: {} };
  let called = false;
  await verifyChatMember(req, res(), () => { called = true; });
  assert.equal(called, true);
  assert.deepEqual(req.chatParticipant, participant);
  assert.equal(req.authorizedChatId, '5');
});
