import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { useSocket } from '../context/SocketContext';
import { useChat } from '../context/ChatContext';
import { useTypingUsers, useDirectCallQuality } from '../context/PresenceStore';
import { isSameUser, isUserServerOwner } from '../utils/serverIdentity';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { CodeBlock } from './CodeBlock';
import { AvatarView } from './AvatarView';
import { InlineMarkdown, SLASH_COMMANDS } from './chat/MessageTextRenderer';
import { LinkPreviewCard } from './chat/LinkPreviewCard';
import { OfflineQueueBanner } from './chat/OfflineQueueBanner';
import { MessageSkeletonList } from './chat/MessageSkeletonList';
import { extractMessageEpochMs, formatDateDividerLabel, getLocalDayKey } from '../utils/chatDateHelpers';
import { isE2eeCiphertext, encryptDmMessage, decryptDmMessage } from '../utils/e2ee';
import { t } from '../utils/i18n';
import { uploadAttachmentFile, uploadDataUrlAttachment } from '../utils/uploadAttachment';
import { resolveMediaUrl } from '../utils/authFetch';
import { appConfirm, appToast } from '../utils/appDialogs';
import { ChatLightbox } from './ChatLightbox';
import { getDraft, setDraft, clearDraft } from '../utils/channelDrafts';
import { computeVirtualWindow } from '../utils/virtualWindow';
import { classifyConnectionQuality, formatCallDuration } from '../utils/remoteAssistHelpers';

const VoiceRoomArea = lazy(() => import('./VoiceRoomArea').then((m) => ({ default: m.VoiceRoomArea })));
const FriendsDashboard = lazy(() => import('./FriendsDashboard').then((m) => ({ default: m.FriendsDashboard })));
const PollModal = lazy(() => import('./PollModal').then((m) => ({ default: m.PollModal })));
const PinnedMessagesModal = lazy(() => import('./PinnedMessagesModal').then((m) => ({ default: m.PinnedMessagesModal })));
const GifPickerModal = lazy(() => import('./GifPickerModal').then((m) => ({ default: m.GifPickerModal })));
const ChannelMediaModal = lazy(() => import('./ChannelMediaModal').then((m) => ({ default: m.ChannelMediaModal })));
const LeaderboardModal = lazy(() => import('./LeaderboardModal').then((m) => ({ default: m.LeaderboardModal })));
const MiniGamesModal = lazy(() => import('./MiniGamesModal').then((m) => ({ default: m.MiniGamesModal })));
const AdvancedSearchModal = lazy(() => import('./AdvancedSearchModal').then((m) => ({ default: m.AdvancedSearchModal })));
const ThreadPanel = lazy(() => import('./ThreadPanel').then((m) => ({ default: m.ThreadPanel })));
const RemoteAssistModal = lazy(() => import('./RemoteAssistModal').then((m) => ({ default: m.RemoteAssistModal })));
const GlobalInboxModal = lazy(() => import('./GlobalInboxModal').then((m) => ({ default: m.GlobalInboxModal })));
const ServerEventsModal = lazy(() => import('./ServerEventsModal').then((m) => ({ default: m.ServerEventsModal })));
const E2eeSafetyModal = lazy(() => import('./chat/E2eeSafetyModal').then((m) => ({ default: m.E2eeSafetyModal })));
import {
  DirectScreenShareOptions,
  MessageAttachment,
  RemoteAssistPermissions,
  User,
} from '../types';
import {
  Hash,
  Bell,
  Pin,
  Users,
  Search,
  Plus,
  Smile,
  ArrowUp,
  X,
  FileText,
  Download,
  Phone,
  PhoneOff,
  MessageCircle,
  BarChart2,
  Clock,
  Mic,
  MicOff,
  Headphones,
  Volume2,
  Sparkles,
  Image as ImageIcon,
  Trophy,
  Gamepad2,
  Tag,
  Edit2,
  Trash2,
  Copy,
  Check,
  CornerUpLeft,
  ArrowDown,
  Menu,
  MessageSquare,
  MonitorUp,
  MonitorOff,
  MousePointerClick,
  ChevronUp,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  Maximize2,
  Hand,
  Video,
  VideoOff,
  Bookmark,
  Camera,
  Inbox,
  Calendar,
  Lock,
  Compass,
  Wifi,
  Pause,
  Play,
  PanelLeftClose,
  PanelLeftOpen,
  BellOff,
  LayoutGrid,
  MoreHorizontal,
} from 'lucide-react';

