import { Server, Message, ServerRole } from './types.js';

export function getDefaultRoles(): ServerRole[] {
  return [
    {
      id: 'role-owner',
      name: 'Sunucu Sahibi',
      color: '#f59e0b',
      position: 1,
      permissions: [
        'manage_server', 'manage_roles', 'manage_channels',
        'kick_members', 'ban_members', 'send_messages', 'attach_files',
        'connect_voice', 'speak_voice', 'mute_members', 'priority_speaker'
      ]
    },
    {
      id: 'role-admin',
      name: 'Yönetici',
      color: '#ef4444',
      position: 2,
      permissions: [
        'manage_server', 'manage_roles', 'manage_channels',
        'kick_members', 'ban_members', 'send_messages', 'attach_files',
        'connect_voice', 'speak_voice', 'mute_members', 'priority_speaker'
      ]
    },
    {
      id: 'role-mod',
      name: 'Moderatör',
      color: '#3b82f6',
      position: 3,
      permissions: [
        'manage_channels', 'kick_members', 'mute_members',
        'send_messages', 'attach_files', 'connect_voice', 'speak_voice', 'priority_speaker'
      ]
    },
    {
      id: 'role-vip',
      name: 'VIP Üye',
      color: '#a855f7',
      position: 4,
      permissions: [
        'send_messages', 'attach_files', 'connect_voice', 'speak_voice', 'priority_speaker'
      ]
    },
    {
      id: 'role-everyone',
      name: '@everyone',
      color: '#94a3b8',
      position: 99,
      isDefault: true,
      permissions: [
        'send_messages', 'attach_files', 'connect_voice', 'speak_voice'
      ]
    }
  ];
}

export const initialServers: Server[] = [
  {
    id: 'server-1',
    name: 'Ana Topluluk',
    icon: '🎮',
    description: 'Resmi Discord & TeamSpeak Birleşik Ana Topluluk Sunucusu',
    isPublic: true,
    category: 'community',
    tags: ['Genel', 'Sohbet', 'Hibrit'],
    ownerId: 'usr-admin-system',
    bitrateKbps: 128,
    roles: getDefaultRoles(),
    members: [],
    channels: [
      { id: 'ch-text-genel', name: 'genel-sohbet', type: 'text', serverId: 'server-1' },
      { id: 'ch-text-duyuru', name: 'duyurular', type: 'text', serverId: 'server-1' },
      { id: 'ch-text-oyun', name: 'oyun-muhabbet', type: 'text', serverId: 'server-1' },
      { id: 'ch-text-kodlama', name: 'kodlama', type: 'text', serverId: 'server-1' },
      { id: 'ch-voice-genel', name: 'Genel Ses', type: 'voice', serverId: 'server-1' },
      { id: 'ch-voice-oyun1', name: 'Oyun Odası 1', type: 'voice', serverId: 'server-1' },
      { id: 'ch-voice-muzik', name: 'Müzik & Sohbet', type: 'voice', serverId: 'server-1' },
      { id: 'ch-voice-create-temp', name: '➕ Oda Kur (+)', type: 'voice', serverId: 'server-1', isTempCreatorChannel: true },
    ]
  },
  {
    id: 'server-2',
    name: 'TeamSpeak HQ',
    icon: '🎧',
    description: 'TeamSpeak Düşük Gecikmeli Taktik ve Dereceli Ses Odaları',
    isPublic: true,
    category: 'gaming',
    tags: ['TeamSpeak', 'Dereceli', 'Düşük Gecikme'],
    ownerId: 'usr-admin-system',
    bitrateKbps: 256,
    roles: getDefaultRoles(),
    members: [],
    afkChannelId: 'ch-voice-ts-afk',
    channels: [
      { id: 'ch-ts-genel', name: 'lobi-metin', type: 'text', serverId: 'server-2' },
      { id: 'ch-ts-taktik', name: 'taktik-paylasim', type: 'text', serverId: 'server-2' },
      { id: 'ch-voice-ts-lobi', name: 'Lobi (TS3 Düşük Gecikme)', type: 'voice', serverId: 'server-2' },
      { id: 'ch-voice-ts-dereceli', name: 'Dereceli / Ranked', type: 'voice', serverId: 'server-2' },
      { id: 'ch-voice-ts-afk', name: 'AFK / Sessiz Oda', type: 'voice', serverId: 'server-2' },
    ]
  }
];

export const initialMessages: Record<string, Message[]> = {
  'ch-text-genel': [
    {
      id: 'msg-1',
      serverId: 'server-1',
      channelId: 'ch-text-genel',
      author: {
        id: 'bot-1',
        username: 'Sistem Botu',
        avatar: '🤖'
      },
      content: 'Hoş geldiniz! Discord & TeamSpeak melezi ultra hafif sesli ve yazılı platforma bağlandınız.',
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    },
    {
      id: 'msg-2',
      serverId: 'server-1',
      channelId: 'ch-text-genel',
      author: {
        id: 'bot-1',
        username: 'Sistem Botu',
        avatar: '🤖'
      },
      content: 'Ses kanalları WebRTC ile çalışıyor! Sol panelden ses odalarına tıklayarak bağlanabilirsiniz. Mikrofon ve kulaklık kontrolleri sol altta yer alır.',
      timestamp: new Date(Date.now() - 1800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]
};
