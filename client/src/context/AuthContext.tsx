import { createContext, useContext } from 'react';
import type { User } from '../types';
import type { AppLanguage } from '../utils/i18n';
import type { UiThemeId } from './SocketContext';

export type AuthUiThemeId = UiThemeId;

export interface AuthContextValue {
  currentUser: User | null;
  isAuthenticated: boolean;
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  currentServerHost: string;
  isDedicatedServer: boolean;
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  uiTheme: UiThemeId;
  setUiTheme: (theme: UiThemeId) => void;
  maintenanceStatus: { active: boolean; message: string };
  login: (
    usernameOrEmail: string,
    password: string
  ) => Promise<{ success: boolean; requires2fa?: boolean; pending2faToken?: string; error?: string }>;
  verify2faLogin: (pending2faToken: string, code: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    avatar: string;
    inviteCode?: string;
    emailCode?: string;
    challengeToken?: string;
    challengeAnswer?: string;
    honeypot?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  requestRegisterChallenge: () => Promise<{
    token: string;
    question: string;
    inviteOnly: boolean;
    requireStrongPasswords: boolean;
    requireEmailVerification: boolean;
  } | null>;
  sendRegisterEmailCode: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  logout: () => void;
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  requestPasswordResetCode: (email: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  confirmPasswordReset: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  requestEmailChangeCode: (
    currentPassword: string,
    newEmail: string
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  confirmEmailChange: (code: string) => Promise<{ success: boolean; email?: string; message?: string; error?: string }>;
  revokeSingleSession: (targetSocketId: string) => Promise<{ success: boolean; error?: string }>;
  deleteMyAccount: (
    currentPassword: string,
    confirmText: string,
    totpCode?: string
  ) => Promise<{ success: boolean; error?: string }>;
  connectToDedicatedServer: (hostWithPort: string) => void;
  resetToMainServer: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within SocketProvider');
  }
  return ctx;
};
