import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { User, Server, Channel, Message, AuditLog, SystemStats, DedicatedServerInfo, IssuedLicense, StoreSettings, MessageAttachment, DirectCallState, FriendRequest, FriendUser } from '../types';

interface SocketContextType {
  socket: Socket | null;
  currentUser: User | null;
  isAuthenticated: boolean;
  servers: Server[];
  activeServer: Server | null;
  activeChannel: Channel | null;
  messages: Message[];
  onlineUsers: User[];
  connectedVoiceChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  remoteScreenStreams: Map<string, MediaStream>;
  inputMode: 'vad' | 'ptt';
  pttKey: string;
  isPttActive: boolean;

  // Friends System
  friends: FriendUser[];
  incomingFriendRequests: FriendRequest[];
  outgoingFriendRequests: FriendRequest[];
  sendFriendRequest: (targetUsername: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  acceptFriendRequest: (requestId: string) => void;
  declineFriendRequest: (requestId: string) => void;
  cancelFriendRequest: (requestId: string) => void;
  removeFriend: (targetUsername: string) => void;
  fetchFriendsData: () => void;

  // Direct Messaging & 1-on-1 Voice Calling
  activeDMUser: User | null;
  openDirectMessage: (user: User) => void;
  closeDirectMessage: () => void;
  directCall: DirectCallState | null;
  startDirectCall: (targetUser: User) => void;
  acceptDirectCall: () => void;
  declineDirectCall: () => void;
  endDirectCall: () => void;
  updateProfileDetails: (details: { statusMessage?: string; bio?: string; bannerColor?: string; avatar?: string }) => void;

  // System Announcement
  systemAnnouncement: { sender: string; message: string; timestamp: string } | null;
  dismissAnnouncement: () => void;

  // Detailed Audio Settings
  audioInputDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  inputSensitivity: number;
  inputVolume: number;
  outputVolume: number;
  isMicTesting: boolean;
  micVolumeLevel: number;

  selectServer: (serverId: string) => void;
  selectChannel: (channelId: string) => void;
  sendMessage: (content: string, attachments?: MessageAttachment[]) => void;
  joinVoiceChannel: (channelId: string) => void;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  setInputMode: (mode: 'vad' | 'ptt') => void;
  setPttKey: (key: string) => void;
  createServer: (name: string, icon?: string) => void;
  createChannel: (name: string, type: 'text' | 'voice') => void;
  updateProfile: (username: string, avatar: string) => void;

  // Auth Handlers
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { username: string; email: string; password: string; avatar: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Audio Device Handlers
  setSelectedInputDeviceId: (deviceId: string) => void;
  setSelectedOutputDeviceId: (deviceId: string) => void;
  setNoiseSuppression: (val: boolean) => void;
  setEchoCancellation: (val: boolean) => void;
  setAutoGainControl: (val: boolean) => void;
  setInputSensitivity: (val: number) => void;
  setInputVolume: (val: number) => void;
  setOutputVolume: (val: number) => void;
  toggleMicTest: () => void;
  refreshAudioDevices: () => Promise<void>;

  // Admin Dashboard Features
  adminData: {
    stats: SystemStats;
    registeredUsers: any[];
    servers: Server[];
    auditLogs: AuditLog[];
    dedicatedServers?: DedicatedServerInfo[];
    issuedLicenses?: IssuedLicense[];
    storeSettings?: StoreSettings;
  } | null;
  fetchAdminData: () => void;
  adminChangeRole: (targetUsername: string, newRole: 'admin' | 'user') => void;
  adminKickUser: (targetSocketId: string, reason?: string) => void;
  adminDeleteChannel: (serverId: string, channelId: string) => void;
  adminBroadcastAnnouncement: (message: string) => void;
  generateDedicatedLicense: (data: { licensee: string; maxSlots: number; expireDays: number; tier: 'Starter' | 'Pro' | 'Enterprise'; assignedUsername?: string }) => void;
  adminRevokeLicense: (licenseId: string, reason?: string) => void;
  adminActivateLicense: (licenseId: string) => void;
  adminExtendLicense: (licenseId: string, addDays: number) => void;
  adminUpdateStoreSettings: (settings: StoreSettings) => void;
  generatedLicense: IssuedLicense | null;
  clearGeneratedLicense: () => void;
  connectToDedicatedServer: (hostWithPort: string) => void;
  resetToMainServer: () => void;
  currentServerHost: string;

  // Store & User Licenses
  storeSettings: StoreSettings | null;
  myLicenses: IssuedLicense[];
  fetchMyLicenses: () => void;
  storePurchaseLicense: (data: {
    serverName: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }) => Promise<{ success: boolean; license?: IssuedLicense; error?: string }>;
  storeExtendLicense: (data: {
    licenseId: string;
    addDays: number;
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }) => Promise<{ success: boolean; license?: IssuedLicense; error?: string }>;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string>('');
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messagesMap, setMessagesMap] = useState<Record<string, Message[]>>({});
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [connectedVoiceChannelId, setConnectedVoiceChannelId] = useState<string | null>(null);
  const [systemAnnouncement, setSystemAnnouncement] = useState<{ sender: string; message: string; timestamp: string } | null>(null);
  const [currentServerHost, setCurrentServerHost] = useState<string>('localhost:4000');

  // Admin Dashboard State
  const [adminData, setAdminData] = useState<{
    stats: SystemStats;
    registeredUsers: any[];
    servers: Server[];
    auditLogs: AuditLog[];
    dedicatedServers?: DedicatedServerInfo[];
    issuedLicenses?: IssuedLicense[];
    storeSettings?: StoreSettings;
  } | null>(null);
  const [generatedLicense, setGeneratedLicense] = useState<IssuedLicense | null>(null);
  const [myLicenses, setMyLicenses] = useState<IssuedLicense[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Audio & Video Screen Controls
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDeafened, setIsDeafened] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState<Map<string, MediaStream>>(new Map());
  const [inputMode, setInputMode] = useState<'vad' | 'ptt'>('vad');
  const [pttKey, setPttKey] = useState<string>('Control');
  const [isPttActive, setIsPttActive] = useState<boolean>(false);

  // Advanced Audio Hardware & Processing States
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceIdState] = useState<string>('');
  const [selectedOutputDeviceId, setSelectedOutputDeviceIdState] = useState<string>('');
  const [noiseSuppression, setNoiseSuppressionState] = useState<boolean>(true);
  const [echoCancellation, setEchoCancellationState] = useState<boolean>(true);
  const [autoGainControl, setAutoGainControlState] = useState<boolean>(true);
  const [inputSensitivity, setInputSensitivity] = useState<number>(25);
  const [inputVolume, setInputVolumeState] = useState<number>(100);
  const [outputVolume, setOutputVolumeState] = useState<number>(100);
  const [isMicTesting, setIsMicTesting] = useState<boolean>(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);

