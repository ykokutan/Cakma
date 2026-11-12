import { Server, Message } from './types.js';

export const initialServers: Server[] = [
  {
    id: 'server-1',
    name: 'Ana Topluluk',
    icon: '🎮',
    channels: [
      { id: 'ch-text-genel', name: 'genel-sohbet', type: 'text', serverId: 'server-1' },
      { id: 'ch-text-duyuru', name: 'duyurular', type: 'text', serverId: 'server-1' },
      { id: 'ch-text-oyun', name: 'oyun-muhabbet', type: 'text', serverId: 'server-1' },
      { id: 'ch-text-kodlama', name: 'kodlama', type: 'text', serverId: 'server-1' },
      { id: 'ch-voice-genel', name: 'Genel Ses', type: 'voice', serverId: 'server-1' },
      { id: 'ch-voice-oyun1', name: 'Oyun Odası 1', type: 'voice', serverId: 'server-1' },
      { id: 'ch-voice-muzik', name: 'Müzik & Sohbet', type: 'voice', serverId: 'server-1' },
    ]
  },
  {
    id: 'server-2',
    name: 'TeamSpeak HQ',
    icon: '🎧',
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
        id: 'user-demo',
        username: 'Ahmet (Geliştirici)',
        avatar: '🚀'
      },
      content: 'Ses kanalları WebRTC ile çalışıyor! Sol panelden ses odalarına tıklayarak bağlanabilirsiniz. Mikrofon ve kulaklık kontrolleri sol altta.',
      timestamp: new Date(Date.now() - 1800000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]
};
