import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cakma-e2e-'));

function hashScrypt(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

const adminUser = {
  id: 'acc-e2e-admin',
  username: 'e2e_admin',
  email: 'e2e@example.com',
  password: hashScrypt('E2eTestPass!123'),
  avatar: '🛡️',
  role: 'admin',
  createdAt: new Date().toISOString(),
  walletBalance: 1000,
};

const defaultRoles = [
  {
    id: 'role-owner',
    name: 'Sunucu Sahibi',
    color: '#f59e0b',
    position: 0,
    permissions: [
      'manage_server',
      'manage_roles',
      'manage_channels',
      'kick_members',
      'mute_members',
      'send_messages',
      'attach_files',
      'connect_voice',
      'speak_voice',
      'priority_speaker',
    ],
  },
  {
    id: 'role-admin',
    name: 'Yönetici',
    color: '#ef4444',
    position: 1,
    permissions: [
      'manage_channels',
      'kick_members',
      'mute_members',
      'send_messages',
      'attach_files',
      'connect_voice',
      'speak_voice',
    ],
  },
  {
    id: 'role-everyone',
    name: '@everyone',
    color: '#94a3b8',
    position: 999,
    permissions: ['send_messages', 'attach_files', 'connect_voice', 'speak_voice'],
    isDefault: true,
  },
];

const e2eServers = [
  {
    id: 'srv-e2e',
    name: 'E2E Test Sunucusu',
    icon: '🧪',
    description: 'Playwright E2E doğrulama sunucusu',
    isPublic: true,
    category: 'tech',
    ownerId: 'acc-e2e-admin',
    bitrateKbps: 128,
    roles: defaultRoles,
    members: [
      {
        userId: 'acc-e2e-admin',
        username: 'e2e_admin',
        avatar: '🛡️',
        roleIds: ['role-owner', 'role-admin'],
        joinedAt: new Date().toLocaleDateString('tr-TR'),
        isOwner: true,
      },
    ],
    categories: [
      {
        id: 'cat-general',
        name: 'Genel Kanallar',
        position: 0,
      },
    ],
    channels: [
      {
        id: 'ch-e2e-text',
        name: 'genel',
        type: 'text',
        serverId: 'srv-e2e',
        categoryId: 'cat-general',
        position: 0,
        topic: 'E2E Genel Sohbet',
        stickyNotice: {
          text: 'Bu bir E2E sabit duyuru bandıdır — dropdownlar bunun üstünde görünmelidir.',
          author: 'e2e_admin',
          updatedAt: '12:00',
        },
      },
      {
        id: 'ch-e2e-ann',
        name: 'duyurular',
        type: 'announcement',
        serverId: 'srv-e2e',
        categoryId: 'cat-general',
        position: 1,
      },
      {
        id: 'ch-e2e-forum',
        name: 'forum-alani',
        type: 'forum',
        serverId: 'srv-e2e',
        categoryId: 'cat-general',
        position: 2,
      },
      {
        id: 'ch-e2e-voice',
        name: 'Ses Odası',
        type: 'voice',
        serverId: 'srv-e2e',
        categoryId: 'cat-general',
        position: 3,
      },
    ],
  },
];

fs.writeFileSync(path.join(tmpDir, 'users.json'), JSON.stringify([adminUser], null, 2));
fs.writeFileSync(path.join(tmpDir, 'servers.json'), JSON.stringify(e2eServers, null, 2));

const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');
const child = spawn(process.execPath, [serverEntry], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '4179',
    CAKMA_DATA_DIR: tmpDir,
    CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:4179,http://localhost:4179',
    NODE_ENV: 'production',
  },
});

let cleanedUp = false;
function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {}
}

function terminateChild(signal = 'SIGTERM') {
  try {
    if (!child.killed) {
      child.kill(signal);
    }
  } catch {}
}

process.on('SIGINT', () => terminateChild('SIGINT'));
process.on('SIGTERM', () => terminateChild('SIGTERM'));
process.on('exit', cleanup);

child.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