  // WebRTC Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const micTestAudioRef = useRef<HTMLAudioElement | null>(null);

  // Direct Messaging & 1-on-1 Voice Calling State
  const [activeDMUser, setActiveDMUser] = useState<User | null>(null);
  const [directCall, setDirectCall] = useState<DirectCallState | null>(null);
  const directCallRef = useRef<DirectCallState | null>(null);
  const directCallTimerRef = useRef<any>(null);

  // Friends System State
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequest[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequest[]>([]);

  useEffect(() => {
    directCallRef.current = directCall;
  }, [directCall]);

  useEffect(() => {
    if (directCall?.status === 'connected') {
      directCallTimerRef.current = setInterval(() => {
        setDirectCall(prev => prev ? { ...prev, durationSeconds: prev.durationSeconds + 1 } : null);
      }, 1000);
    } else {
      if (directCallTimerRef.current) {
        clearInterval(directCallTimerRef.current);
        directCallTimerRef.current = null;
      }
    }
    return () => {
      if (directCallTimerRef.current) {
        clearInterval(directCallTimerRef.current);
      }
    };
  }, [directCall?.status]);

  // Derived state (supports virtual Direct Messages server)
  const isDMMode = activeServerId === 'direct-messages';
  const dmChannelId = (activeDMUser && currentUser)
    ? `dm-${[currentUser.id, activeDMUser.id].sort().join('-')}`
    : 'dm-general';

  const virtualDMServer: Server | null = isDMMode ? {
    id: 'direct-messages',
    name: 'Direkt Mesajlar',
    icon: '💬',
    channels: [
      {
        id: dmChannelId,
        name: activeDMUser ? activeDMUser.username : 'Sohbet',
        type: 'text',
        serverId: 'direct-messages'
      }
    ]
  } : null;

  const activeServer = isDMMode ? virtualDMServer : (servers.find(s => s.id === activeServerId) || servers[0] || null);
  const activeChannel = isDMMode
    ? virtualDMServer?.channels[0] || null
    : (activeServer?.channels.find(c => c.id === activeChannelId) || 
       activeServer?.channels.find(c => c.type === 'text') || null);
  const messages = activeChannel ? messagesMap[activeChannel.id] || [] : [];

  // Enumerate Audio Devices
  const refreshAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(d => d.kind === 'audioinput');
      const outputs = devices.filter(d => d.kind === 'audiooutput');

      setAudioInputDevices(inputs);
      setAudioOutputDevices(outputs);

      if (!selectedInputDeviceId && inputs.length > 0) {
        setSelectedInputDeviceIdState(inputs[0].deviceId);
      }
      if (!selectedOutputDeviceId && outputs.length > 0) {
        setSelectedOutputDeviceIdState(outputs[0].deviceId);
      }
    } catch (err) {
      console.warn('Ses aygıtları listelenemedi:', err);
    }
  }, [selectedInputDeviceId, selectedOutputDeviceId]);

  useEffect(() => {
    refreshAudioDevices();
    navigator.mediaDevices.ondevicechange = () => {
      refreshAudioDevices();
    };
  }, [refreshAudioDevices]);

  // Helper to get or request audio stream with current settings
  const getLocalAudioStream = async (forceNew: boolean = false): Promise<MediaStream | null> => {
    if (localStreamRef.current && !forceNew) return localStreamRef.current;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedInputDeviceId ? { exact: selectedInputDeviceId } : undefined,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      try {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioCtx();
        }

        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const gainNode = ctx.createGain();
        gainNode.gain.value = inputVolume / 100;
        gainNodeRef.current = gainNode;

        const source = ctx.createMediaStreamSource(stream);
        source.connect(gainNode);
        gainNode.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        const checkVolume = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          const normalizedLevel = Math.min(100, Math.round((average / 128) * 100));
          setMicVolumeLevel(normalizedLevel);

          const speakingThreshold = inputSensitivity * 0.7;
          const speakingNow = average > speakingThreshold && !isMuted;

          setIsSpeaking(prev => {
            if (prev !== speakingNow) {
              socket?.emit('user_speaking', { isSpeaking: speakingNow });
            }
            return speakingNow;
          });

          animationFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (err) {
        console.warn('Audio analysis setup warning:', err);
      }

      const newAudioTrack = stream.getAudioTracks()[0];
      for (const pc of peerConnectionsRef.current.values()) {
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
        if (audioSender) {
          audioSender.replaceTrack(newAudioTrack);
        }
      }

      return stream;
    } catch (err) {
      console.error('Mikrofon erişim izni alınamadı:', err);
      return null;
    }
  };

  const setSelectedInputDeviceId = async (deviceId: string) => {
    setSelectedInputDeviceIdState(deviceId);
    if (localStreamRef.current || connectedVoiceChannelId) {
      await getLocalAudioStream(true);
    }
  };

  const setSelectedOutputDeviceId = async (deviceId: string) => {
    setSelectedOutputDeviceIdState(deviceId);
    audioElementsRef.current.forEach(async (audio) => {
      if ('setSinkId' in audio) {
        try {
          await (audio as any).setSinkId(deviceId);
        } catch (e) {
          console.warn('SinkId değiştirilemedi:', e);
        }
      }
    });
  };

  const setNoiseSuppression = async (val: boolean) => {
    setNoiseSuppressionState(val);
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setEchoCancellation = async (val: boolean) => {
    setEchoCancellationState(val);
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setAutoGainControl = async (val: boolean) => {
    setAutoGainControlState(val);
    if (localStreamRef.current) await getLocalAudioStream(true);
  };

  const setInputVolume = (val: number) => {
    setInputVolumeState(val);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = val / 100;
    }
  };

  const setOutputVolume = (val: number) => {
    setOutputVolumeState(val);
    audioElementsRef.current.forEach(audio => {
      audio.volume = Math.min(1, Math.max(0, val / 100));
    });
  };

  const toggleMicTest = async () => {
    if (isMicTesting) {
      if (micTestAudioRef.current) {
        micTestAudioRef.current.pause();
        micTestAudioRef.current.srcObject = null;
        micTestAudioRef.current.remove();
        micTestAudioRef.current = null;
      }
      setIsMicTesting(false);
    } else {
      const stream = await getLocalAudioStream();
      if (!stream) return;

      const audio = new Audio();
      if ('setSinkId' in audio && selectedOutputDeviceId) {
        try {
          await (audio as any).setSinkId(selectedOutputDeviceId);
        } catch (e) {}
      }
      audio.srcObject = stream;
      audio.volume = Math.min(1, outputVolume / 100);
      audio.play().catch(e => console.warn(e));
      micTestAudioRef.current = audio;
      setIsMicTesting(true);
    }
  };

  const cleanupWebRTC = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    audioElementsRef.current.forEach(audio => {
      audio.srcObject = null;
      audio.remove();
    });
    audioElementsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    setRemoteScreenStreams(new Map());

    if (micTestAudioRef.current) {
      micTestAudioRef.current.pause();
      micTestAudioRef.current.srcObject = null;
      micTestAudioRef.current.remove();
      micTestAudioRef.current = null;
      setIsMicTesting(false);
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Initialize socket & Auto-Login
  useEffect(() => {
    const isDevVite = typeof window !== 'undefined' && window.location.port === '5173';
    const defaultHost = (!isDevVite && typeof window !== 'undefined' && window.location.host)
      ? window.location.host
      : 'localhost:4000';

    const savedHost = localStorage.getItem('dc_dedicated_server_host') || defaultHost;
    setCurrentServerHost(savedHost);
    const backendUrl = savedHost.startsWith('http://') || savedHost.startsWith('https://')
      ? savedHost
      : `${window.location.protocol}//${savedHost}`;

    let handshakeUsername = '';
    let handshakeAvatar = '🎮';
    const savedAuth = localStorage.getItem('dc_clone_auth');
    if (savedAuth) {
      try {
        const creds = JSON.parse(savedAuth);
        handshakeUsername = creds.username || '';
        handshakeAvatar = creds.avatar || '🎮';
      } catch {}
    }

    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      auth: {
        clientSignature: 'OFFICIAL_APP_CLIENT_TOKEN_V1_VERIFIED',
        username: handshakeUsername,
        avatar: handshakeAvatar
      }
    });
    setSocket(newSocket);

    newSocket.on('connect_error', (err: any) => {
      console.warn('Socket bağlantı hatası:', err?.message);
      const errMsg = err?.message || '';
      if (errMsg.includes('LİSANS_İPTAL') || errMsg.includes('LISANS_IPTAL') || errMsg.includes('YETKISIZ') || errMsg.includes('YETKİSİZ')) {
        alert(`⛔ Bağlantı Reddedildi:\n\n${errMsg}\n\nÖzel sunucunun lisansı iptal edildiği için ana sunucuya (localhost:4000) yönlendiriliyorsunuz.`);
        resetToMainServer();
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to backend:', newSocket.id);
      newSocket.emit('get_store_settings');
      newSocket.emit('get_my_licenses');
      if (savedAuth) {
        try {
          const creds = JSON.parse(savedAuth);
          newSocket.emit('auth_login', { usernameOrEmail: creds.username, password: creds.password });
        } catch {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    });

    newSocket.on('auth_response', (res: { success: boolean; user?: User; error?: string }) => {
      if (res.success && res.user) {
        setCurrentUser(res.user);
        setIsAuthenticated(true);
      } else if (res.error && (res.error.includes('LİSANS') || res.error.includes('LISANS'))) {
        alert(`⛔ Giriş Engellendi:\n\n${res.error}\n\nAna sunucuya yönlendiriliyorsunuz.`);
        resetToMainServer();
      }
    });

    newSocket.on('init_data', (data: {
      currentUser: User;
      servers: Server[];
      onlineUsers: User[];
      messages: Record<string, Message[]>;
    }) => {
      setCurrentUser(data.currentUser);
      setIsAuthenticated(data.currentUser.role === 'admin' || !!data.currentUser.email || !!savedAuth);
      setServers(data.servers);
      setOnlineUsers(data.onlineUsers);
      setMessagesMap(data.messages);

      if (data.servers.length > 0) {
        setActiveServerId(data.servers[0].id);
        const firstTextCh = data.servers[0].channels.find(c => c.type === 'text');
        if (firstTextCh) setActiveChannelId(firstTextCh.id);
      }
    });

    newSocket.on('new_message', (msg: Message) => {
      setMessagesMap(prev => ({
        ...prev,
        [msg.channelId]: [...(prev[msg.channelId] || []), msg]
      }));
    });

    newSocket.on('channel_created', ({ serverId, channel }: { serverId: string; channel: Channel }) => {
      setServers(prev => prev.map(s => {
        if (s.id === serverId) {
          return { ...s, channels: [...s.channels, channel] };
        }
        return s;
      }));
    });

    newSocket.on('channel_deleted', ({ serverId, channelId }: { serverId: string; channelId: string }) => {
      setServers(prev => prev.map(s => {
        if (s.id === serverId) {
          return { ...s, channels: s.channels.filter(c => c.id !== channelId) };
        }
        return s;
      }));
    });

    newSocket.on('server_created', (newServer: Server) => {
      setServers(prev => [...prev, newServer]);
    });

    newSocket.on('user_connected', (newUser: User) => {
      setOnlineUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
    });

    newSocket.on('user_updated', (updatedUser: User) => {
      setOnlineUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
      if (updatedUser.id === newSocket.id) {
        setCurrentUser(updatedUser);
      }
    });

    newSocket.on('voice_state_update', ({ userId, channelId, isMuted, isDeafened }: any) => {
      setOnlineUsers(prev => prev.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            currentVoiceChannelId: channelId || undefined,
            isMuted: isMuted ?? u.isMuted,
            isDeafened: isDeafened ?? u.isDeafened
          };
        }
        return u;
      }));
    });

    newSocket.on('user_speaking_change', ({ userId, isSpeaking }: { userId: string; isSpeaking: boolean }) => {
      setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, isSpeaking } : u));
    });

    newSocket.on('screen_share_change', ({ userId, isSharing }: { userId: string; isSharing: boolean }) => {
      setOnlineUsers(prev => prev.map(u => u.id === userId ? { ...u, isScreenSharing: isSharing } : u));
      if (!isSharing) {
        setRemoteScreenStreams(prev => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }
    });

    newSocket.on('user_disconnected', (disconnectedId: string) => {
      setOnlineUsers(prev => prev.filter(u => u.id !== disconnectedId));
      setRemoteScreenStreams(prev => {
        if (!prev.has(disconnectedId)) return prev;
        const next = new Map(prev);
        next.delete(disconnectedId);
        return next;
      });
      if (peerConnectionsRef.current.has(disconnectedId)) {
        peerConnectionsRef.current.get(disconnectedId)?.close();
        peerConnectionsRef.current.delete(disconnectedId);
      }
      if (audioElementsRef.current.has(disconnectedId)) {
        audioElementsRef.current.get(disconnectedId)?.remove();
        audioElementsRef.current.delete(disconnectedId);
      }
    });

    // Admin Events
    newSocket.on('admin_data_response', (data) => {
      setAdminData(data);
      if (data.storeSettings) {
        setStoreSettings(data.storeSettings);
      }
    });

    newSocket.on('store_settings_response', (settings: StoreSettings) => {
      setStoreSettings(settings);
    });

    newSocket.on('store_settings_updated', (settings: StoreSettings) => {
      setStoreSettings(settings);
      setAdminData(prev => prev ? { ...prev, storeSettings: settings } : null);
    });

    newSocket.on('dedicated_server_terminated', (data: { title: string; reason: string }) => {
      alert(`⚠️ ${data.title || 'Sunucu Lisansı İptal Edildi'}\n\n${data.reason}\n\nÖzel sunucu kapatıldığı için ana sunucuya yönlendiriliyorsunuz.`);
      resetToMainServer();
    });

    newSocket.on('admin_dedicated_updated', (updatedServer: DedicatedServerInfo) => {
      setAdminData(prev => {
        if (!prev) return null;
        const currentList = prev.dedicatedServers || [];
        const exists = currentList.some(s => s.id === updatedServer.id);
        const nextList = exists
          ? currentList.map(s => s.id === updatedServer.id ? updatedServer : s)
          : [...currentList, updatedServer];
        return { ...prev, dedicatedServers: nextList };
      });
    });

    newSocket.on('admin_dedicated_list', (servers: DedicatedServerInfo[]) => {
      setAdminData(prev => prev ? { ...prev, dedicatedServers: servers } : null);
    });

    newSocket.on('admin_license_generated', (data: IssuedLicense) => {
      setGeneratedLicense(data);
    });

    newSocket.on('admin_licenses_list', (licenses: IssuedLicense[]) => {
      setAdminData(prev => prev ? { ...prev, issuedLicenses: licenses } : null);
    });

    newSocket.on('my_licenses_response', (licenses: IssuedLicense[]) => {
      setMyLicenses(licenses);
    });

    newSocket.on('admin_new_log', (log: AuditLog) => {
      setAdminData(prev => prev ? { ...prev, auditLogs: [log, ...prev.auditLogs] } : null);
    });

    newSocket.on('system_announcement', (announcement) => {
      setSystemAnnouncement(announcement);
    });

    newSocket.on('kicked_by_admin', ({ reason }) => {
      alert(`Sunucudan atıldınız!\nSebep: ${reason}`);
      localStorage.removeItem('dc_clone_auth');
      setIsAuthenticated(false);
      window.location.reload();
    });

    // WebRTC Signaling Events
    newSocket.on('voice_room_users', async ({ peers }: { peers: User[] }) => {
      const localStream = await getLocalAudioStream();
      if (!localStream) return;

      for (const peer of peers) {
        const pc = createPeerConnection(peer.id, localStream, newSocket);
        peerConnectionsRef.current.set(peer.id, pc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        newSocket.emit('webrtc_signal', {
          targetUserId: peer.id,
          signal: offer,
          type: 'offer'
        });
      }
    });

    newSocket.on('user_joined_voice', async ({ user }: { user: User }) => {
      const localStream = await getLocalAudioStream();
      if (!localStream) return;
      const pc = createPeerConnection(user.id, localStream, newSocket);
      peerConnectionsRef.current.set(user.id, pc);
    });

    newSocket.on('user_left_voice', ({ userId }: { userId: string }) => {
      if (peerConnectionsRef.current.has(userId)) {
        peerConnectionsRef.current.get(userId)?.close();
        peerConnectionsRef.current.delete(userId);
      }
      if (audioElementsRef.current.has(userId)) {
        audioElementsRef.current.get(userId)?.remove();
        audioElementsRef.current.delete(userId);
      }
    });

    newSocket.on('webrtc_signal', async ({ senderUserId, signal, type }: any) => {
      let pc = peerConnectionsRef.current.get(senderUserId);

      if (type === 'offer') {
        const localStream = await getLocalAudioStream();
        if (!localStream) return;

        if (!pc) {
          pc = createPeerConnection(senderUserId, localStream, newSocket);
          peerConnectionsRef.current.set(senderUserId, pc);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        newSocket.emit('webrtc_signal', {
          targetUserId: senderUserId,
          signal: answer,
          type: 'answer'
        });
      } else if (type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (type === 'candidate') {
        if (pc && signal) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } catch (e) {
            console.warn('ICE candidate addition error:', e);
          }
        }
      }
    });

    // Direct 1-on-1 Voice Calling Listeners
    newSocket.on('direct_call_incoming', ({ callerUser }: { callerUser: User }) => {
      setDirectCall({
        partner: callerUser,
        status: 'incoming',
        isMuted: false,
        isDeafened: false,
        durationSeconds: 0
      });
    });

    newSocket.on('direct_call_accepted', async ({ targetUser }: { targetUser: User }) => {
      setDirectCall(prev => prev ? { ...prev, status: 'connected', partner: targetUser } : {
        partner: targetUser,
        status: 'connected',
        isMuted: false,
        isDeafened: false,
        durationSeconds: 0
      });

      const localStream = await getLocalAudioStream();
      if (localStream) {
        const pc = createPeerConnection(targetUser.id, localStream, newSocket);
        peerConnectionsRef.current.set(targetUser.id, pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        newSocket.emit('webrtc_signal', {
          targetUserId: targetUser.id,
          signal: offer,
          type: 'offer'
        });
      }
    });

    newSocket.on('direct_call_declined', ({ reason }: { reason?: string }) => {
      alert(reason || 'Arama reddedildi.');
      setDirectCall(null);
    });

    newSocket.on('direct_call_ended', () => {
      if (directCallRef.current) {
        const partnerId = directCallRef.current.partner.id;
        if (peerConnectionsRef.current.has(partnerId)) {
          peerConnectionsRef.current.get(partnerId)?.close();
          peerConnectionsRef.current.delete(partnerId);
        }
        if (audioElementsRef.current.has(partnerId)) {
          audioElementsRef.current.get(partnerId)?.remove();
          audioElementsRef.current.delete(partnerId);
        }
      }
      setDirectCall(null);
    });

    newSocket.on('profile_updated', (updatedUser: User) => {
      setCurrentUser(updatedUser);
    });

    // Friends System Listeners
    newSocket.on('friends_data', (data: { friends: FriendUser[]; incomingRequests: FriendRequest[]; outgoingRequests: FriendRequest[] }) => {
      setFriends(data.friends || []);
      setIncomingFriendRequests(data.incomingRequests || []);
      setOutgoingFriendRequests(data.outgoingRequests || []);
    });

    newSocket.on('friend_request_received', (req: FriendRequest) => {
      setIncomingFriendRequests(prev => [req, ...prev.filter(r => r.id !== req.id)]);
    });

    newSocket.on('friend_request_accepted', () => {
      newSocket.emit('get_friends_data');
    });

    return () => {
      cleanupWebRTC();
      newSocket.disconnect();
    };
  }, [cleanupWebRTC]);

  const createPeerConnection = (peerId: string, localStream: MediaStream, activeSocket: Socket): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => pc.addTrack(track, screenStreamRef.current!));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        activeSocket.emit('webrtc_signal', {
          targetUserId: peerId,
          signal: event.candidate,
          type: 'candidate'
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        const stream = event.streams[0];
        setRemoteScreenStreams(prev => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      } else {
        let audio = audioElementsRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioElementsRef.current.set(peerId, audio);
        }
        audio.srcObject = event.streams[0];
        audio.muted = isDeafened;
        audio.volume = Math.min(1, Math.max(0, outputVolume / 100));
        if ('setSinkId' in audio && selectedOutputDeviceId) {
          (audio as any).setSinkId(selectedOutputDeviceId).catch(() => {});
        }
      }
    };

    return pc;
  };

  // Push-to-Talk Keybind listener
  useEffect(() => {
    if (inputMode !== 'ptt' || !connectedVoiceChannelId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === pttKey && !isPttActive) {
        setIsPttActive(true);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = !isMuted));
        }
        socket?.emit('user_speaking', { isSpeaking: true });
        setIsSpeaking(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === pttKey && isPttActive) {
        setIsPttActive(false);
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = false));
        }
        socket?.emit('user_speaking', { isSpeaking: false });
        setIsSpeaking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [inputMode, pttKey, isPttActive, connectedVoiceChannelId, isMuted, socket]);

  // Auth Methods
  const login = (usernameOrEmail: string, password: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'Sunucu yanıt vermedi (Zaman aşımı). Lütfen sunucunun açık olduğundan emin olun.' });
        }
      }, 5000);

      socket.emit('auth_login', { usernameOrEmail, password });
      socket.once('auth_response', (res: { success: boolean; user?: User; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({ username: usernameOrEmail, password, avatar: res.user.avatar }));
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          resolve({ success: true });
        } else {
          resolve({ success: false, error: res.error || 'Giriş başarısız oldu.' });
        }
      });
    });
  };

  const register = (data: { username: string; email: string; password: string; avatar: string }): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'Sunucu yanıt vermedi (Zaman aşımı). Lütfen sunucunun açık olduğundan emin olun.' });
        }
      }, 5000);

      socket.emit('auth_register', data);
      socket.once('auth_response', (res: { success: boolean; user?: User; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        if (res.success && res.user) {
          localStorage.setItem('dc_clone_auth', JSON.stringify({ username: data.username, password: data.password, avatar: data.avatar }));
          setCurrentUser(res.user);
          setIsAuthenticated(true);
          resolve({ success: true });
        } else {
          resolve({ success: false, error: res.error || 'Kayıt başarısız oldu.' });
        }
      });
    });
  };

  const logout = () => {
    localStorage.removeItem('dc_clone_auth');
    socket?.emit('auth_logout');
    setIsAuthenticated(false);
    setCurrentUser(null);
    cleanupWebRTC();
  };

  // Admin Methods
  const fetchAdminData = async () => {
    socket?.emit('admin_request_data');

    // Also fetch dedicated server registry & master licenses directly from master server
    try {
      const [resDed, resLic, resStore] = await Promise.all([
        fetch('http://127.0.0.1:4000/api/dedicated/list').catch(() => null),
        fetch('http://127.0.0.1:4000/api/master/licenses').catch(() => null),
        fetch('http://127.0.0.1:4000/api/master/store-settings').catch(() => null)
      ]);

      if (resStore && resStore.ok) {
        const storeJson = await resStore.json();
        setStoreSettings(storeJson);
      }

      let extraLicenses: IssuedLicense[] = [];
      if (resLic && resLic.ok) {
        const licJson = await resLic.json();
        if (licJson.licenses) {
          extraLicenses = licJson.licenses;
        }
      }

      if (resDed && resDed.ok) {
        const json: any = await resDed.json();
        if (json.servers) {
          setAdminData(prev => {
            if (!prev) {
              return {
                stats: {
                  uptime: 0,
                  memoryMB: 0,
                  totalRegisteredUsers: 0,
                  activeSocketsCount: 0,
                  activeVoiceRoomsCount: 0,
                  totalMessagesCount: 0,
                  totalDedicatedServersCount: json.total
                },
                registeredUsers: [],
                servers: [],
                auditLogs: [],
                dedicatedServers: json.servers,
                issuedLicenses: extraLicenses
              };
            }
            return {
              ...prev,
              dedicatedServers: json.servers,
              issuedLicenses: (prev.issuedLicenses && prev.issuedLicenses.length > 0) ? prev.issuedLicenses : extraLicenses,
              stats: {
                ...prev.stats,
                totalDedicatedServersCount: json.total
              }
            };
          });
        }
      }
    } catch {}
  };

  const adminChangeRole = (targetUsername: string, newRole: 'admin' | 'user') => {
    socket?.emit('admin_change_role', { targetUsername, newRole });
  };

  const adminKickUser = (targetSocketId: string, reason?: string) => {
    socket?.emit('admin_kick_user', { targetSocketId, reason });
  };

  const adminDeleteChannel = (serverId: string, channelId: string) => {
    socket?.emit('admin_delete_channel', { serverId, channelId });
  };

  const adminBroadcastAnnouncement = (message: string) => {
    socket?.emit('admin_broadcast_announcement', { message });
  };

  const generateDedicatedLicense = (data: {
    licensee: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    assignedUsername?: string;
  }) => {
    socket?.emit('admin_generate_license', data);
  };

  const adminRevokeLicense = (licenseId: string, reason?: string) => {
    socket?.emit('admin_revoke_license', { licenseId, reason });
  };

  const adminActivateLicense = (licenseId: string) => {
    socket?.emit('admin_activate_license', { licenseId });
  };

  const adminExtendLicense = (licenseId: string, addDays: number) => {
    socket?.emit('admin_extend_license', { licenseId, addDays });
  };

  const adminUpdateStoreSettings = (settings: StoreSettings) => {
    socket?.emit('admin_update_store_settings', settings);
  };

  const fetchMyLicenses = async () => {
    socket?.emit('get_my_licenses');

    if (currentUser?.username) {
      try {
        const res = await fetch(`http://127.0.0.1:4000/api/master/user-licenses?username=${encodeURIComponent(currentUser.username)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.licenses && json.licenses.length > 0) {
            setMyLicenses(json.licenses);
          }
        }
      } catch {}
    }
  };

  const storePurchaseLicense = (data: {
    serverName: string;
    maxSlots: number;
    expireDays: number;
    tier: 'Starter' | 'Pro' | 'Enterprise';
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }): Promise<{ success: boolean; license?: IssuedLicense; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 6000);

      socket.emit('store_purchase_license', data);
      socket.once('store_purchase_response', (res: { success: boolean; license?: IssuedLicense; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  };

  const storeExtendLicense = (data: {
    licenseId: string;
    addDays: number;
    paymentMethod?: 'wallet' | 'credit_card' | 'bank_transfer' | 'crypto';
  }): Promise<{ success: boolean; license?: IssuedLicense; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });

      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 6000);

      socket.emit('store_extend_license', data);
      socket.once('store_extend_response', (res: { success: boolean; license?: IssuedLicense; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  };

  const clearGeneratedLicense = () => {
    setGeneratedLicense(null);
  };

  const connectToDedicatedServer = (hostWithPort: string) => {
    const cleanHost = hostWithPort.replace(/^https?:\/\//, '').trim();
    if (!cleanHost) return;
    localStorage.setItem('dc_dedicated_server_host', cleanHost);
    setCurrentServerHost(cleanHost);
    cleanupWebRTC();
    window.location.reload();
  };

  const resetToMainServer = () => {
    localStorage.removeItem('dc_dedicated_server_host');
    setCurrentServerHost('localhost:4000');
    cleanupWebRTC();
    window.location.reload();
  };

  const dismissAnnouncement = () => {
    setSystemAnnouncement(null);
  };

  // Direct Messaging Handlers
  const openDirectMessage = useCallback((user: User) => {
    setActiveDMUser(user);
    setActiveServerId('direct-messages');
    if (currentUser) {
      const dmId = `dm-${[currentUser.id, user.id].sort().join('-')}`;
      setActiveChannelId(dmId);
    }
  }, [currentUser]);

  const closeDirectMessage = useCallback(() => {
    setActiveDMUser(null);
    if (servers[0]) {
      setActiveServerId(servers[0].id);
      const firstTextChannel = servers[0].channels.find(c => c.type === 'text');
      if (firstTextChannel) {
        setActiveChannelId(firstTextChannel.id);
      }
    }
  }, [servers]);

  const startDirectCall = useCallback(async (targetUser: User) => {
    if (!socket || !currentUser) return;
    setDirectCall({
      partner: targetUser,
      status: 'calling',
      isMuted: false,
      isDeafened: false,
      durationSeconds: 0
    });
    socket.emit('direct_call_start', { targetUserId: targetUser.id });
  }, [socket, currentUser]);

  const acceptDirectCall = useCallback(async () => {
    if (!socket || !directCall || !currentUser) return;
    const partner = directCall.partner;
    socket.emit('direct_call_accept', { callerUserId: partner.id });

    setDirectCall(prev => prev ? { ...prev, status: 'connected' } : null);

    const localStream = await getLocalAudioStream();
    if (localStream) {
      const pc = createPeerConnection(partner.id, localStream, socket);
      peerConnectionsRef.current.set(partner.id, pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc_signal', {
        targetUserId: partner.id,
        signal: offer,
        type: 'offer'
      });
    }
  }, [socket, directCall, currentUser]);

  const declineDirectCall = useCallback(() => {
    if (!socket || !directCall) return;
    socket.emit('direct_call_decline', { callerUserId: directCall.partner.id });
    setDirectCall(null);
  }, [socket, directCall]);

  const endDirectCall = useCallback(() => {
    if (!socket || !directCall) return;
    socket.emit('direct_call_end', { targetUserId: directCall.partner.id });
    if (peerConnectionsRef.current.has(directCall.partner.id)) {
      peerConnectionsRef.current.get(directCall.partner.id)?.close();
      peerConnectionsRef.current.delete(directCall.partner.id);
    }
    if (audioElementsRef.current.has(directCall.partner.id)) {
      audioElementsRef.current.get(directCall.partner.id)?.remove();
      audioElementsRef.current.delete(directCall.partner.id);
    }
    setDirectCall(null);
  }, [socket, directCall]);

  const updateProfileDetails = useCallback(({ statusMessage, bio, bannerColor, avatar }: { statusMessage?: string; bio?: string; bannerColor?: string; avatar?: string }) => {
    if (!socket) return;
    socket.emit('update_profile', { statusMessage, bio, bannerColor, avatar });
  }, [socket]);

  // Friends System Handlers
  const fetchFriendsData = useCallback(() => {
    socket?.emit('get_friends_data');
  }, [socket]);

  const sendFriendRequest = useCallback((targetUsername: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    return new Promise((resolve) => {
      if (!socket) return resolve({ success: false, error: 'Sunucuya bağlı değil.' });
      let answered = false;
      const timer = setTimeout(() => {
        if (!answered) {
          answered = true;
          resolve({ success: false, error: 'İşlem zaman aşımına uğradı.' });
        }
      }, 5000);

      socket.emit('send_friend_request', { targetUsername });
      socket.once('friend_request_response', (res: { success: boolean; message?: string; error?: string }) => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(res);
      });
    });
  }, [socket]);

  const acceptFriendRequest = useCallback((requestId: string) => {
    socket?.emit('accept_friend_request', { requestId });
  }, [socket]);

  const declineFriendRequest = useCallback((requestId: string) => {
    socket?.emit('decline_friend_request', { requestId });
  }, [socket]);

  const cancelFriendRequest = useCallback((requestId: string) => {
    socket?.emit('cancel_friend_request', { requestId });
  }, [socket]);

  const removeFriend = useCallback((targetUsername: string) => {
    socket?.emit('remove_friend', { targetUsername });
  }, [socket]);

  // Action Handlers
  const selectServer = (serverId: string) => {
    if (serverId !== 'direct-messages') {
      setActiveDMUser(null);
    }
    setActiveServerId(serverId);
    const server = servers.find(s => s.id === serverId);
    if (server) {
      const firstTextCh = server.channels.find(c => c.type === 'text');
      if (firstTextCh) setActiveChannelId(firstTextCh.id);
    }
  };

  const selectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
  };

  const sendMessage = (content: string, attachments?: MessageAttachment[]) => {
    if (!socket || !activeServer || !activeChannel) return;
    socket.emit('send_message', {
      serverId: activeServer.id,
      channelId: activeChannel.id,
      content,
      attachments
    });
  };

  const joinVoiceChannel = async (channelId: string) => {
    if (!socket) return;
    if (connectedVoiceChannelId === channelId) return;

    cleanupWebRTC();
    setConnectedVoiceChannelId(channelId);
    socket.emit('join_voice', { channelId });
  };

  const leaveVoiceChannel = () => {
    if (!socket || !connectedVoiceChannelId) return;
    cleanupWebRTC();
    socket.emit('leave_voice');
    setConnectedVoiceChannelId(null);
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }

    socket?.emit('update_user_state', { isMuted: nextMuted });
  };

  const toggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);

    audioElementsRef.current.forEach(audio => {
      audio.muted = nextDeafened;
    });

    if (nextDeafened && !isMuted) {
      toggleMute();
    }

    socket?.emit('update_user_state', { isDeafened: nextDeafened });
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false
      });
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);
      socket?.emit('screen_share_status', { isSharing: true });

      const videoTrack = stream.getVideoTracks()[0];
      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        pc.addTrack(videoTrack, stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('webrtc_signal', {
          targetUserId: peerId,
          signal: offer,
          type: 'offer'
        });
      }

      videoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn('Ekran paylaşımı iptal edildi veya izin verilmedi:', err);
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setScreenStream(null);
    setIsScreenSharing(false);
    socket?.emit('screen_share_status', { isSharing: false });
  };

  const createServer = (name: string, icon?: string) => {
    if (!socket || !name.trim()) return;
    socket.emit('create_server', { name: name.trim(), icon });
  };

  const createChannel = (name: string, type: 'text' | 'voice') => {
    if (!socket || !activeServer || !name.trim()) return;
    socket.emit('create_channel', {
      serverId: activeServer.id,
      name: name.trim(),
      type
    });
  };

  const updateProfile = (username: string, avatar: string) => {
    if (!socket) return;
    socket.emit('update_user_state', { username, avatar });
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        currentUser,
        isAuthenticated,
        servers,
        activeServer,
        activeChannel,
        messages,
        onlineUsers,
        connectedVoiceChannelId,
        isMuted,
        isDeafened,
        isSpeaking,
        isScreenSharing,
        screenStream,
        remoteScreenStreams,
        inputMode,
        pttKey,
        isPttActive,

        // Friends System
        friends,
        incomingFriendRequests,
        outgoingFriendRequests,
        sendFriendRequest,
        acceptFriendRequest,
        declineFriendRequest,
        cancelFriendRequest,
        removeFriend,
        fetchFriendsData,

        // Direct Messaging & 1-on-1 Voice Calling
        activeDMUser,
        openDirectMessage,
        closeDirectMessage,
        directCall,
        startDirectCall,
        acceptDirectCall,
        declineDirectCall,
        endDirectCall,
        updateProfileDetails,

        // System Announcement
        systemAnnouncement,
        dismissAnnouncement,

        // Detailed Audio Settings
        audioInputDevices,
        audioOutputDevices,
        selectedInputDeviceId,
        selectedOutputDeviceId,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        inputSensitivity,
        inputVolume,
        outputVolume,
        isMicTesting,
        micVolumeLevel,

        selectServer,
        selectChannel,
        sendMessage,
        joinVoiceChannel,
        leaveVoiceChannel,
        toggleMute,
        toggleDeafen,
        startScreenShare,
        stopScreenShare,
        setInputMode,
        setPttKey,
        createServer,
        createChannel,
        updateProfile,

        // Auth
        login,
        register,
        logout,

        // Audio Device Handlers
        setSelectedInputDeviceId,
        setSelectedOutputDeviceId,
        setNoiseSuppression,
        setEchoCancellation,
        setAutoGainControl,
        setInputSensitivity,
        setInputVolume,
        setOutputVolume,
        toggleMicTest,
        refreshAudioDevices,

        // Admin Dashboard
        adminData,
        fetchAdminData,
        adminChangeRole,
        adminKickUser,
        adminDeleteChannel,
        adminBroadcastAnnouncement,
        generateDedicatedLicense,
        adminRevokeLicense,
        adminActivateLicense,
        adminExtendLicense,
        adminUpdateStoreSettings,
        generatedLicense,
        clearGeneratedLicense,
        connectToDedicatedServer,
        resetToMainServer,
        currentServerHost,

        // Store & User Licenses
        storeSettings,
        myLicenses,
        fetchMyLicenses,
        storePurchaseLicense,
        storeExtendLicense,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
