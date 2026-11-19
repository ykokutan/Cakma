import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAttachmentSafety, checkAutoModContent, isStrongPassword } from '../utils/security.js';

test('validateAttachmentSafety blocks executables and oversized uploads', () => {
  assert.equal(validateAttachmentSafety({ name: 'payload.exe', size: 1024 }, 5).ok, false);
  assert.equal(validateAttachmentSafety({ name: 'photo.webp', size: 6 * 1024 * 1024 }, 5).ok, false);
  assert.equal(validateAttachmentSafety({ name: 'photo.webp', size: 500_000 }, 5).ok, true);
});

test('checkAutoModContent blocks disallowed links and banned words case-insensitively', () => {
  assert.equal(checkAutoModContent('visit https://evil.test now', { blockLinks: true }).blocked, true);
  assert.equal(checkAutoModContent('some BADWORD text', { bannedWords: ['badword'] }).blocked, true);
  assert.equal(checkAutoModContent('hello friends!', { blockLinks: true, bannedWords: ['spam'] }).blocked, false);
});

test('isStrongPassword enforces length, upper, lower, and digit', () => {
  assert.equal(isStrongPassword('weak'), false);
  assert.equal(isStrongPassword('alllowercase1'), false);
  assert.equal(isStrongPassword('NoDigitsHere'), false);
  assert.equal(isStrongPassword('StrongPass9'), true);
});
