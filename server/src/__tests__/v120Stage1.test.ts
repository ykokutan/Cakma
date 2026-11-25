import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Message, Server, ServerPermission, User } from '../types.js';
import type { SystemConfig } from '../storage.js';
import { createSocketEventRateLimiter } from '../utils/socketGuard.js';
import { registerChatMessageHandlers } from '../features/chatMessageHandlers.js';
import { isServerOwner } from '../utils/serverIdentity.js';

function createMockSocket(id: string) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket: any = {
    id,
    on: (ev: string, fn: (p: unknown) => void) => handlers.set(ev, fn),
    emit: (ev: string, payload: unknown) => emitted.push({ event: ev, payload }),
    to: () => ({ emit: () => {} }),
    join: () => {},
    leave: () => {},
  };
  return {
    socket,
    emitted,
    trigger: (ev: string, payload?: unknown) => {
      const fn = handlers.get(ev);
      if (!fn) throw new Error(`Missing handler for ${ev}`);
      fn(payload);
    },
  };
}

function makePermissionChecker() {
  return (user: User, server: Server, perm: ServerPermission): boolean => {
    if (isServerOwner(user, server) || user.role === 'admin') return true;
    const member = server.members.find((m) => m.username.toLowerCase() === user.username.toLowerCase());
    if (!member) return false;
    if (member.isOwner) return true;
    for (const rid of member.roleIds) {
      const role = server.roles.find((r) => r.id === rid);
      if (role?.permissions.includes(perm)) return true;
    }
    return false;
  };
}

