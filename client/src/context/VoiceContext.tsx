import { createContext, useContext } from 'react';
import type { GroupDmRoom, IncomingVoiceScreenAnnotation, ScreenShareSettings, VoiceScreenAnnotationStroke } from '../types';
import type { NoiseDspProfile } from '../utils/noiseDspProfiles';

export interface AudioWorkletTelemetry {
  db: number;
  noiseFloorDb: number;
  gateOpen: boolean;
  gainReductionDb: number;
  bandSuppression?: { low: number; mid: number; high: number };
}

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
  voiceGateDb: number;
  setVoiceGateDb: (db: number) => void;
  noiseAggressiveness: number;
  setNoiseAggressiveness: (val: number) => void;
  noiseProfile: NoiseDspProfile;
  setNoiseProfile: (profile: NoiseDspProfile) => void;
  voiceE2eeEnabled: boolean;
  voiceE2eeFingerprint: string | null;
  setVoiceE2eeConfig: (enabled: boolean, passphrase: string) => Promise<void>;
  globalLoudnessNormalize: boolean;
  setGlobalLoudnessNormalize: (enabled: boolean) => void;
  liveAudioTelemetry: AudioWorkletTelemetry;
  globalMuteShortcut: string;
  setGlobalMuteShortcut: (key: string) => void;
  globalDeafenShortcut: string;
  setGlobalDeafenShortcut: (key: string) => void;
  soundboardShortcut: string;
  setSoundboardShortcut: (key: string) => void;
  joinVoiceChannel: (channelId: string, password?: string) => void;
  joinGroupDmVoice: (group: GroupDmRoom) => void;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  startScreenShare: (settings?: ScreenShareSettings, preCapturedStream?: MediaStream | null) => Promise<void>;
  stopScreenShare: () => void;
  setInputMode: (mode: 'vad' | 'ptt') => void;
  setPttKey: (key: string) => void;
  pttReleaseDelayMs: number;
  setPttReleaseDelayMs: (ms: number) => void;
  autoGameDnd: boolean;
  setAutoGameDnd: (enabled: boolean) => void;
  toggleRaiseHand: () => void;
  toggleWebcam: () => Promise<void>;
  togglePrioritySpeaker: () => void;
  stageRequestSpeak: (serverId: string, channelId: string) => void;
  stageCancelSpeak: (serverId: string, channelId: string) => void;
  stagePromoteSpeaker: (serverId: string, channelId: string, targetUsername: string) => void;
  stageDemoteSpeaker: (serverId: string, channelId: string, targetUsername: string) => void;
  stageSetTopic: (serverId: string, channelId: string, topic: string) => void;
  sendVoiceScreenAnnotation: (channelId: string, targetSharerId: string, stroke: VoiceScreenAnnotationStroke) => void;
  subscribeVoiceScreenAnnotations: (cb: (ev: IncomingVoiceScreenAnnotation) => void) => () => void;
}

export const VoiceContext = createContext<VoiceContextValue | undefined>(undefined);

export const useVoice = (): VoiceContextValue => {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used within SocketProvider');
  }
  return ctx;
};