interface ChatAreaProps {
  onToggleMembers: () => void;
  showMembers: boolean;
  isChannelsCollapsed?: boolean;
  onToggleChannelsCollapsed?: () => void;
  onOpenProfile: (user: User) => void;
  onOpenMobileNav?: () => void;
  onOpenExplore?: () => void;
  onOpenCreateServer?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  onToggleMembers,
  showMembers,
  isChannelsCollapsed = false,
  onToggleChannelsCollapsed,
  onOpenProfile,
  onOpenMobileNav,
  onOpenExplore,
  onOpenCreateServer,
}) => {
  const {
    activeServer,
    activeChannel,
    messages,
    sendMessage,
    currentUser,
    currentServerHost,
    activeDMUser,
    startDirectCall,
    directCall,
    acceptDirectCall,
    declineDirectCall,
    endDirectCall,
    isMuted,
    isDeafened,
    isSpeaking,
    toggleMute,
    toggleDeafen,
    isDirectScreenSharing,
    partnerDirectScreenSharing,
    isDirectCameraOn,
    partnerDirectCameraOn,
    toggleDirectCamera,
    lastClipboardNotice,
    remoteScreenStreams,
    remoteCameraStreams,
    localDirectCameraStream,
    userVolumes,
    setUserVolume,
    remoteAssist,
    startDirectScreenShare,
    stopDirectScreenShare,
    respondRemoteAssist,
    pauseRemoteAssist,
    updateRemoteAssistPermissions,
    stopRemoteAssist,
    onlineUsers,
    addReaction,
    togglePinMessage,
    createPoll,
    votePoll,
    updateChannelNotice,
    editMessage,
    deleteMessage,
    sendTyping,
    chatFontSize,
    messageDensity,
    chatLayout,
    notificationPrefs,
    setTargetNotificationPref,
    clearChannelMessages,
    createServerInvite,
    showLinkPreviews,
    bookmarkedMessages,
    toggleBookmarkMessage,
    addReminder,
    dmReadReceipts,
    markDmRead,
    markChannelRead,
    unreadCounts,
    language,
    hasMoreMessages,
    isLoadingOlderMessages,
    requestOlderMessages,
  } = useSocket();
  const activeChannelTypers = useTypingUsers(activeChannel?.id);
  const directCallQuality = useDirectCallQuality();
  const { pendingJumpTarget, clearPendingJumpTarget, jumpToMessage } = useChat();

  const [activeThreadMsgId, setActiveThreadMsgId] = useState<string | null>(null);
  const [isCallStageCollapsed, setIsCallStageCollapsed] = useState(false);
  const [isDMRemoteAssistOpen, setIsDMRemoteAssistOpen] = useState(false);
  const [showDmShareOptions, setShowDmShareOptions] = useState(false);
  const [dmShareOptions, setDmShareOptions] = useState<DirectScreenShareOptions>({
    preset: 'balanced',
    shareAudio: false,
  });
  const [dmConsentPerms, setDmConsentPerms] = useState<RemoteAssistPermissions>({
    control: true,
    clipboard: true,
    annotate: true,
  });
  const [dmE2eeEnabled, setDmE2eeEnabled] = useState(false);
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false);
  const [decryptedDmMap, setDecryptedDmMap] = useState<Record<string, string>>({});
  const dmScreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const localCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const partnerCamVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeThreadMessage = activeThreadMsgId ? messages.find((m) => m.id === activeThreadMsgId) || null : null;

  const [initialUnreadDividerCount, setInitialUnreadDividerCount] = useState(0);
  const unreadCountsRef = useRef(unreadCounts);
  unreadCountsRef.current = unreadCounts;

  useEffect(() => {
    if (!activeChannel?.id) {
      setInitialUnreadDividerCount(0);
      return;
    }
    setInitialUnreadDividerCount(unreadCountsRef.current[activeChannel.id] || 0);
  }, [activeChannel?.id]);

  useEffect(() => {
    if (activeServer?.id === 'direct-messages' && activeDMUser?.username) {
      markDmRead(activeDMUser.username);
    }
  }, [activeServer?.id, activeDMUser?.username, messages.length, markDmRead]);

  useEffect(() => {
    if (activeChannel?.id && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.id) {
        markChannelRead(activeChannel.id, lastMsg.id);
      }
    }
  }, [activeChannel?.id, messages, markChannelRead]);

  const lastMyMessageId = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].author?.username === currentUser?.username) {
        return messages[i].id;
      }
    }
    return null;
  }, [messages, currentUser?.username]);

  useEffect(() => {
    if (activeServer?.id !== 'direct-messages' || !currentUser?.username) return;
    const peerPub =
      activeDMUser?.e2eePublicKey ||
      onlineUsers.find((u) => u.id === activeDMUser?.id || u.username === activeDMUser?.username)?.e2eePublicKey;
    if (!peerPub) return;
    const encryptedMsgs = messages.filter((m) => isE2eeCiphertext(m.content) && !decryptedDmMap[m.id]);
    if (encryptedMsgs.length === 0) return;
    let cancelled = false;
    Promise.all(
      encryptedMsgs.map(async (m) => {
        const plain = await decryptDmMessage(m.content, currentUser.username, peerPub);
        return plain !== null ? ([m.id, plain] as const) : null;
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const item of results) {
        if (item) updates[item[0]] = item[1];
      }
      if (Object.keys(updates).length > 0) {
        setDecryptedDmMap((prev) => ({ ...prev, ...updates }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeServer?.id, activeDMUser, onlineUsers, currentUser?.username, messages, decryptedDmMap]);

  const dmCallPartnerStream = directCall?.partner?.id
    ? remoteScreenStreams.get(directCall.partner.id)
    : undefined;
  const dmPartnerCameraStream = directCall?.partner?.id
    ? remoteCameraStreams.get(directCall.partner.id)
    : undefined;

  useEffect(() => {
    if (dmScreenVideoRef.current && dmCallPartnerStream) {
      dmScreenVideoRef.current.srcObject = dmCallPartnerStream;
    }
  }, [dmCallPartnerStream, isCallStageCollapsed]);

  useEffect(() => {
    if (localCamVideoRef.current && localDirectCameraStream) {
      localCamVideoRef.current.srcObject = localDirectCameraStream;
    }
  }, [localDirectCameraStream, isDirectCameraOn, isCallStageCollapsed]);

  useEffect(() => {
    if (partnerCamVideoRef.current && dmPartnerCameraStream) {
      partnerCamVideoRef.current.srcObject = dmPartnerCameraStream;
    }
  }, [dmPartnerCameraStream, partnerDirectCameraOn, isCallStageCollapsed]);

  useEffect(() => {
    if (remoteAssist.status === 'incoming_request' && remoteAssist.requestedPermissions) {
      setDmConsentPerms(remoteAssist.requestedPermissions);
    }
  }, [remoteAssist.status, remoteAssist.requestedPermissions]);

  useEffect(() => {
    if (remoteAssist.status === 'controlling') {
      setIsDMRemoteAssistOpen(true);
    }
  }, [remoteAssist.status]);

  const activeDraftKey = activeChannel?.id || (activeDMUser ? `dm:${activeDMUser.username.toLowerCase()}` : null);
  const [inputText, setInputText] = useState(() => getDraft(activeDraftKey));
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState<{ top: number; height: number }>({ top: 0, height: 600 });
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isBookmarksModalOpen, setIsBookmarksModalOpen] = useState(false);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [isGlobalInboxOpen, setIsGlobalInboxOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [visibleMsgCount, setVisibleMsgCount] = useState(80);

  useEffect(() => {
    setVisibleMsgCount(80);
    setInputText(getDraft(activeDraftKey));
    setEditingMsgId(null);
  }, [activeDraftKey]);
  const [slowmodeRemaining, setSlowmodeRemaining] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isChatMiniGamesOpen, setIsChatMiniGamesOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [noticeEditText, setNoticeEditText] = useState('');
  const [topicEditText, setTopicEditText] = useState('');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string; content: string } | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [pendingNewBelow, setPendingNewBelow] = useState(0);
  const [isNotifMenuOpen, setIsNotifMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [openActionMsgId, setOpenActionMsgId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const showScrollBottomRef = useRef(false);
  showScrollBottomRef.current = showScrollBottom;

  useEffect(() => {
    if (!isNotifMenuOpen && !isToolsMenuOpen && !openActionMsgId) return;
    const handleClose = () => {
      setIsNotifMenuOpen(false);
      setIsToolsMenuOpen(false);
      setOpenActionMsgId(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('click', handleClose);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isNotifMenuOpen, isToolsMenuOpen, openActionMsgId]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [inputText]);

  const EMOJI_GROUPS = [
    { label: 'Popüler', emojis: ['😊', '😂', '❤️', '🔥', '👍', '🎉', '🙌', '😎', '🤔', '👀', '💀', '💯'] },
    { label: 'İfadeler', emojis: ['😁', '😅', '🤣', '😍', '🥰', '🤩', '🥳', '😭', '😡', '🤯', '😴', '🙏'] },
    { label: 'Oyun & Teknoloji', emojis: ['🎮', '🎧', '🎤', '💻', '🚀', '⚡', '🏆', '🥇', '💎', '🛡️', '⚔️', '🎲'] },
  ];

  const handleCopyMessage = (msgId: string, content: string) => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => {
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    }).catch(() => {});
  };

  const handleMessagesScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const awayFromBottom = distFromBottom > 220;
    setShowScrollBottom(awayFromBottom);
    if (distFromBottom <= 80) {
      setPendingNewBelow(0);
    }
    setScrollMetrics({ top: el.scrollTop, height: el.clientHeight || 600 });
  };

  const focusAndHighlightMessage = (messageId: string) => {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      const hiddenDistance = messages.length - idx;
      if (hiddenDistance > visibleMsgCount) {
        setVisibleMsgCount(hiddenDistance + 25);
      }
      const elContainer = scrollContainerRef.current;
      if (elContainer && hiddenDistance > 0) {
        const displayIdx = Math.max(0, idx - Math.max(0, messages.length - Math.max(visibleMsgCount, hiddenDistance + 25)));
        const estTop = Math.max(0, displayIdx * 78 - 180);
        elContainer.scrollTop = estTop;
        setScrollMetrics({ top: estTop, height: elContainer.clientHeight || 600 });
      }
    }

    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      const el = document.getElementById(`message-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 110);
    window.setTimeout(() => {
      setHighlightedMessageId(null);
    }, 3000);
  };

  useEffect(() => {
    if (!pendingJumpTarget || !activeChannel?.id) return;
    if (pendingJumpTarget.channelId !== activeChannel.id) return;
    if (!messages.some((m) => m.id === pendingJumpTarget.messageId)) return;
    focusAndHighlightMessage(pendingJumpTarget.messageId);
    clearPendingJumpTarget();
  }, [pendingJumpTarget, activeChannel?.id, messages, clearPendingJumpTarget]);

  const handleJumpToMessage = (messageId: string, targetChannelId?: string) => {
    const chId = targetChannelId || activeChannel?.id || '';
    if (chId && (chId !== activeChannel?.id || !messages.some((m) => m.id === messageId))) {
      void jumpToMessage(chId, messageId);
      return;
    }
    focusAndHighlightMessage(messageId);
  };

  // Voice note recording states
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordSeconds, setVoiceRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceRecordIntervalRef = useRef<any>(null);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start(100);
      setIsVoiceRecording(true);
      setVoiceRecordSeconds(0);
      voiceRecordIntervalRef.current = setInterval(() => {
        setVoiceRecordSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      appToast('Mikrofon erişimi sağlanamadı.', 'error');
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (voiceRecordIntervalRef.current) clearInterval(voiceRecordIntervalRef.current);
    setIsVoiceRecording(false);
    setVoiceRecordSeconds(0);
    audioChunksRef.current = [];
  };

  const finishVoiceRecording = () => {
    if (!mediaRecorderRef.current) return;
    if (voiceRecordIntervalRef.current) clearInterval(voiceRecordIntervalRef.current);
    const duration = voiceRecordSeconds;

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const uploaded = await uploadDataUrlAttachment(currentServerHost, {
            name: `sesli-mesaj-${duration}s.webm`,
            type: 'audio/webm',
            dataUrl: base64,
          });
          const newAtt: MessageAttachment = {
            ...uploaded,
            name: `Sesli Mesaj (${duration}s).webm`,
            size: blob.size,
          };
          sendMessage('🎙️ Sesli Mesaj', [newAtt]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : '';
          appToast(msg || 'Sesli mesaj gönderilemedi.', 'error');
        }
      };
      reader.readAsDataURL(blob);
      setIsVoiceRecording(false);
      setVoiceRecordSeconds(0);
      audioChunksRef.current = [];
    };

    mediaRecorderRef.current.stop();
  };

  const handleSelectGif = (gifUrl: string, title: string) => {
    const newAtt: MessageAttachment = {
      id: `att-gif-${Date.now()}`,
      name: `${title}.gif`,
      size: 0,
      type: 'image/gif',
      url: gifUrl,
    };
    sendMessage('', [newAtt]);
    setIsGifModalOpen(false);
  };

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    if (content.includes('```')) {
      const parts = content.split(/(```[\s\S]*?```)/g);
      return parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const raw = part.slice(3, -3);
          const firstLineBreak = raw.indexOf('\n');
          let lang = 'code';
          let codeText = raw;
          if (firstLineBreak !== -1) {
            const possibleLang = raw.slice(0, firstLineBreak).trim();
            if (possibleLang && !possibleLang.includes(' ')) {
              lang = possibleLang;
              codeText = raw.slice(firstLineBreak + 1);
            }
          }
          return <CodeBlock key={index} code={codeText} language={lang} />;
        }
        return <InlineMarkdown key={index} text={part} />;
      });
    }
    return <InlineMarkdown text={content} />;
  };

  const filteredMessages = messages.filter((m) => {
    if (currentUser?.blockedUsers?.includes(m.author.username)) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const contentMatch = m.content?.toLowerCase().includes(query);
    const authorMatch = m.author.username.toLowerCase().includes(query);
    return contentMatch || authorMatch;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const mentionMatch = inputText.match(/(?:^|\s)@([a-zA-Z0-9_ğüşıöçĞÜŞİÖÇ.-]*)$/);
  const mentionQuery = mentionMatch ? mentionMatch[1].toLowerCase() : null;
  const mentionCandidates = (() => {
    if (mentionQuery === null) return [];
    const seen = new Set<string>();
    const list: { id: string; username: string; avatar: string; status: string }[] = [];
    onlineUsers.forEach((u) => {
      const key = u.username.toLowerCase();
      if (seen.has(key)) return;
      if (u.id === currentUser?.id) return;
      if (!mentionQuery || key.includes(mentionQuery)) {
        seen.add(key);
        list.push({ id: u.id, username: u.username, avatar: u.avatar, status: u.status });
      }
    });
    (activeServer?.members || []).forEach((m) => {
      const key = m.username.toLowerCase();
      if (seen.has(key)) return;
      if (isSameUser({ id: m.userId, username: m.username }, currentUser)) return;
      if (!mentionQuery || key.includes(mentionQuery)) {
        seen.add(key);
        list.push({ id: m.userId, username: m.username, avatar: m.avatar || '🎮', status: 'offline' });
      }
    });
    return list.slice(0, 6);
  })();

  const applyMention = (username: string) => {
    if (!mentionMatch) return;
    const prefix = inputText.slice(0, inputText.length - mentionMatch[1].length - 1);
    setInputText(`${prefix}@${username} `);
    setMentionIndex(0);
  };

  // Slowmode timer effect
  useEffect(() => {
    if (slowmodeRemaining > 0) {
      const timer = setTimeout(() => {
        setSlowmodeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [slowmodeRemaining]);

  const prevMsgCountRef = useRef(messages.length);
  const prevScrollChannelIdRef = useRef<string | undefined>(activeChannel?.id);

  useEffect(() => {
    if (activeChannel?.id !== prevScrollChannelIdRef.current) {
      prevScrollChannelIdRef.current = activeChannel?.id;
      prevMsgCountRef.current = messages.length;
      setPendingNewBelow(0);
      setShowScrollBottom(false);
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }

    if (messages.length > prevMsgCountRef.current) {
      const added = messages.length - prevMsgCountRef.current;
      const newest = messages[messages.length - 1];
      const isMine = Boolean(currentUser?.id && newest?.author?.id === currentUser.id);
      if (!showScrollBottomRef.current || isMine) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        setPendingNewBelow(0);
      } else {
        setPendingNewBelow((prev) => prev + added);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages, activeChannel?.id, currentUser?.id]);

  if (activeServer?.id === 'direct-messages' && !activeDMUser) {
    return (
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/40 text-xs">Yükleniyor...</div>}>
        <FriendsDashboard
          onOpenProfile={onOpenProfile}
          onOpenExplore={onOpenExplore}
          onOpenCreateServer={onOpenCreateServer}
        />
      </Suspense>
    );
  }

  if (!activeServer || !activeChannel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
          <Compass className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-white">Henüz bir kanal veya sunucu seçili değil</div>
        <p className="text-xs text-white/50 max-w-sm">
          Sunucuları Keşfet üzerinden topluluklara katılabilir veya kendi sunucunu oluşturabilirsin.
        </p>
        <div className="flex items-center gap-2">
          {onOpenExplore && (
            <button
              type="button"
              onClick={onOpenExplore}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5"
            >
              <Compass className="w-3.5 h-3.5" />
              Sunucuları Keşfet
            </button>
          )}
          {onOpenCreateServer && (
            <button
              type="button"
              onClick={onOpenCreateServer}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Sunucu Oluştur
            </button>
          )}
        </div>
      </div>
    );
  }

  // If this channel is a voice channel, render the iOS voice room area
  if (activeChannel.type === 'voice') {
    return (
      <Suspense fallback={<div className="flex-1 flex items-center justify-center text-white/40 text-xs">Ses odası yükleniyor...</div>}>
        <VoiceRoomArea onOpenMobileNav={onOpenMobileNav} />
      </Suspense>
    );
  }

  const isDM = activeServer.id === 'direct-messages';

  // Find partner for DM
  const dmPartner = isDM
    ? activeDMUser || onlineUsers.find((u) => u.id !== currentUser?.id)
    : null;

  const getAuthorColor = (authorUsername: string): string => {
    if (!activeServer || !activeServer.roles || !activeServer.members) return '#94a3b8';
    const member = activeServer.members.find(
      (m) => m.username.toLowerCase() === authorUsername.toLowerCase()
    );
    if (!member || !member.roleIds || member.roleIds.length === 0) return '#94a3b8';
    const userRoles = activeServer.roles
      .filter((r) => member.roleIds.includes(r.id) && !r.isDefault)
      .sort((a, b) => a.position - b.position);
    return userRoles.length > 0 ? userRoles[0].color : '#94a3b8';
  };

  const submitCurrentMessage = async () => {
    if (slowmodeRemaining > 0) return;
    if (!inputText.trim() && pendingAttachments.length === 0) return;
    const finalMessage = inputText.trim();

    if (finalMessage.startsWith('/')) {
      const [rawCmd, ...args] = finalMessage.split(/\s+/);
      const cmd = rawCmd.toLowerCase();
      if (cmd === '/zar') {
        const roll = Math.floor(Math.random() * 6) + 1;
        sendMessage(`🎲 **Zar Attı:** ${roll} geldi!`);
        setInputText('');
        return;
      }
      if (cmd === '/yazitura') {
        const coin = Math.random() < 0.5 ? 'Yazı' : 'Tura';
        sendMessage(`🪙 **Yazı-Tura:** **${coin}** geldi!`);
        setInputText('');
        return;
      }
      if (cmd === '/anket' && !isDM) {
        setInputText('');
        setIsPollModalOpen(true);
        return;
      }
      if (cmd === '/temizle' && activeServer && activeChannel && !isDM) {
        const count = Math.min(Math.max(parseInt(args[0] || '10', 10) || 10, 1), 100);
        clearChannelMessages(activeServer.id, activeChannel.id, count);
        setInputText('');
        return;
      }
      if (cmd === '/davet' && activeServer && !isDM) {
        setInputText('');
        const inv = await createServerInvite(activeServer.id, 0, 0);
        if (inv?.code) {
          sendMessage(`🔗 **Sunucu Davet Linki:** ${window.location.origin}/?invite=${inv.code} (Kod: \`${inv.code}\`)`);
        }
        return;
      }
      if (cmd === '/hatirlat') {
        const timeToken = (args[0] || '').toLowerCase();
        const text = args.slice(1).join(' ').trim();
        const match = timeToken.match(/^(\d+)(sn|s|dk|d|m|sa|h)$/);
        if (!match || !text) {
          appToast('Kullanım: /hatirlat <süre> <mesaj> (Örn: /hatirlat 10dk Toplantı var)', 'warning');
          return;
        }
        const amount = parseInt(match[1], 10);
        const unit = match[2];
        const multiplier =
          unit === 'sn' || unit === 's'
            ? 1000
            : unit === 'sa' || unit === 'h'
            ? 3600 * 1000
            : 60 * 1000;
        addReminder(text, amount * multiplier);
        setInputText('');
        return;
      }
      if (cmd === '/yardim') {
        sendMessage('⚡ **Slash Komutları:** `/zar`, `/yazitura`, `/anket`, `/hatirlat <süre> <mesaj>`, `/temizle [sayı]`, `/davet`, `/yardim`');
        setInputText('');
        return;
      }
    }

    let outgoingText = finalMessage;
    if (isDM && dmE2eeEnabled && outgoingText && currentUser?.username) {
      const peerPub =
        dmPartner?.e2eePublicKey ||
        onlineUsers.find((u) => u.id === dmPartner?.id || u.username === dmPartner?.username)?.e2eePublicKey;
      if (peerPub) {
        const cipher = await encryptDmMessage(outgoingText, currentUser.username, peerPub);
        if (cipher) outgoingText = cipher;
      }
    }

    sendMessage(outgoingText, pendingAttachments, replyingTo || undefined);
    setInputText('');
    clearDraft(activeDraftKey);
    setPendingAttachments([]);
    setReplyingTo(null);
    setIsEmojiPickerOpen(false);
    if (activeChannel?.slowmodeSeconds && activeChannel.slowmodeSeconds > 0) {
      setSlowmodeRemaining(activeChannel.slowmodeSeconds);
    }
  };

  const handleQuickScreenshot = async () => {
    if (isCapturingScreenshot) return;
    setIsCapturingScreenshot(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 150));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const webpUrl = canvas.toDataURL('image/webp', 0.86);
        const useWebp = webpUrl.startsWith('data:image/webp');
        const dataUrl = useWebp ? webpUrl : canvas.toDataURL('image/png');
        const ext = useWebp ? 'webp' : 'png';
        const uploaded = await uploadDataUrlAttachment(currentServerHost, {
          name: `ekran-goruntusu-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`,
          type: useWebp ? 'image/webp' : 'image/png',
          dataUrl,
        });
        setPendingAttachments((prev) => [...prev, uploaded]);
      }
      stream.getTracks().forEach((t) => t.stop());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const name = err instanceof Error ? err.name : '';
      if (msg && !name.includes('NotAllowed')) {
        appToast(msg, 'error');
      }
    } finally {
      setIsCapturingScreenshot(false);
    }
  };

  const processFiles = (files: FileList | File[]) => {
    Array.from(files).forEach(async (file) => {
      try {
        const newAtt = await uploadAttachmentFile(currentServerHost, file);
        setPendingAttachments((prev) => [...prev, newAtt]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        appToast(msg || `"${file.name}" okunamadı.`, 'error');
      }
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleAuthorClick = (authorId: string, authorUsername: string, authorAvatar: string) => {
    const matched = onlineUsers.find((u) => u.id === authorId || u.username === authorUsername);
    if (matched) {
      onOpenProfile(matched);
    } else {
      onOpenProfile({
        id: authorId,
        username: authorUsername,
        avatar: authorAvatar,
        role: authorUsername === 'admin' ? 'admin' : 'user',
        status: 'online',
        isMuted: false,
        isDeafened: false,
        isSpeaking: false,
      });
    }
  };

  return (
    <main
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 flex flex-col min-w-0 h-full overflow-hidden select-text bg-transparent"
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-blue-600/30 backdrop-blur-md border-2 border-dashed border-blue-400 flex flex-col items-center justify-center gap-3 text-white pointer-events-none animate-fade-in">
          <div className="w-16 h-16 rounded-3xl bg-blue-500/40 flex items-center justify-center text-3xl shadow-xl">
            📂
          </div>
          <p className="text-lg font-bold">Dosyaları buraya bırakın</p>
          <p className="text-xs text-white/70">Resimler, ekran görüntüleri ve belgeler (Maks 5MB)</p>
        </div>
      )}

      {/* iOS Translucent Header */}
      <header className="relative z-30 h-14 px-3 sm:px-5 border-b border-white/[0.07] flex items-center justify-between gap-2 shrink-0 bg-[#101218]/75 backdrop-blur-xl shadow-sm select-none">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          {onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              className="md:hidden w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0"
              title="Menüyü Aç"
              aria-label="Menüyü Aç"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          {onToggleChannelsCollapsed && (
            <button
              type="button"
              onClick={onToggleChannelsCollapsed}
              className="hidden md:flex w-8 h-8 rounded-full hover:bg-white/10 text-white/60 hover:text-white items-center justify-center transition shrink-0"
              title={isChannelsCollapsed ? t(language, 'showChannels') : t(language, 'hideChannels')}
              aria-label={isChannelsCollapsed ? t(language, 'showChannels') : t(language, 'hideChannels')}
            >
              {isChannelsCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
          {isDM ? (
            <button
              type="button"
              onClick={() => dmPartner && onOpenProfile(dmPartner)}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition text-left min-w-0"
              title="Kullanıcı Profilini Görüntüle"
              aria-label={`${dmPartner?.username || 'Kullanıcı'} profilini görüntüle`}
            >
              <div className="relative shrink-0">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm overflow-hidden">
                  <AvatarView avatar={dmPartner?.avatar} alt={dmPartner?.username} fallback="👤" className="w-full h-full object-cover" />
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black ${
                    dmPartner?.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-white text-sm tracking-tight truncate">
                    {dmPartner?.username || activeChannel.name}
                  </h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono shrink-0">
                    DM
                  </span>
                </div>
                <span className="text-[11px] text-white/40 block truncate max-w-xs">
                  {dmPartner?.statusMessage || 'Direkt Mesajlaşma'}
                </span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/60 shrink-0">
                <Hash className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-white text-sm tracking-tight truncate">{activeChannel.name}</h3>
                <span className="text-[11px] text-white/40 hidden sm:inline">
                  {activeServer.name}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Header Action Icons (Primary + Clean Tools Overflow) */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-white/60 shrink-0">
          {isDM && dmPartner && (
            directCall &&
            (directCall.partner.id === dmPartner.id ||
              directCall.partner.username.toLowerCase() === dmPartner.username.toLowerCase()) ? (
              <button
                type="button"
                onClick={endDirectCall}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-red-500/20 hover:bg-red-500 border border-red-400/40 text-red-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                title="1-e-1 Görüşmeyi Sonlandır"
                aria-label="Görüşmeyi Sonlandır"
              >
                <PhoneOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Görüşmede</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startDirectCall(dmPartner)}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 hover:border-emerald-400 text-emerald-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition shadow"
                title="1-e-1 Sesli Arama Başlat"
                aria-label="Sesli Arama Başlat"
              >
                <Phone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sesli Ara</span>
              </button>
            )
          )}

          {/* Working Channel Notification Popover */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setIsNotifMenuOpen((v) => !v);
                setIsToolsMenuOpen(false);
                setOpenActionMsgId(null);
              }}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                isNotifMenuOpen
                  ? 'ui-accent-soft text-white'
                  : (notificationPrefs[activeChannel.id] || 'all') === 'muted'
                  ? 'hover:bg-white/10 text-rose-400'
                  : (notificationPrefs[activeChannel.id] || 'all') === 'mentions'
                  ? 'hover:bg-white/10 text-amber-300'
                  : 'hover:bg-white/10'
              }`}
              title="Kanal Bildirim Tercihi"
              aria-label="Kanal Bildirim Tercihi"
            >
              {(notificationPrefs[activeChannel.id] || 'all') === 'muted' ? (
                <BellOff className="w-4 h-4" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
            </button>
            {isNotifMenuOpen && (
              <div className="absolute right-0 top-11 z-50 w-52 rounded-2xl ios-glass border border-white/15 shadow-2xl p-1.5 text-xs text-white animate-fade-in">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55 border-b border-white/10 mb-1">
                  Bildirim Tercihi
                </div>
                {(
                  [
                    { id: 'all', label: t(language, 'notificationsAll') },
                    { id: 'mentions', label: t(language, 'notificationsMentions') },
                    { id: 'muted', label: t(language, 'notificationsMuted') },
                  ] as const
                ).map((opt) => {
                  const activePref = (notificationPrefs[activeChannel.id] || 'all') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setTargetNotificationPref(activeChannel.id, opt.id);
                        setIsNotifMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition ${
                        activePref ? 'ui-accent-soft font-semibold' : 'hover:bg-white/10 text-white/80'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {activePref && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsPinModalOpen(true)}
            className="relative w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition"
            title="Sabitlenmiş Mesajlar"
            aria-label="Sabitlenmiş Mesajlar"
          >
            <Pin className={`w-4 h-4 ${messages.some((m) => m.isPinned) ? 'text-amber-400' : ''}`} />
            {messages.filter((m) => m.isPinned).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                {messages.filter((m) => m.isPinned).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsGlobalInboxOpen(true)}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition text-cyan-400"
            title="Gelen Kutusu & Global Arama"
            aria-label="Gelen Kutusu ve Global Arama"
          >
            <Inbox className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition text-blue-400"
            title="Gelişmiş Sohbet Araması & Işınlanma"
            aria-label="Gelişmiş Sohbet Araması"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMembers}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
              showMembers ? 'ui-accent-soft text-white border' : 'hover:bg-white/10'
            }`}
            title="Kişileri Göster/Gizle"
            aria-label="Kişi Listesini Göster veya Gizle"
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Secondary Channel Tools Overflow Popover */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setIsToolsMenuOpen((v) => !v);
                setIsNotifMenuOpen(false);
                setOpenActionMsgId(null);
              }}
              className={`relative w-8 h-8 rounded-full flex items-center justify-center transition ${
                isToolsMenuOpen ? 'ui-accent-soft text-white border' : 'hover:bg-white/10'
              }`}
              title={t(language, 'channelTools')}
              aria-label={t(language, 'channelTools')}
            >
              <LayoutGrid className="w-4 h-4" />
              {bookmarkedMessages.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-cyan-400" />
              )}
            </button>
            {isToolsMenuOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl ios-glass border border-white/15 shadow-2xl p-1.5 text-xs text-white animate-fade-in">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/55 border-b border-white/10 mb-1">
                  {t(language, 'channelTools')}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsMediaModalOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                >
                  <ImageIcon className="w-4 h-4 text-pink-400 shrink-0" />
                  <span>Medya &amp; Dosya Galerisi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsBookmarksModalOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <Bookmark className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Kaydedilen Mesajlar</span>
                  </span>
                  {bookmarkedMessages.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
                      {bookmarkedMessages.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsChatMiniGamesOpen(true);
                    setIsToolsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                >
                  <Gamepad2 className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>Aktiviteler &amp; Mini Oyunlar</span>
                </button>
                {activeServer && !isDM && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLeaderboardOpen(true);
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                    >
                      <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Sunucu Liderlik Tablosu</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEventsModalOpen(true);
                        setIsToolsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-white/10 transition text-left"
                    >
                      <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Sunucu Etkinlikleri</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="relative hidden xl:block ml-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Hızlı filtrele..."
              aria-label="Kanal mesajlarında hızlı filtrele"
              className="bg-white/5 border border-white/10 text-xs text-white rounded-full px-3 py-1.5 pl-8 pr-7 w-36 focus:w-44 transition-all duration-200 outline-none placeholder:text-white/30"
            />
            <Search className="w-3.5 h-3.5 text-white/40 absolute left-2.5 top-2" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-white/40 hover:text-white"
                aria-label="Aramayı temizle"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Active 1-on-1 Call Stage inside DM Chat */}
      {isDM &&
        dmPartner &&
        directCall &&
        (directCall.partner.id === dmPartner.id ||
          directCall.partner.username.toLowerCase() === dmPartner.username.toLowerCase()) && (() => {
          const partnerVol = userVolumes[directCall.partner.id] ?? 100;
          const qualityInfo = directCallQuality
            ? classifyConnectionQuality(directCallQuality.rttMs, directCallQuality.packetLossPct)
            : null;
          return (
            <div className="relative z-20 border-b border-emerald-500/20 bg-gradient-to-b from-[#131d19] via-[#10141d] to-[#0c0e14] backdrop-blur-md select-none transition-all">
              {isCallStageCollapsed ? (
                <div className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center -space-x-2 shrink-0">
                      <div
                        className={`w-8 h-8 rounded-xl bg-white/10 overflow-hidden border-2 transition-all ${
                          isSpeaking && !isMuted ? 'border-emerald-400 ring-2 ring-emerald-400/40' : 'border-[#121c18]'
                        }`}
                      >
                        <AvatarView avatar={currentUser?.avatar} alt={currentUser?.username || 'Sen'} fallback="👤" className="w-full h-full object-cover" />
                      </div>
                      <div
                        className={`w-8 h-8 rounded-xl bg-white/10 overflow-hidden border-2 transition-all ${
                          directCall.partner.isSpeaking ? 'border-emerald-400 ring-2 ring-emerald-400/40' : 'border-[#121c18]'
                        }`}
                      >
                        <AvatarView avatar={directCall.partner.avatar} alt={directCall.partner.username} fallback="👤" className="w-full h-full object-cover" />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-white truncate">
                      {currentUser?.username} ↔ {directCall.partner.username}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                      {directCall.status === 'connected'
                        ? formatCallDuration(directCall.durationSeconds)
                        : directCall.status === 'incoming'
                        ? 'Gelen Arama'
                        : 'Aranıyor...'}
                    </span>
                    {directCall.status === 'connected' && directCallQuality && qualityInfo && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/80 flex items-center gap-1">
                        <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                        {directCallQuality.rttMs}ms
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsCallStageCollapsed(false)}
                      className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/80 text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      Genişlet
                    </button>
                    <button
                      onClick={endDirectCall}
                      className="px-2.5 py-1 rounded-full bg-red-500 hover:bg-red-400 text-white text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <PhoneOff className="w-3 h-3" />
                      Kapat
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-6 py-4 space-y-4">
                  {/* Top bar: status, telemetry, volume slider + collapse */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          directCall.status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                        }`}
                      />
                      <span className="text-xs font-bold text-white/90">
                        {directCall.status === 'connected'
                          ? '1-e-1 Sesli Görüşme'
                          : directCall.status === 'incoming'
                          ? `${directCall.partner.username} seni arıyor...`
                          : `${directCall.partner.username} aranıyor...`}
                      </span>
                      {directCall.status === 'connected' && (
                        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                          {formatCallDuration(directCall.durationSeconds)}
                        </span>
                      )}
                      {directCall.status === 'connected' && directCallQuality && qualityInfo && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            qualityInfo.level === 'poor'
                              ? 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                              : qualityInfo.level === 'fair'
                              ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                              : 'bg-white/[0.06] border-white/10 text-emerald-300'
                          }`}
                          title={`Kayıp: %${directCallQuality.packetLossPct} • Yol: ${directCallQuality.pathType}`}
                        >
                          <Wifi className="w-3 h-3" />
                          <span>
                            {directCallQuality.rttMs}ms • {directCallQuality.pathType.toUpperCase()} ({qualityInfo.label})
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {directCall.status === 'connected' && (
                        <div className="flex items-center gap-1.5 bg-white/[0.06] border border-white/10 rounded-full px-2.5 py-1">
                          <Volume2 className="w-3 h-3 text-sky-300 shrink-0" />
                          <input
                            type="range"
                            min={0}
                            max={200}
                            step={5}
                            value={partnerVol}
                            onChange={(e) => setUserVolume(directCall.partner.id, Number(e.target.value))}
                            className="w-20 accent-sky-400 cursor-pointer"
                            title={`${directCall.partner.username} Ses Seviyesi: %${partnerVol}`}
                          />
                          <span className="text-[10px] font-mono text-white/75 w-8 text-right">%{partnerVol}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setIsCallStageCollapsed(true)}
                        className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/75 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                        Küçült
                      </button>
                    </div>
                  </div>

                  {/* Centered 2-User Stage Cards (with separate PiP Camera videos) + Screen Share Preview */}
                  <div className="flex flex-col lg:flex-row items-center justify-center gap-4">
                    <div className="flex items-center justify-center gap-5 sm:gap-8">
                      {/* Self Card */}
                      <div
                        className={`w-40 sm:w-48 rounded-2xl p-3 border bg-white/[0.04] flex flex-col items-center gap-2 transition-all ${
                          isSpeaking && !isMuted
                            ? 'border-emerald-400/80 shadow-[0_0_24px_rgba(16,185,129,0.28)] bg-emerald-500/[0.07]'
                            : 'border-white/10'
                        }`}
                      >
                        {isDirectCameraOn && localDirectCameraStream ? (
                          <div className="relative w-full h-24 rounded-xl overflow-hidden bg-black border border-emerald-400/40">
                            <video
                              ref={localCamVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover scale-x-[-1]"
                            />
                            {isMuted && (
                              <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white">
                                <MicOff className="w-2.5 h-2.5" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <div
                              className={`w-16 h-16 rounded-2xl bg-white/10 overflow-hidden border-2 transition-all ${
                                isSpeaking && !isMuted ? 'border-emerald-400 scale-105' : 'border-white/15'
                              }`}
                            >
                              <AvatarView avatar={currentUser?.avatar} alt={currentUser?.username || 'Sen'} fallback="👤" className="w-full h-full object-cover" />
                            </div>
                            {isMuted && (
                              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 border-2 border-[#10141d] flex items-center justify-center text-white">
                                <MicOff className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="text-center min-w-0 w-full">
                          <div className="text-xs font-bold text-white truncate">{currentUser?.username} (Sen)</div>
                          <div className="text-[10px] text-white/50 truncate">
                            {isDeafened ? 'Sağırlaştırıldı' : isMuted ? 'Mikrofon Kapalı' : isSpeaking ? 'Konuşuyor...' : 'Hazır'}
                          </div>
                        </div>
                      </div>

                      {/* Partner Card */}
                      <div
                        className={`w-40 sm:w-48 rounded-2xl p-3 border bg-white/[0.04] flex flex-col items-center gap-2 transition-all ${
                          directCall.partner.isSpeaking
                            ? 'border-emerald-400/80 shadow-[0_0_24px_rgba(16,185,129,0.28)] bg-emerald-500/[0.07]'
                            : 'border-white/10'
                        }`}
                      >
                        {(partnerDirectCameraOn || dmPartnerCameraStream) && dmPartnerCameraStream ? (
                          <div className="relative w-full h-24 rounded-xl overflow-hidden bg-black border border-sky-400/40">
                            <video
                              ref={partnerCamVideoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full h-full object-cover"
                            />
                            {directCall.status === 'connected' && (
                              <div className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-400 border border-black" />
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <div
                              className={`w-16 h-16 rounded-2xl bg-white/10 overflow-hidden border-2 transition-all ${
                                directCall.partner.isSpeaking ? 'border-emerald-400 scale-105' : 'border-white/15'
                              }`}
                            >
                              <AvatarView avatar={directCall.partner.avatar} alt={directCall.partner.username} fallback="👤" className="w-full h-full object-cover" />
                            </div>
                            {directCall.status === 'connected' && (
                              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#10141d]" />
                            )}
                          </div>
                        )}
                        <div className="text-center min-w-0 w-full">
                          <div className="text-xs font-bold text-white truncate">{directCall.partner.username}</div>
                          <div className="text-[10px] text-white/50 truncate">
                            {directCall.status === 'connected'
                              ? directCall.partner.isSpeaking
                                ? 'Konuşuyor...'
                                : 'Bağlı'
                              : directCall.status === 'incoming'
                              ? 'Arıyor...'
                              : 'Çalıyor...'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Inline Partner Screen Share Preview (separate from camera stream) */}
                    {(partnerDirectScreenSharing || Boolean(dmCallPartnerStream)) && (
                      <div className="relative w-full max-w-xs h-32 rounded-2xl overflow-hidden border border-sky-400/35 bg-black shadow-lg group">
                        {dmCallPartnerStream ? (
                          <video ref={dmScreenVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-white/50">
                            Ekran akışı hazırlanıyor...
                          </div>
                        )}
                        {directCallQuality && directCallQuality.width > 0 && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-mono text-sky-300">
                            {directCallQuality.width}×{directCallQuality.height}
                            {directCallQuality.fps > 0 ? ` • ${directCallQuality.fps}fps` : ''}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsDMRemoteAssistOpen(true)}
                          className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 text-xs font-bold text-white"
                        >
                          <Maximize2 className="w-4 h-4 text-sky-300" />
                          <span>Tam Ekran & Uzaktan Kontrol</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Incoming Remote Assist Granular Request Banner */}
                  {remoteAssist.status === 'incoming_request' && (
                    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-amber-200 font-semibold">
                          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>{directCall.partner.username} bilgisayarını uzaktan kontrol etmek için izin istiyor:</span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] text-white/85 pl-6">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dmConsentPerms.control}
                              onChange={(e) => setDmConsentPerms((p) => ({ ...p, control: e.target.checked }))}
                              className="accent-emerald-500"
                            />
                            <span>Fare & Klavye</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dmConsentPerms.clipboard}
                              onChange={(e) => setDmConsentPerms((p) => ({ ...p, clipboard: e.target.checked }))}
                              className="accent-emerald-500"
                            />
                            <span>Pano Paylaşımı</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dmConsentPerms.annotate}
                              onChange={(e) => setDmConsentPerms((p) => ({ ...p, annotate: e.target.checked }))}
                              className="accent-emerald-500"
                            />
                            <span>Lazer & Çizim</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => respondRemoteAssist(true, dmConsentPerms)}
                          className="px-3 py-1 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition"
                        >
                          İzin Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => respondRemoteAssist(false)}
                          className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                        >
                          Reddet
                        </button>
                      </div>
                    </div>
                  )}

                  {remoteAssist.status === 'being_controlled' && (
                    <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-200">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 font-semibold">
                          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            {remoteAssist.paused
                              ? `${directCall.partner.username} — Kontrol Duraklatıldı`
                              : `${directCall.partner.username} şu anda bilgisayarınızı kontrol ediyor`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[10px]">
                          {(
                            [
                              { key: 'control', label: 'Fare & Klavye' },
                              { key: 'clipboard', label: 'Pano' },
                              { key: 'annotate', label: 'Çizim & Lazer' },
                            ] as const
                          ).map((item) => {
                            const active = remoteAssist.permissions[item.key];
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => updateRemoteAssistPermissions({ [item.key]: !active })}
                                className={`px-2 py-0.5 rounded-full border transition ${
                                  active
                                    ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200'
                                    : 'border-white/15 bg-white/5 text-white/45 line-through'
                                }`}
                              >
                                {item.label}
                              </button>
                            );
                          })}
                          <span className="text-amber-200/85 font-mono ml-1">
                            • Acil Kes: Ctrl+Alt+Esc / Pause
                          </span>
                        </div>
                        {lastClipboardNotice && (
                          <p className="text-[11px] text-sky-300 pl-6 font-semibold">
                            📋 {lastClipboardNotice}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => pauseRemoteAssist(!remoteAssist.paused)}
                          className="px-3 py-1 rounded-full bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1 transition"
                        >
                          {remoteAssist.paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                          <span>{remoteAssist.paused ? 'Devam Et' : 'Duraklat'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={stopRemoteAssist}
                          className="px-3 py-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1 transition"
                        >
                          <Hand className="w-3.5 h-3.5" />
                          <span>Kontrolü Kes</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Dock */}
                  <div className="relative flex flex-wrap items-center justify-center gap-2">
                    {directCall.status === 'incoming' ? (
                      <>
                        <button
                          onClick={acceptDirectCall}
                          className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Yanıtla
                        </button>
                        <button
                          onClick={() => declineDirectCall()}
                          className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <PhoneOff className="w-3.5 h-3.5" />
                          Reddet
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={toggleMute}
                          className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                            isMuted
                              ? 'bg-red-500/25 text-red-200 border border-red-400/40'
                              : 'bg-white/10 hover:bg-white/20 text-white'
                          }`}
                        >
                          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                          <span>{isMuted ? 'Mikrofon Kapalı' : 'Mikrofon Açık'}</span>
                        </button>

                        <button
                          onClick={toggleDeafen}
                          className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                            isDeafened
                              ? 'bg-red-500/25 text-red-200 border border-red-400/40'
                              : 'bg-white/10 hover:bg-white/20 text-white'
                          }`}
                        >
                          {isDeafened ? <Volume2 className="w-3.5 h-3.5" /> : <Headphones className="w-3.5 h-3.5" />}
                          <span>{isDeafened ? 'Sağırlaştırıldı' : 'Kulaklık'}</span>
                        </button>

                        {directCall.status === 'connected' && (
                          <>
                            <button
                              onClick={toggleDirectCamera}
                              className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                                isDirectCameraOn
                                  ? 'bg-emerald-500 hover:bg-emerald-400 text-black font-bold'
                                  : 'bg-white/10 hover:bg-white/20 text-white'
                              }`}
                            >
                              {isDirectCameraOn ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                              <span>{isDirectCameraOn ? 'Kamera Açık' : 'Kamera'}</span>
                            </button>

                            <div className="relative flex items-center">
                              <button
                                onClick={() =>
                                  isDirectScreenSharing
                                    ? stopDirectScreenShare()
                                    : startDirectScreenShare(dmShareOptions)
                                }
                                className={`px-3.5 py-2 rounded-l-full text-xs font-semibold flex items-center gap-1.5 transition ${
                                  isDirectScreenSharing
                                    ? 'bg-indigo-500 hover:bg-indigo-400 text-white'
                                    : 'bg-white/10 hover:bg-white/20 text-white'
                                }`}
                              >
                                {isDirectScreenSharing ? <MonitorOff className="w-3.5 h-3.5" /> : <MonitorUp className="w-3.5 h-3.5" />}
                                <span>{isDirectScreenSharing ? 'Paylaşımı Durdur' : 'Ekran Paylaş'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDmShareOptions((v) => !v)}
                                className="px-2 py-2 rounded-r-full bg-white/[0.07] hover:bg-white/20 border-l border-black/30 text-white/80 transition"
                                title="Ekran Paylaşımı Kalite Seçenekleri"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>

                              {showDmShareOptions && (
                                <div className="absolute left-0 top-full mt-2 w-64 rounded-2xl border border-white/15 bg-[#121622] p-3 shadow-2xl z-30 space-y-2 text-left">
                                  <div className="flex items-center justify-between text-xs font-bold text-white">
                                    <span>Paylaşım Kalitesi</span>
                                    <button
                                      type="button"
                                      onClick={() => setShowDmShareOptions(false)}
                                      className="text-white/50 hover:text-white"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-1">
                                    {(
                                      [
                                        { id: 'sharp-text', label: 'Keskin Metin (1080p / 15 FPS)' },
                                        { id: 'balanced', label: 'Dengeli (1080p / 30 FPS)' },
                                        { id: 'smooth-60', label: 'Akıcı (1080p / 60 FPS)' },
                                        { id: 'source', label: 'Kaynak Çözünürlüğü (60 FPS)' },
                                      ] as const
                                    ).map((opt) => (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() =>
                                          setDmShareOptions((prev) => ({ ...prev, preset: opt.id }))
                                        }
                                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-left transition ${
                                          dmShareOptions.preset === opt.id
                                            ? 'bg-sky-500/25 text-sky-200 border border-sky-400/45'
                                            : 'bg-white/[0.05] text-white/75 hover:bg-white/10'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                  <label className="flex items-center justify-between text-xs text-white/80 cursor-pointer pt-1">
                                    <span>Sistem sesini paylaş</span>
                                    <input
                                      type="checkbox"
                                      checked={dmShareOptions.shareAudio}
                                      onChange={(e) =>
                                        setDmShareOptions((prev) => ({ ...prev, shareAudio: e.target.checked }))
                                      }
                                      className="accent-emerald-500"
                                    />
                                  </label>
                                  {!isDirectScreenSharing && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowDmShareOptions(false);
                                        void startDirectScreenShare(dmShareOptions);
                                      }}
                                      className="w-full py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition"
                                    >
                                      Paylaşımı Başlat
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            <button
                              onClick={() => setIsDMRemoteAssistOpen(true)}
                              className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition ${
                                remoteAssist.status === 'controlling'
                                  ? 'bg-sky-500 text-white'
                                  : 'bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/30'
                              }`}
                            >
                              <MousePointerClick className="w-3.5 h-3.5" />
                              <span>{remoteAssist.status === 'controlling' ? 'Kontrol Paneli' : 'Uzaktan Yardım'}</span>
                            </button>
                          </>
                        )}

                        <button
                          onClick={endDirectCall}
                          className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-red-500/25"
                        >
                          <PhoneOff className="w-3.5 h-3.5" />
                          <span>Görüşmeyi Bitir</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      <Suspense fallback={null}>
        <RemoteAssistModal
          isOpen={isDMRemoteAssistOpen}
          onClose={() => setIsDMRemoteAssistOpen(false)}
        />
      </Suspense>

      {/* Channel Sticky Notice & Topic Bar */}
      {activeServer.id !== 'direct-messages' && activeChannel.type === 'text' && (
        <div className="relative z-10 border-b border-white/[0.06] bg-[#141418]/90 backdrop-blur-md px-6 py-2 flex items-center justify-between text-xs transition select-none">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {activeChannel.stickyNotice ? (
              <div className="flex items-center gap-2 truncate">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-[10px] flex items-center gap-1 border border-amber-500/30 shrink-0">
                  📌 Sabit Duyuru
                </span>
                <span className="text-white/90 font-medium truncate">
                  {activeChannel.stickyNotice.text}
                </span>
                <span className="text-white/40 text-[11px] shrink-0 hidden sm:inline">
                  • @{activeChannel.stickyNotice.author} ({activeChannel.stickyNotice.updatedAt})
                </span>
              </div>
            ) : activeChannel.topic ? (
              <div className="flex items-center gap-2 text-white/70 truncate">
                <Tag className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">{activeChannel.topic}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-white/40 text-[11px]">
                <Tag className="w-3.5 h-3.5 text-white/30 shrink-0" />
                <span>Bu kanal için henüz konu veya sabit duyuru belirlenmedi.</span>
              </div>
            )}
          </div>

          {/* Admin actions: Edit / remove sticky notice */}
          {(currentUser?.role === 'admin' || isUserServerOwner(currentUser, activeServer)) && (
            <div className="flex items-center gap-1.5 shrink-0 pl-3">
              <button
                onClick={() => {
                  setNoticeEditText(activeChannel.stickyNotice?.text || '');
                  setTopicEditText(activeChannel.topic || '');
                  setIsEditingNotice(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-[11px] font-medium flex items-center gap-1 transition"
                title="Sabit Duyuru veya Kanal Başlığını Düzenle"
              >
                <Edit2 className="w-3 h-3 text-blue-400" />
                <span>{activeChannel.stickyNotice ? 'Düzenle' : 'Duyuru / Başlık Ekle'}</span>
              </button>
              {activeChannel.stickyNotice && (
                <button
                  onClick={async () => {
                    if (await appConfirm({ title: 'Duyuruyu Kaldır', message: 'Sabit duyuruyu kaldırmak istediğinize emin misiniz?', danger: true, confirmLabel: 'Kaldır' })) {
                      updateChannelNotice(activeServer.id, activeChannel.id, null);
                    }
                  }}
                  className="p-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition"
                  title="Sabit Duyuruyu Kaldır"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleMessagesScroll}
        className={`relative z-0 flex-1 overflow-y-auto px-4 sm:px-6 py-5 chat-msg-list ${
          messageDensity === 'compact' ? 'space-y-1.5' : 'space-y-3.5'
        }`}
      >
        {/* Welcome Banner & Guided Empty State */}
        <div className="pt-2 pb-6 border-b border-white/[0.06] space-y-2.5 select-none max-w-lg">
          <div className="w-14 h-14 rounded-2xl ui-accent-soft border flex items-center justify-center">
            {isDM ? <MessageCircle className="w-7 h-7" /> : <Hash className="w-7 h-7" />}
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isDM ? `${dmPartner?.username || 'Sohbet'}` : `#${activeChannel.name}`}
          </h2>
          <p className="text-white/50 text-xs leading-relaxed">
            {isDM
              ? `Bu, ${dmPartner?.username || 'bu kullanıcı'} ile olan özel direkt mesajlaşma geçmişiniz. Mesaj gönderip dosya ve resim paylaşabilirsiniz.`
              : 'Bu kanalın başlangıcındasınız. Sohbet etmek ve düşüncelerinizi paylaşmak için bir mesaj yazın.'}
          </p>
          {filteredMessages.length === 0 && !searchQuery.trim() && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => composerRef.current?.focus()}
                className="px-3 py-1.5 rounded-xl ui-accent-bg text-xs font-semibold transition"
              >
                {t(language, 'writeFirstMessage')}
              </button>
              {!isDM && (
                <button
                  type="button"
                  onClick={() => setIsPollModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition flex items-center gap-1.5"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Anket Başlat</span>
                </button>
              )}
              <span className="text-[11px] text-white/40 px-2">
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono">Ctrl+K</kbd> Hızlı Geçiş
              </span>
            </div>
          )}
        </div>

        {/* History Pagination & Skeleton Loader */}
        {isLoadingOlderMessages && (
          <MessageSkeletonList compact={messageDensity === 'compact'} count={3} />
        )}
        {activeChannel?.id && hasMoreMessages[activeChannel.id] && filteredMessages.length <= visibleMsgCount && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              disabled={isLoadingOlderMessages}
              onClick={() => requestOlderMessages(activeChannel.id)}
              className="px-4 py-1.5 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 text-xs font-semibold text-indigo-200 transition border border-indigo-400/30"
            >
              {isLoadingOlderMessages ? 'Eski mesajlar yükleniyor...' : 'Sunucudan Daha Eski Mesajları Yükle (+50)'}
            </button>
          </div>
        )}
        {filteredMessages.length > visibleMsgCount && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={() => setVisibleMsgCount((prev) => prev + 50)}
              className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white/80 transition border border-white/10"
            >
              Daha Eski Mesajları Göster (+50) • {filteredMessages.length - visibleMsgCount} gizli
            </button>
          </div>
        )}
        {(() => {
          const displayedMessages = filteredMessages.slice(-visibleMsgCount);
          const useClassicLayout = chatLayout === 'classic' || (chatLayout === 'auto' && !isDM);
          const isCompact = messageDensity === 'compact';
          const vWin = computeVirtualWindow({
            totalCount: displayedMessages.length,
            scrollTop: scrollMetrics.top,
            viewportHeight: scrollMetrics.height,
            estimatedRowHeight: useClassicLayout ? (isCompact ? 54 : 68) : isCompact ? 64 : 78,
            overscan: 12,
          });
          const slicedMessages = vWin.virtualized
            ? displayedMessages.slice(vWin.startIndex, vWin.endIndex)
            : displayedMessages;
          const nowMs = Date.now();
          return (
            <>
              {vWin.paddingTop > 0 && <div style={{ height: vWin.paddingTop }} aria-hidden="true" />}
              {slicedMessages.map((msg, sliceIdx) => {
                const index = vWin.startIndex + sliceIdx;
                const isMe = msg.author.id === currentUser?.id;
                const prevMsg = displayedMessages[index - 1];
                const epochMs = extractMessageEpochMs(msg);
                const prevEpochMs = prevMsg ? extractMessageEpochMs(prevMsg) : null;
                const showDateDivider =
                  epochMs !== null &&
                  (prevEpochMs === null || getLocalDayKey(epochMs) !== getLocalDayKey(prevEpochMs));
                const isSameAuthorAsPrev =
                  prevMsg &&
                  !showDateDivider &&
                  prevMsg.author.id === msg.author.id &&
                  prevMsg.timestamp === msg.timestamp;

                const isNewMessagesStart =
                  initialUnreadDividerCount > 0 &&
                  index === Math.max(0, displayedMessages.length - initialUnreadDividerCount);

                const dateDividerNode = showDateDivider && epochMs !== null && (
                  <div className="flex items-center gap-3 my-3.5 select-none">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="px-3 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-semibold text-white/60 tracking-wide">
                      {formatDateDividerLabel(epochMs, language, nowMs)}
                    </span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                );

                if (msg.author.id === 'system-call') {
                  return (
                    <React.Fragment key={msg.id}>
                      {dateDividerNode}
                      <div className="flex justify-center my-2.5">
                        <div className="px-4 py-2 rounded-2xl border border-white/10 bg-white/[0.04] flex flex-wrap items-center gap-3 text-xs text-white/80 shadow-sm">
                          <span className="text-base">{msg.author.avatar || '📞'}</span>
                          <span className="font-medium select-text">{msg.content}</span>
                          <span className="text-[10px] font-mono text-white/40">{msg.timestamp}</span>
                          {isDM && dmPartner && !directCall && (
                            <button
                              type="button"
                              onClick={() => startDirectCall(dmPartner)}
                              className="px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/35 text-emerald-300 text-[11px] font-bold flex items-center gap-1 transition"
                            >
                              <Phone className="w-3 h-3" />
                              <span>Geri Ara</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                }

                const isActionOpen = openActionMsgId === msg.id;
                const actionToolbarNode = (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute -top-3.5 right-2 ${
                      isActionOpen
                        ? 'opacity-100 pointer-events-auto z-30'
                        : 'opacity-0 pointer-events-none group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto group-focus-within/msg:opacity-100 group-focus-within/msg:pointer-events-auto z-20'
                    } transition-opacity flex items-center gap-0.5 bg-slate-900/95 border border-white/15 rounded-full px-1.5 py-0.5 shadow-xl backdrop-blur-md select-none`}
                  >
                    {['👍', '❤️', '🔥'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => addReaction(msg.id, emoji)}
                        className="text-xs hover:scale-125 transition-transform px-1 py-0.5"
                        title={`${emoji} tepkisi ver`}
                        aria-label={`${emoji} tepkisi ver`}
                      >
                        {emoji}
                      </button>
                    ))}
                    <div className="w-[1px] h-3 bg-white/20 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => setReplyingTo({ id: msg.id, username: msg.author.username, content: msg.content || 'Ek / Medya' })}
                      title="Yanıtla"
                      aria-label="Mesajı yanıtla"
                      className="p-1 rounded-full text-xs text-slate-400 hover:text-blue-400 transition-colors"
                    >
                      <CornerUpLeft className="w-3 h-3" />
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenActionMsgId((prev) => (prev === msg.id ? null : msg.id))}
                        title={t(language, 'moreActions')}
                        aria-label={t(language, 'moreActions')}
                        className={`p-1 rounded-full text-xs transition-colors ${
                          isActionOpen ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                      {isActionOpen && (
                        <div className="absolute right-0 top-7 z-40 w-44 rounded-2xl ios-glass border border-white/15 shadow-2xl p-1.5 text-xs text-white animate-fade-in">
                          <div className="flex items-center justify-around pb-1 mb-1 border-b border-white/10">
                            {['😂', '🎉', '💀', '👀'].map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => {
                                  addReaction(msg.id, em);
                                  setOpenActionMsgId(null);
                                }}
                                className="p-1 rounded-lg hover:bg-white/10 text-sm transition hover:scale-110"
                                aria-label={`${em} tepkisi ver`}
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                          {!isDM && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveThreadMsgId(msg.id);
                                setOpenActionMsgId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-cyan-300"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Alt Konu Aç</span>
                            </button>
                          )}
                          {msg.content && (
                            <button
                              type="button"
                              onClick={() => {
                                handleCopyMessage(msg.id, msg.content);
                                setOpenActionMsgId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
                            >
                              {copiedMsgId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>Mesajı Kopyala</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              togglePinMessage(msg.id);
                              setOpenActionMsgId(null);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
                          >
                            <Pin className={`w-3.5 h-3.5 ${msg.isPinned ? 'text-amber-400' : ''}`} />
                            <span>{msg.isPinned ? 'Sabitlemeyi Kaldır' : 'Mesajı Sabitle'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              toggleBookmarkMessage(msg);
                              setOpenActionMsgId(null);
                            }}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
                          >
                            <Bookmark
                              className={`w-3.5 h-3.5 ${
                                bookmarkedMessages.some((b) => b.id === msg.id) ? 'text-cyan-400' : ''
                              }`}
                            />
                            <span>
                              {bookmarkedMessages.some((b) => b.id === msg.id) ? 'Yer İminden Kaldır' : 'Yer İmlerine Ekle'}
                            </span>
                          </button>
                          {isMe && msg.content && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsgId(msg.id);
                                setEditingText(msg.content);
                                setOpenActionMsgId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-amber-300"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Düzenle</span>
                            </button>
                          )}
                          {(isMe || isUserServerOwner(currentUser, activeServer)) && (
                            <button
                              type="button"
                              onClick={() => {
                                deleteMessage(msg.id);
                                setOpenActionMsgId(null);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-rose-500/20 text-left text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Sil</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );

                const bodyInnerNode = (
                  <>
                    {/* Text Content with Code Block Formatting or Inline Edit */}
                    {editingMsgId === msg.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmed = editingText.trim();
                          if (trimmed && trimmed !== msg.content) {
                            editMessage(msg.id, trimmed);
                          }
                          setEditingMsgId(null);
                        }}
                        className="flex items-center gap-1.5 min-w-[220px]"
                      >
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingMsgId(null);
                          }}
                          autoFocus
                          className="flex-1 bg-black/30 border border-white/20 rounded-lg px-2.5 py-1 text-xs text-white outline-none focus:border-white/50"
                        />
                        <button
                          type="submit"
                          title="Kaydet"
                          aria-label="Düzenlemeyi kaydet"
                          className="p-1 rounded-md bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-200 transition"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMsgId(null)}
                          title="İptal"
                          aria-label="Düzenlemeyi iptal et"
                          className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white/70 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <>
                        {msg.replyTo && (
                          <button
                            type="button"
                            onClick={() => handleJumpToMessage(msg.replyTo!.id)}
                            className="mb-1.5 px-2.5 py-1.5 rounded-lg bg-black/25 hover:bg-black/40 border-l-2 border-blue-400 text-[11px] text-white/75 text-left w-full flex items-center gap-1.5 transition cursor-pointer"
                            title="Yanıtlanan mesaja atla"
                          >
                            <CornerUpLeft className="w-3 h-3 text-blue-300 shrink-0" />
                            <span className="font-semibold text-blue-300 shrink-0">@{msg.replyTo.username}:</span>
                            <span className="truncate">{msg.replyTo.content}</span>
                          </button>
                        )}
                        {msg.content && (
                          <div className="select-text">
                            {isE2eeCiphertext(msg.content) ? (
                              <div className="inline-flex items-start gap-1.5">
                                <span
                                  className="mt-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-bold text-emerald-300 shrink-0"
                                  title="Uçtan Uca Şifreli Mesaj (E2EE)"
                                >
                                  <Lock className="w-2.5 h-2.5" /> E2EE
                                </span>
                                <span>
                                  {decryptedDmMap[msg.id]
                                    ? renderMessageContent(decryptedDmMap[msg.id])
                                    : '🔒 Şifreli mesaj (anahtar bekleniyor...)'}
                                </span>
                              </div>
                            ) : (
                              renderMessageContent(msg.content)
                            )}
                            {isSameAuthorAsPrev && msg.isEdited && (
                              <span className="ml-1.5 text-[10px] italic opacity-60">(düzenlendi)</span>
                            )}
                            {showLinkPreviews &&
                              !isE2eeCiphertext(msg.content) &&
                              (!msg.attachments || msg.attachments.length === 0) && (
                                <LinkPreviewCard
                                  text={msg.content}
                                  host={currentServerHost}
                                  enabled={showLinkPreviews}
                                />
                              )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Interactive Poll Card */}
                    {msg.poll && (
                      <div className="mt-2 p-3 rounded-xl bg-slate-950/60 border border-white/15 space-y-2 min-w-[240px] max-w-md">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-1">
                          <BarChart2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>{msg.poll.question}</span>
                        </div>
                        <div className="space-y-1.5">
                          {msg.poll.options.map((opt) => {
                            const isVoted = currentUser && opt.votes.includes(currentUser.username);
                            const total = msg.poll!.totalVotes || 1;
                            const pct = total > 0 ? Math.round((opt.votes.length / total) * 100) : 0;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => votePoll(msg.id, opt.id)}
                                className={`w-full relative overflow-hidden flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-all ${
                                  isVoted
                                    ? 'border-emerald-500 bg-emerald-500/20 text-white font-semibold'
                                    : 'border-white/5 bg-white/5 text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                <div
                                  className="absolute left-0 top-0 bottom-0 bg-emerald-500/25 transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                                <span className="relative z-10 truncate">{opt.text}</span>
                                <span className="relative z-10 text-[10px] text-slate-400 font-mono ml-2">
                                  %{pct} ({opt.votes.length})
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-[10px] text-slate-400 pt-1 border-t border-white/10 flex items-center justify-between select-none">
                          <span>Toplam {msg.poll.totalVotes || 0} oy</span>
                          <span className="text-emerald-400">Oylamak için dokunun</span>
                        </div>
                      </div>
                    )}

                    {/* Attachments rendering */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="space-y-2 pt-1">
                        {msg.attachments.map((att) => {
                          const resolvedUrl = resolveMediaUrl(att.url, currentServerHost);
                          if (att.type.startsWith('audio/')) {
                            return (
                              <div key={att.id} className="pt-1">
                                <VoiceNotePlayer url={resolvedUrl} authorName={msg.author.username} />
                              </div>
                            );
                          }

                          const isImage = att.type.startsWith('image/');
                          if (isImage) {
                            return (
                              <div key={att.id} className="relative group/att overflow-hidden rounded-xl max-w-md">
                                <img
                                  src={resolvedUrl}
                                  alt={att.name}
                                  onClick={() => setLightboxImage(resolvedUrl)}
                                  className="max-h-64 max-w-full rounded-xl cursor-pointer hover:opacity-95 transition object-cover shadow-lg"
                                />
                                <div className="absolute top-2 right-2 opacity-0 group-hover/att:opacity-100 transition flex items-center gap-1.5">
                                  <a
                                    href={resolvedUrl}
                                    download={att.name}
                                    className="p-1.5 rounded-lg bg-black/60 hover:bg-black text-white text-xs backdrop-blur-md shadow"
                                    title="İndir"
                                    aria-label={`${att.name} indir`}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={att.id}
                              className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/20 border border-white/10 max-w-sm"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 text-white/80">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="truncate">
                                  <div className="text-xs font-semibold truncate text-white">{att.name}</div>
                                  <div className="text-[10px] text-white/50">{formatFileSize(att.size)}</div>
                                </div>
                              </div>

                              <a
                                href={resolvedUrl}
                                download={att.name}
                                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition shrink-0"
                                title="Dosyayı İndir"
                                aria-label={`${att.name} dosyasını indir`}
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );

                const reactionsAndThreadsNode = (
                  <>
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 px-0.5 select-none">
                        {Object.entries(msg.reactions).map(([emoji, usernames]) => {
                          const hasMyVote = currentUser && usernames.includes(currentUser.username);
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => addReaction(msg.id, emoji)}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
                                hasMyVote
                                  ? 'ui-accent-soft'
                                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                              }`}
                              title={`Tepki verenler: ${usernames.join(', ')}`}
                            >
                              <span>{emoji}</span>
                              <span className="font-bold text-[10px]">{usernames.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!isDM && msg.threadMessages && msg.threadMessages.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveThreadMsgId(msg.id)}
                        className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/25 text-[11px] font-semibold text-cyan-300 transition"
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>{msg.threadMessages.length} alt konu yanıtı</span>
                      </button>
                    )}
                  </>
                );

                return (
                  <React.Fragment key={msg.id}>
                    {dateDividerNode}
                    {isNewMessagesStart && (
                      <div className="flex items-center gap-3 my-3 select-none">
                        <div className="flex-1 h-px bg-rose-500/40" />
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                          {t(language, 'newMessagesDivider')}
                        </span>
                        <div className="flex-1 h-px bg-rose-500/40" />
                      </div>
                    )}

                    {useClassicLayout ? (
                      <div
                        id={`message-${msg.id}`}
                        className={`relative group/msg chat-msg-row flex items-start ${
                          isActionOpen ? 'z-30' : 'hover:z-20 focus-within:z-20'
                        } ${
                          isCompact ? 'gap-2.5 py-0.5' : 'gap-3 py-1'
                        } px-2.5 rounded-xl hover:bg-white/[0.03] transition-colors ${
                          isSameAuthorAsPrev ? 'mt-0.5' : 'mt-3'
                        } ${
                          highlightedMessageId === msg.id
                            ? 'ring-2 ring-amber-400 bg-amber-500/15'
                            : ''
                        }`}
                      >
                        {actionToolbarNode}
                        <div className={`shrink-0 flex justify-center ${isCompact ? 'w-7' : 'w-9'}`}>
                          {!isSameAuthorAsPrev ? (
                            <button
                              type="button"
                              onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                              className={`${
                                isCompact ? 'w-7 h-7' : 'w-9 h-9'
                              } chat-msg-avatar rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm shadow select-none cursor-pointer transition hover:scale-105 overflow-hidden`}
                              title={`${msg.author.username} profilini görüntüle`}
                              aria-label={`${msg.author.username} profilini görüntüle`}
                            >
                              <AvatarView avatar={msg.author.avatar} alt={msg.author.username} />
                            </button>
                          ) : (
                            <span className="text-[9px] text-white/25 opacity-0 group-hover/msg:opacity-100 transition pt-1 font-mono select-none">
                              {msg.timestamp}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {!isSameAuthorAsPrev && (
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                                style={{ color: getAuthorColor(msg.author.username) }}
                                className="text-xs font-bold hover:underline cursor-pointer transition"
                              >
                                {isMe ? `${msg.author.username} (Sen)` : msg.author.username}
                              </button>
                              {msg.author.username === 'AI Asistan' && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded-full border border-indigo-500/30">
                                  <Sparkles className="w-2.5 h-2.5 text-indigo-400" /> AI BOT
                                </span>
                              )}
                              <span className="text-[10px] text-white/35 select-none">
                                {msg.timestamp}
                                {msg.isEdited && <span className="ml-1 italic text-white/40">(düzenlendi)</span>}
                              </span>
                              {msg.isPinned && (
                                <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                                  <Pin className="w-2.5 h-2.5" /> Sabitlendi
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            className={`space-y-1.5 ${
                              chatFontSize === 'sm' ? 'text-xs' : chatFontSize === 'lg' ? 'text-base' : 'text-sm'
                            } leading-relaxed break-words text-white/90`}
                          >
                            {bodyInnerNode}
                          </div>
                          {reactionsAndThreadsNode}
                        </div>
                      </div>
                    ) : (
                      <div
                        id={`message-${msg.id}`}
                        className={`relative flex gap-3 items-end group chat-msg-row ${
                          isActionOpen ? 'z-30' : 'hover:z-20 focus-within:z-20'
                        } ${
                          isMe ? 'justify-end' : 'justify-start'
                        } ${isSameAuthorAsPrev ? 'mt-1' : 'mt-4'} ${
                          highlightedMessageId === msg.id
                            ? 'ring-2 ring-amber-400 bg-amber-500/15 p-2 rounded-2xl shadow-xl shadow-amber-500/20 transition-all duration-300'
                            : 'transition-all duration-200'
                        }`}
                      >
                        {!isMe && (
                          <button
                            type="button"
                            onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                            className="w-8 h-8 chat-msg-avatar rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm shrink-0 shadow select-none cursor-pointer transition hover:scale-105 overflow-hidden"
                            title={`${msg.author.username} profilini görüntüle`}
                            aria-label={`${msg.author.username} profilini görüntüle`}
                          >
                            <AvatarView avatar={msg.author.avatar} alt={msg.author.username} />
                          </button>
                        )}

                        <div className={`relative group/msg flex flex-col max-w-[75%] sm:max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                          {actionToolbarNode}

                          {!isSameAuthorAsPrev && (
                            <div className="flex items-center gap-2 mb-1 px-1">
                              <button
                                type="button"
                                onClick={() => handleAuthorClick(msg.author.id, msg.author.username, msg.author.avatar)}
                                style={{ color: getAuthorColor(msg.author.username) }}
                                className="text-[11px] font-bold hover:underline cursor-pointer transition"
                              >
                                {isMe ? 'Sen' : msg.author.username}
                              </button>
                              {msg.author.username === 'AI Asistan' && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded-full border border-indigo-500/30">
                                  <Sparkles className="w-2.5 h-2.5 text-indigo-400" /> AI BOT
                                </span>
                              )}
                              <span className="text-[10px] text-white/30 select-none">
                                {msg.timestamp}
                                {msg.isEdited && <span className="ml-1 italic text-white/40">(düzenlendi)</span>}
                                {activeServer?.id === 'direct-messages' &&
                                  isMe &&
                                  msg.id === lastMyMessageId &&
                                  activeDMUser?.username &&
                                  dmReadReceipts[activeDMUser.username] && (
                                    <span className="ml-1.5 text-emerald-400 font-semibold" title="Okundu">
                                      ✓✓ Görüldü
                                    </span>
                                  )}
                              </span>
                              {msg.isPinned && (
                                <span className="flex items-center gap-0.5 text-[9px] font-semibold text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded-full border border-amber-500/30">
                                  <Pin className="w-2.5 h-2.5" /> Sabitlendi
                                </span>
                              )}
                            </div>
                          )}

                          <div
                            className={`space-y-2 chat-msg-bubble ${
                              isCompact ? 'px-3 py-1.5' : 'px-4 py-2.5'
                            } ${
                              chatFontSize === 'sm' ? 'text-xs' : chatFontSize === 'lg' ? 'text-base' : 'text-sm'
                            } leading-relaxed break-words shadow-md transition-all ${
                              isMe
                                ? 'ui-accent-bg rounded-2xl rounded-br-sm'
                                : 'chat-bubble-incoming rounded-2xl rounded-bl-sm'
                            }`}
                          >
                            {bodyInnerNode}
                          </div>

                          {reactionsAndThreadsNode}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              {vWin.paddingBottom > 0 && <div style={{ height: vWin.paddingBottom }} aria-hidden="true" />}
            </>
          );
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending Attachments Preview Shelf */}
      {pendingAttachments.length > 0 && (
        <div className="px-6 py-2 bg-neutral-900/80 border-t border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar select-none animate-fade-in">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative group shrink-0 flex items-center gap-2 p-1.5 pl-2.5 rounded-xl bg-white/10 border border-white/15 text-xs text-white max-w-[200px]"
            >
              {att.type.startsWith('image/') ? (
                <img
                  src={resolveMediaUrl(att.url, currentServerHost)}
                  alt={att.name}
                  className="w-6 h-6 rounded object-cover shrink-0"
                />
              ) : (
                <FileText className="w-4 h-4 shrink-0 text-blue-400" />
              )}
              <span className="truncate text-[11px]">{att.name}</span>
              <button
                type="button"
                onClick={() => removePendingAttachment(att.id)}
                className="w-5 h-5 rounded-full hover:bg-white/20 text-white/60 hover:text-white flex items-center justify-center transition ml-1"
                title="Kaldır"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Message Input Box - iOS Messages Capsule Bar */}
      <div className="relative z-20 px-3 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6 pt-2 shrink-0 select-none">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
        />

        {isVoiceRecording ? (
          <div className="ios-glass-card rounded-full px-5 py-2.5 flex items-center justify-between shadow-2xl border border-red-500/30 bg-red-950/30 animate-pulse">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-bold text-red-400 font-mono">
                {Math.floor(voiceRecordSeconds / 60).toString().padStart(2, '0')}:
                {(voiceRecordSeconds % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-xs text-white/80 font-medium hidden sm:inline">
                Sesli mesaj kaydediliyor...
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs font-semibold transition"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={finishVoiceRecording}
                className="px-4 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Gönder</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Typing Indicator */}
            {(() => {
              const activeTypers = activeChannelTypers.filter(
                (u) => u !== currentUser?.username && !currentUser?.blockedUsers?.includes(u)
              );
              if (activeTypers.length === 0) return null;
              const text =
                activeTypers.length === 1
                  ? `${activeTypers[0]} yazıyor...`
                  : activeTypers.length === 2
                  ? `${activeTypers[0]} ve ${activeTypers[1]} yazıyor...`
                  : `${activeTypers.length} kişi yazıyor...`;
              return (
                <div className="flex items-center gap-2 px-4 pb-1.5 text-[11px] text-white/60 animate-fade-in">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="font-medium">{text}</span>
                </div>
              );
            })()}
            {/* Scroll to Bottom Floating Pill */}
            {(showScrollBottom || pendingNewBelow > 0) && (
              <button
                type="button"
                onClick={() => {
                  setPendingNewBelow(0);
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="absolute -top-12 right-2 z-20 px-3 py-1.5 rounded-full ui-accent-bg text-xs font-semibold flex items-center gap-1.5 shadow-xl border transition animate-fade-in"
                aria-label={t(language, 'scrollToBottom')}
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>
                  {pendingNewBelow > 0
                    ? `${pendingNewBelow} ${t(language, 'newMessagesBelow')}`
                    : t(language, 'scrollToBottom')}
                </span>
              </button>
            )}

            {/* Reply Preview Banner */}
            {replyingTo && (
              <div className="mb-2 px-4 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-between text-xs animate-fade-in">
                <div className="flex items-center gap-2 min-w-0">
                  <CornerUpLeft className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-blue-300 font-semibold shrink-0">@{replyingTo.username}</span>
                  <span className="text-white/60 truncate">{replyingTo.content}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="text-white/40 hover:text-white p-1 rounded-full hover:bg-white/10 transition shrink-0"
                  title="Yanıtı İptal Et"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Emoji Picker Popover */}
            {isEmojiPickerOpen && (
              <div className="absolute bottom-14 right-0 z-30 w-[calc(100vw-24px)] max-w-72 p-3 rounded-2xl ios-glass border border-white/15 shadow-2xl space-y-3 animate-slide-up">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                  <span className="text-xs font-bold text-white/90">Emoji Seç</span>
                  <button
                    type="button"
                    onClick={() => setIsEmojiPickerOpen(false)}
                    className="text-white/40 hover:text-white transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {activeServer?.customEmojis && activeServer.customEmojis.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-300/80 mb-1.5">
                        Sunucu Emojileri
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {activeServer.customEmojis.map((ce) => (
                          <button
                            key={ce.id}
                            type="button"
                            onClick={() => {
                              setPendingAttachments((prev) => [
                                ...prev,
                                { id: `emj-${Date.now()}`, name: `${ce.name}.png`, size: 1024, type: 'image/png', url: ce.url }
                              ]);
                              setIsEmojiPickerOpen(false);
                            }}
                            title={`:${ce.name}:`}
                            className="h-8 rounded-lg hover:bg-white/15 flex items-center justify-center p-1 transition hover:scale-110"
                          >
                            <img src={ce.url} alt={ce.name} className="w-6 h-6 object-contain rounded" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {EMOJI_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {group.emojis.map((em) => (
                          <button
                            key={em}
                            type="button"
                            onClick={() => setInputText((prev) => prev + em)}
                            className="h-8 rounded-lg hover:bg-white/15 flex items-center justify-center text-lg transition hover:scale-110"
                          >
                            {em}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mentionCandidates.length > 0 && (
              <div className="mb-2 rounded-2xl bg-[#131620]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Kullanıcı Etiketle (@)
                </div>
                {mentionCandidates.map((u, idx) => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => applyMention(u.username)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-left transition ${
                      idx === mentionIndex ? 'bg-amber-500/20 text-white' : 'hover:bg-white/10 text-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0">
                        <AvatarView avatar={u.avatar} alt={u.username} fallback="👤" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-xs font-bold">@{u.username}</span>
                    </div>
                    <span className={`text-[10px] ${u.status === 'offline' ? 'text-white/35' : 'text-emerald-400'}`}>
                      {u.status === 'offline' ? 'Çevrimdışı' : 'Çevrimiçi'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {inputText.startsWith('/') && !inputText.includes(' ') && (
              <div className="mb-2 rounded-2xl bg-[#131620]/95 border border-white/15 p-2 shadow-2xl backdrop-blur-xl space-y-0.5">
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Slash Komutları
                </div>
                {SLASH_COMMANDS.filter((c) => c.cmd.startsWith(inputText.toLowerCase())).map((c) => (
                  <button
                    key={c.cmd}
                    type="button"
                    onClick={() => setInputText(c.cmd === '/temizle' ? '/temizle 10' : c.cmd)}
                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-white/10 text-left transition"
                  >
                    <span className="text-xs font-mono font-bold text-cyan-300">{c.cmd}</span>
                    <span className="text-[11px] text-white/55">{c.desc}</span>
                  </button>
                ))}
              </div>
            )}

            {activeChannel?.id && <OfflineQueueBanner channelId={activeChannel.id} />}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submitCurrentMessage();
              }}
              className="ios-glass-card rounded-3xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-end gap-1.5 sm:gap-2.5 shadow-2xl border border-white/15 ui-focus-accent transition-all"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition shrink-0"
                title="Resim veya Dosya Ekle"
                aria-label="Resim veya Dosya Ekle"
              >
                <Plus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleQuickScreenshot}
                disabled={isCapturingScreenshot}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-cyan-500/20 text-white/70 hover:text-cyan-300 flex items-center justify-center transition shrink-0 disabled:opacity-50"
                title="Hızlı Ekran Görüntüsü Al ve Ekle"
                aria-label="Hızlı Ekran Görüntüsü Al"
              >
                <Camera className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsGifModalOpen(true)}
                className="h-8 px-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[10px] font-bold tracking-wider transition shrink-0 border border-white/10"
                title="GIF Arama & Ekleme"
                aria-label="GIF Ara"
              >
                GIF
              </button>

              {isDM && (dmPartner?.e2eePublicKey || onlineUsers.find((u) => u.id === dmPartner?.id)?.e2eePublicKey) && (
                <div className="flex items-center gap-1 shrink-0 h-8">
                  <button
                    type="button"
                    onClick={() => setDmE2eeEnabled((v) => !v)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider transition border flex items-center gap-1 ${
                      dmE2eeEnabled
                        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-sm shadow-emerald-500/20'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white/70 hover:text-white'
                    }`}
                    title={dmE2eeEnabled ? 'Uçtan Uca Şifreleme (E2EE) Aktif' : 'Uçtan Uca Şifreli Sohbeti Aç (E2EE)'}
                    aria-label="Uçtan Uca Şifreleme (E2EE)"
                  >
                    <Lock className="w-3 h-3" />
                    <span>E2EE</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSafetyModalOpen(true)}
                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-emerald-500/20 border border-white/10 text-emerald-300 flex items-center justify-center transition"
                    title="E2EE Güvenlik Numarasını Doğrula"
                    aria-label="E2EE Güvenlik Numarasını Doğrula"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!isDM && (
                <button
                  type="button"
                  onClick={() => setIsPollModalOpen(true)}
                  className="w-8 h-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition shrink-0"
                  title="Anket Başlat (Poll)"
                  aria-label="Anket Başlat"
                >
                  <BarChart2 className="w-4 h-4" />
                </button>
              )}

              {slowmodeRemaining > 0 ? (
                <div className="flex-1 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>Yavaş Mod aktif: Lütfen {slowmodeRemaining} saniye bekleyin...</span>
                </div>
              ) : (
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={inputText}
                  onKeyDown={(e) => {
                    if (mentionCandidates.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setMentionIndex((prev) => (prev + 1) % mentionCandidates.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setMentionIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
                        return;
                      }
                      if (e.key === 'Tab' || e.key === 'Enter') {
                        e.preventDefault();
                        applyMention(mentionCandidates[mentionIndex]?.username || mentionCandidates[0].username);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setMentionIndex(0);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void submitCurrentMessage();
                      return;
                    }
                    if (e.key === 'ArrowUp' && !inputText.trim() && lastMyMessageId) {
                      const target = messages.find((m) => m.id === lastMyMessageId);
                      if (target && !isE2eeCiphertext(target.content)) {
                        e.preventDefault();
                        setEditingMsgId(target.id);
                        setEditingText(target.content);
                      }
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputText(val);
                    setDraft(activeDraftKey, val);
                    setMentionIndex(0);
                    if (val.trim().length > 0) {
                      if (!isTypingRef.current) {
                        isTypingRef.current = true;
                        sendTyping(true);
                      }
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                      typingTimeoutRef.current = setTimeout(() => {
                        isTypingRef.current = false;
                        sendTyping(false);
                      }, 2500);
                    } else if (isTypingRef.current) {
                      isTypingRef.current = false;
                      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                      sendTyping(false);
                    }
                  }}
                  placeholder={
                    isDM
                      ? `@${dmPartner?.username || 'Sohbet'} — ${t(language, 'messagePlaceholder')}`
                      : `#${activeChannel.name} — ${t(language, 'messagePlaceholder')}`
                  }
                  aria-label="Mesaj yaz"
                  className="flex-1 min-w-0 bg-transparent text-white placeholder-white/30 text-base sm:text-sm outline-none px-1 sm:px-2 py-1 resize-none max-h-[140px] leading-5 overflow-y-auto"
                />
              )}

              <button
                type="button"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
                  isEmojiPickerOpen
                    ? 'bg-yellow-400/20 text-yellow-300'
                    : 'hover:bg-white/10 text-white/60 hover:text-yellow-400'
                }`}
                title="Emoji Seç"
                aria-label="Emoji Seç"
                onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
              >
                <Smile className="w-5 h-5" />
              </button>

              {!inputText.trim() && pendingAttachments.length === 0 ? (
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="w-8 h-8 rounded-full bg-emerald-500/20 hover:bg-emerald-500 border border-emerald-400/30 text-emerald-300 hover:text-white flex items-center justify-center transition shrink-0 shadow"
                  title="Sesli Mesaj Kaydet"
                  aria-label="Sesli Mesaj Kaydet"
                >
                  <Mic className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={(!inputText.trim() && pendingAttachments.length === 0) || slowmodeRemaining > 0}
                  className="w-8 h-8 rounded-full ui-accent-bg flex items-center justify-center transition disabled:opacity-20 shrink-0 shadow-md"
                  title="Gönder"
                  aria-label="Mesajı Gönder"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </form>
            <div className="hidden sm:flex justify-end pr-3 pt-1 text-[10px] text-white/30 select-none">
              {t(language, 'composerHint')}
            </div>
          </div>
        )}
      </div>

      {/* GIF Picker Modal */}
      <Suspense fallback={null}>
        <GifPickerModal
          isOpen={isGifModalOpen}
          onClose={() => setIsGifModalOpen(false)}
          onSelectGif={handleSelectGif}
        />

        {/* Poll Creation Modal */}
        <PollModal
          isOpen={isPollModalOpen}
          onClose={() => setIsPollModalOpen(false)}
          onCreatePoll={(question, options) => createPoll(question, options)}
        />

        {/* Pinned Messages Modal */}
        <PinnedMessagesModal
          isOpen={isPinModalOpen}
          onClose={() => setIsPinModalOpen(false)}
          channelName={activeChannel.name}
          pinnedMessages={messages.filter((m) => m.isPinned)}
          onUnpin={(mId) => togglePinMessage(mId)}
        />
      </Suspense>

      {/* Bookmarked Messages Modal */}
      {isBookmarksModalOpen && (
        <div
          onClick={() => setIsBookmarksModalOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-[#131620] border border-white/15 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Kaydedilen Mesajlar ({bookmarkedMessages.length})</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBookmarksModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2.5">
              {bookmarkedMessages.length === 0 ? (
                <div className="py-10 text-center text-xs text-white/45">
                  Henüz yer imlerine eklenmiş mesaj yok. Mesajların üzerindeki yer imi simgesine tıklayarak kaydedebilirsiniz.
                </div>
              ) : (
                bookmarkedMessages.map((bm) => (
                  <div
                    key={bm.id}
                    className="p-3 rounded-xl bg-white/[0.04] border border-white/10 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-bold text-cyan-300">{bm.author?.username || 'Kullanıcı'}</span>
                        <span className="text-white/35">
                          {new Date(bm.timestamp).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/85 break-words whitespace-pre-wrap">{bm.content || '[Ekli Dosya]'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleBookmarkMessage(bm)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-300 transition shrink-0"
                      title="Yer İminden Kaldır"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Image Modal */}
      {lightboxImage && (() => {
        const gallery = filteredMessages.flatMap((m) =>
          (m.attachments || [])
            .filter((att) => att.type.startsWith('image/'))
            .map((att) => ({ url: resolveMediaUrl(att.url, currentServerHost), name: att.name, author: m.author.username }))
        );
        const foundIdx = gallery.findIndex((g) => g.url === lightboxImage);
        const safeGallery = foundIdx === -1 ? [{ url: lightboxImage, name: 'Önizleme' }] : gallery;
        return (
          <ChatLightbox
            images={safeGallery}
            currentIndex={foundIdx === -1 ? 0 : foundIdx}
            onChangeIndex={(idx) => {
              const target = safeGallery[idx];
              if (target) setLightboxImage(target.url);
            }}
            onClose={() => setLightboxImage(null)}
          />
        );
      })()}

      <Suspense fallback={null}>
        {/* Channel Media Gallery Modal */}
        {isMediaModalOpen && activeChannel && (
          <ChannelMediaModal
            channelName={activeChannel.name}
            messages={messages}
            onClose={() => setIsMediaModalOpen(false)}
          />
        )}

        {/* Server Leaderboard Modal */}
        {isLeaderboardOpen && activeServer && (
          <LeaderboardModal
            serverId={activeServer.id}
            serverName={activeServer.name}
            onClose={() => setIsLeaderboardOpen(false)}
          />
        )}

        {/* Mini Games & Activities Modal */}
        {isChatMiniGamesOpen && activeChannel && (
          <MiniGamesModal
            channelId={activeChannel.id}
            onClose={() => setIsChatMiniGamesOpen(false)}
          />
        )}

        {/* Advanced Search & Jump Modal */}
        {isSearchModalOpen && activeChannel && (
          <AdvancedSearchModal
            channelName={activeChannel.name}
            messages={messages}
            onClose={() => setIsSearchModalOpen(false)}
            onJumpToMessage={handleJumpToMessage}
          />
        )}

        {/* E2EE Safety Number Verification Modal */}
        {isSafetyModalOpen && isDM && dmPartner && currentUser?.username && (() => {
          const peerPub =
            dmPartner.e2eePublicKey ||
            onlineUsers.find((u) => u.id === dmPartner.id || u.username === dmPartner.username)?.e2eePublicKey;
          if (!peerPub) return null;
          return (
            <E2eeSafetyModal
              myUsername={currentUser.username}
              peerUsername={dmPartner.username}
              peerPublicKeyJson={peerPub}
              onClose={() => setIsSafetyModalOpen(false)}
            />
          );
        })()}
      </Suspense>

      {/* Channel Notice & Topic Edit Modal */}
      {isEditingNotice && activeServer && activeChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md rounded-3xl ios-glass p-6 border border-white/15 text-white space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold tracking-tight">Kanal Konusu & Sabit Duyuru</h3>
              <button
                onClick={() => setIsEditingNotice(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Kanal Konusu / Açıklama
                </label>
                <input
                  type="text"
                  value={topicEditText}
                  onChange={(e) => setTopicEditText(e.target.value)}
                  placeholder="Örn: Genel sohbet, duyurular ve kurallar"
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500 transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📌 Sabit Başlık & Duyuru (Kanal Üstünde Sabitlenir)</span>
                </label>
                <textarea
                  value={noticeEditText}
                  onChange={(e) => setNoticeEditText(e.target.value)}
                  rows={3}
                  placeholder="Kanalın en üstünde herkesin göreceği sabit duyuru mesajı..."
                  className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-blue-500 resize-none transition"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingNotice(false)}
                className="px-4 py-2 text-xs text-white/60 hover:text-white transition"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  updateChannelNotice(
                    activeServer.id,
                    activeChannel.id,
                    noticeEditText.trim() || null,
                    topicEditText.trim()
                  );
                  setIsEditingNotice(false);
                }}
                className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 transition"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {activeThreadMessage && (
        <Suspense fallback={null}>
          <ThreadPanel
            message={activeThreadMessage}
            onClose={() => setActiveThreadMsgId(null)}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <GlobalInboxModal
          isOpen={isGlobalInboxOpen}
          onClose={() => setIsGlobalInboxOpen(false)}
        />
        <ServerEventsModal
          isOpen={isEventsModalOpen}
          onClose={() => setIsEventsModalOpen(false)}
        />
      </Suspense>
    </main>
  );
};