describe('v1.2.0 Stage 1: Forum Solved & Rich Polls', () => {
  function setupHarness() {
    const ownerSock = createMockSocket('sock-owner');
    const authorSock = createMockSocket('sock-bob');
    const memberSock = createMockSocket('sock-charlie');

    const activeUsers = new Map<string, User>([
      ['sock-owner', { id: 'u-owner', username: 'owner', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
      ['sock-bob', { id: 'u-bob', username: 'bob', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
      ['sock-charlie', { id: 'u-charlie', username: 'charlie', role: 'user', avatar: '', status: 'online', isMuted: false, isDeafened: false, isSpeaking: false }],
    ]);

    const srv: Server = {
      id: 'srv-1',
      name: 'Test Server',
      ownerId: 'u-owner',
      roles: [
        { id: 'role-everyone', name: '@everyone', color: '#999', position: 99, isDefault: true, permissions: ['send_messages'] },
      ],
      members: [
        { userId: 'u-owner', username: 'owner', avatar: '', roleIds: [], joinedAt: '2026-01-01', isOwner: true },
        { userId: 'u-bob', username: 'bob', avatar: '', roleIds: ['role-everyone'], joinedAt: '2026-01-01' },
        { userId: 'u-charlie', username: 'charlie', avatar: '', roleIds: ['role-everyone'], joinedAt: '2026-01-01' },
      ],
      channels: [
        { id: 'ch-forum', serverId: 'srv-1', name: 'yardim', type: 'forum' },
        { id: 'ch-text', serverId: 'srv-1', name: 'genel', type: 'text' },
      ],
    };

    const messages: Record<string, Message[]> = {
      'ch-forum': [
        {
          id: 'forum-msg-1',
          serverId: 'srv-1',
          channelId: 'ch-forum',
          author: { id: 'u-bob', username: 'bob', avatar: '' },
          content: 'Mikrofon ayarım çalışmıyor',
          timestamp: '10:00',
          reactions: {},
          forumPost: { title: 'Mikrofon Sorunu', tags: ['ses'] },
        },
      ],
      'ch-text': [
        {
          id: 'poll-multi',
          serverId: 'srv-1',
          channelId: 'ch-text',
          author: { id: 'u-owner', username: 'owner', avatar: '' },
          content: '📊 **Anket:** Günler?',
          timestamp: '10:05',
          reactions: {},
          poll: {
            question: 'Hangi günler?',
            allowMultiple: true,
            isAnonymous: true,
            options: [
              { id: 'opt-1', text: 'Cumartesi', votes: [] },
              { id: 'opt-2', text: 'Pazar', votes: [] },
            ],
            closed: false,
            totalVotes: 0,
          },
        },
        {
          id: 'poll-expired',
          serverId: 'srv-1',
          channelId: 'ch-text',
          author: { id: 'u-owner', username: 'owner', avatar: '' },
          content: '📊 **Anket:** Süresi Dolmuş',
          timestamp: '10:06',
          reactions: {},
          poll: {
            question: 'Eski Anket',
            closesAt: '2020-01-01T00:00:00.000Z',
            options: [
              { id: 'opt-a', text: 'Evet', votes: [] },
              { id: 'opt-b', text: 'Hayır', votes: [] },
            ],
            closed: false,
            totalVotes: 0,
          },
        },
      ],
    };

    const broadcasts: Array<{ event: string; payload: any }> = [];
    const deps: any = {
      io: { to: () => ({ emit: () => {} }) },
      activeUsers,
      registeredAccounts: new Map(),
      servers: [srv],
      messages,
      serverLevels: {},
      socketEventLimiter: createSocketEventRateLimiter(),
      getSystemConfig: () => ({ maxMessageLength: 2000, defaultSlowmodeSeconds: 0, maxUploadSizeMb: 5 }) as SystemConfig,
      sanitizeText: (s: string) => s,
      isMessageFlooding: () => false,
      hasDangerousAttachment: () => false,
      checkServerPermission: makePermissionChecker(),
      addMemberXP: () => {},
      generateAIResponse: () => '',
      saveAccounts: () => {},
      saveUserReadCursor: () => {},
      saveChannelMessageUpsert: () => {},
      saveChannelMessageDelete: () => {},
      getChannelMessagesPageSmart: () => ({ messages: [], hasMore: false }),
      getChannelMessageContextSmart: () => ({ messages: [], hasMoreBefore: false, hasMoreAfter: false, found: false }),
      searchMessagesSmart: () => [],
      emitToChannelAudience: (_ch: string, _srv: string | undefined, event: string, payload: unknown) =>
        broadcasts.push({ event, payload }),
      emitToRelevantUsers: () => {},
      sendWebPushToUsername: async () => {},
    };

    registerChatMessageHandlers(ownerSock.socket, deps);
    registerChatMessageHandlers(authorSock.socket, deps);
    registerChatMessageHandlers(memberSock.socket, deps);

    return { ownerSock, authorSock, memberSock, messages, broadcasts };
  }

  it('allows forum topic author and owner/moderators to toggle solved status while blocking unrelated members', () => {
    const { ownerSock, authorSock, memberSock, messages, broadcasts } = setupHarness();

    // Random member cannot toggle another user's forum topic
    memberSock.trigger('toggle_forum_solved', { channelId: 'ch-forum', messageId: 'forum-msg-1' });
    assert.equal(messages['ch-forum'][0].forumPost?.solved, undefined);
    assert.ok(memberSock.emitted.some((e) => e.event === 'server_action_error'));

    // Author marks solved
    authorSock.trigger('toggle_forum_solved', { channelId: 'ch-forum', messageId: 'forum-msg-1' });
    assert.equal(messages['ch-forum'][0].forumPost?.solved, true);
    assert.equal(messages['ch-forum'][0].forumPost?.solvedBy, 'bob');
    assert.ok(messages['ch-forum'][0].forumPost?.solvedAt);
    assert.ok(broadcasts.some((b) => b.event === 'forum_post_updated' && b.payload.forumPost.solved === true));

    // Owner can reopen
    ownerSock.trigger('toggle_forum_solved', { channelId: 'ch-forum', messageId: 'forum-msg-1' });
    assert.equal(messages['ch-forum'][0].forumPost?.solved, false);
    assert.equal(messages['ch-forum'][0].forumPost?.solvedBy, undefined);
  });

  it('supports allowMultiple voting, auto-closes expired closesAt polls, and preserves rich poll metadata in send_message', () => {
    const { authorSock, messages } = setupHarness();

    // Multi-choice voting retains both options
    authorSock.trigger('vote_poll', { channelId: 'ch-text', messageId: 'poll-multi', optionId: 'opt-1' });
    authorSock.trigger('vote_poll', { channelId: 'ch-text', messageId: 'poll-multi', optionId: 'opt-2' });
    const multiPoll = messages['ch-text'].find((m) => m.id === 'poll-multi')?.poll;
    assert.ok(multiPoll);
    assert.deepEqual(multiPoll.options[0].votes, ['bob']);
    assert.deepEqual(multiPoll.options[1].votes, ['bob']);
    assert.equal(multiPoll.totalVotes, 2);

    // Toggle off opt-1 only
    authorSock.trigger('vote_poll', { channelId: 'ch-text', messageId: 'poll-multi', optionId: 'opt-1' });
    assert.deepEqual(multiPoll.options[0].votes, []);
    assert.deepEqual(multiPoll.options[1].votes, ['bob']);
    assert.equal(multiPoll.totalVotes, 1);

    // Voting on past-closesAt poll closes it without recording the vote
    authorSock.trigger('vote_poll', { channelId: 'ch-text', messageId: 'poll-expired', optionId: 'opt-a' });
    const expiredPoll = messages['ch-text'].find((m) => m.id === 'poll-expired')?.poll;
    assert.ok(expiredPoll);
    assert.equal(expiredPoll.closed, true);
    assert.equal(expiredPoll.totalVotes, 0);

    // Sending a rich poll preserves allowMultiple, isAnonymous and future closesAt
    const futureIso = new Date(Date.now() + 60 * 60_000).toISOString();
    authorSock.trigger('send_message', {
      serverId: 'srv-1',
      channelId: 'ch-text',
      content: '📊 **Anket:** Yeni özellik',
      poll: {
        question: 'Hangi renk?',
        options: [
          { id: 'c1', text: 'Mavi', votes: ['spoofed'] },
          { id: 'c2', text: 'Yeşil', votes: [] },
        ],
        allowMultiple: true,
        isAnonymous: true,
        closesAt: futureIso,
      },
    });
    const created = messages['ch-text'][messages['ch-text'].length - 1];
    assert.equal(created.poll?.allowMultiple, true);
    assert.equal(created.poll?.isAnonymous, true);
    assert.equal(created.poll?.closesAt, futureIso);
    assert.deepEqual(created.poll?.options[0].votes, []);
  });
});
