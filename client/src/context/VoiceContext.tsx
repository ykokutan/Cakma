import { createContext, useContext } from 'react';
import type { ScreenShareSettings } from '../types';

export interface VoiceContextValue {
  connectedVoiceChannelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  remoteScreenStreams: Map<string, MediaStream>;
  remoteCameraStreams: Map<string, MediaStream>;
  inputMode: 'vad' | 'ptt';
  pttKey: string;
  isPttActive: boolean;
  voiceTransportMode: 'p2p' | 'sfu';
  isWebcamActive: boolean;
  webcamStream: MediaStream | null;
  isPrioritySpeakerActive: boolean;
  prioritySpeakerUsername: string | null;
  ping: number;
  joinVoiceChannel: (channelId: string, password?: string) => void;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  startScreenShare: (settings?: ScreenShareSettings, preCapturedStream?: MediaStream | null) => Promise<void>;
  stopScreenShare: () => void;
  setInputMode: (mode: 'vad' | 'ptt') => void;
  setPttKey: (key: string) => void;
  toggleRaiseHand: () => void;
  toggleWebcam: () => Promise<void>;
  togglePrioritySpeaker: () => void;
}

export const VoiceContext = createContext<VoiceContextValue | undefined>(undefined);

export const useVoice = (): VoiceContextValue => {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used within SocketProvider');
  }
  return ctx;
};
