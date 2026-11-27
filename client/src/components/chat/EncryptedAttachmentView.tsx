import React, { useEffect, useState } from 'react';
import { Download, FileText, Lock, ShieldAlert } from 'lucide-react';
import type { MessageAttachment } from '../../types';
import { authFetch, resolveMediaUrl } from '../../utils/authFetch';
import { decryptBinaryFromPeer } from '../../utils/e2ee';
import { decryptGroupAttachmentBytes, getCachedGroupSenderKey } from '../../utils/groupE2ee';
import { t, type AppLanguage } from '../../utils/i18n';
import { RichAttachmentPreview } from './RichAttachmentPreview';

interface EncryptedAttachmentViewProps {
  attachment: MessageAttachment;
  currentServerHost: string;
  myUsername: string;
  peerPublicKeyJson?: string | null;
  groupId?: string | null;
  groupE2eeVersion?: number;
  onOpenLightbox?: (blobUrl: string) => void;
  language?: AppLanguage;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeDataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const EncryptedAttachmentView: React.FC<EncryptedAttachmentViewProps> = ({
  attachment,
  currentServerHost,
  myUsername,
  peerPublicKeyJson,
  groupId,
  groupE2eeVersion = 0,
  onOpenLightbox,
  language = 'tr',
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const dmMeta = attachment.e2ee;
  const grpMeta = attachment.groupE2ee;
  const isGroup = Boolean(grpMeta && !dmMeta);
  const origName = grpMeta?.origName || dmMeta?.origName || attachment.name || 'encrypted-file';
  const origType = grpMeta?.origType || dmMeta?.origType || 'application/octet-stream';
  const origSize = grpMeta?.origSize ?? dmMeta?.origSize ?? attachment.size;
  const iv = grpMeta?.ivBase64 || dmMeta?.iv || '';

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    if (!iv || (!isGroup && (!myUsername || !peerPublicKeyJson)) || (isGroup && !groupId)) {
      setBlobUrl(null);
      setStatus('error');
      return;
    }

    const groupKey =
      isGroup && groupId && grpMeta
        ? getCachedGroupSenderKey(groupId, grpMeta.epoch)
        : null;
    if (isGroup && !groupKey) {
      setBlobUrl(null);
      setStatus('error');
      return;
    }

    setStatus('loading');
    setBlobUrl(null);

    const run = async () => {
      try {
        let cipherBytes: ArrayBuffer | Uint8Array;
        if (attachment.url.startsWith('data:')) {
          cipherBytes = decodeDataUrlToBytes(attachment.url);
        } else {
          const targetUrl = resolveMediaUrl(attachment.url, currentServerHost);
          const resp = await authFetch(targetUrl);
          if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
          }
          cipherBytes = await resp.arrayBuffer();
        }

        const plainBuf =
          isGroup && groupKey
            ? await decryptGroupAttachmentBytes(cipherBytes, iv, groupKey)
            : await decryptBinaryFromPeer(
                cipherBytes,
                iv,
                myUsername,
                peerPublicKeyJson!
              );
        if (!plainBuf) {
          if (!cancelled) setStatus('error');
          return;
        }

        const blob = new Blob([plainBuf], { type: origType });
        createdObjectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(createdObjectUrl);
          createdObjectUrl = null;
          return;
        }

        setBlobUrl(createdObjectUrl);
        setStatus('ready');
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
        createdObjectUrl = null;
      }
    };
  }, [
    attachment.url,
    iv,
    origType,
    currentServerHost,
    myUsername,
    peerPublicKeyJson,
    isGroup,
    groupId,
    grpMeta?.epoch,
    groupE2eeVersion,
  ]);

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-black/25 border border-emerald-500/20 max-w-sm text-xs text-emerald-200/80">
        <Lock className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
        <span className="truncate">{t(language, 'decryptingAttachment')}</span>
      </div>
    );
  }

  if (status === 'error' || !blobUrl) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 max-w-sm text-xs text-rose-200">
        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold truncate">🔒 Şifreli ek çözülemedi</div>
          <div className="text-[10px] text-rose-200/60 truncate">
            {peerPublicKeyJson ? origName : 'E2EE karşı taraf genel anahtarı eksik'}
          </div>
        </div>
      </div>
    );
  }

  if (origType.startsWith('image/')) {
    return (
      <div className="relative group/att overflow-hidden rounded-xl max-w-md border border-emerald-500/25">
        <img
          src={blobUrl}
          alt={origName}
          onClick={() => onOpenLightbox?.(blobUrl)}
          className="max-h-64 max-w-full rounded-xl cursor-pointer hover:opacity-95 transition object-cover shadow-lg"
        />
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 border border-emerald-400/40 text-[10px] font-bold text-emerald-300 backdrop-blur-md">
          <Lock className="w-2.5 h-2.5" />
          <span>E2EE</span>
        </span>
        <div className="absolute top-2 right-2 opacity-0 group-hover/att:opacity-100 transition flex items-center gap-1.5">
          <a
            href={blobUrl}
            download={origName}
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black text-white text-xs backdrop-blur-md shadow"
            title={t(language, 'downloadDecrypted')}
            aria-label={`${origName} ${t(language, 'downloadDecrypted')}`}
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  if (origType.startsWith('audio/')) {
    return (
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[9px] font-bold text-emerald-300">
          <Lock className="w-2.5 h-2.5" />
          E2EE ÇÖZÜLDÜ
        </div>
        <RichAttachmentPreview url={blobUrl} name={origName} mimeType={origType} sizeBytes={origSize} isBlobUrl />
      </div>
    );
  }

  const lowerOrig = origName.toLowerCase();
  if (
    origType === 'application/pdf' ||
    origType === 'application/zip' ||
    origType === 'text/csv' ||
    origType === 'application/json' ||
    /\.(pdf|zip|csv|json)$/i.test(lowerOrig)
  ) {
    return (
      <div className="space-y-1">
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[9px] font-bold text-emerald-300">
          <Lock className="w-2.5 h-2.5" />
          E2EE ÇÖZÜLDÜ
        </div>
        <RichAttachmentPreview url={blobUrl} name={origName} mimeType={origType} sizeBytes={origSize} isBlobUrl />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/25 border border-emerald-500/25 max-w-sm">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0 text-emerald-300">
          <FileText className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate text-white">{origName}</span>
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[9px] font-bold text-emerald-300 shrink-0">
              <Lock className="w-2.5 h-2.5" />
              E2EE
            </span>
          </div>
          <div className="text-[10px] text-white/50">
            {formatFileSize(origSize)} · {t(language, 'encryptedAttachment')}
          </div>
        </div>
      </div>

      <a
        href={blobUrl}
        download={origName}
        className="w-7 h-7 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-200 hover:text-white flex items-center justify-center transition shrink-0"
        title={t(language, 'downloadDecrypted')}
        aria-label={`${origName} ${t(language, 'downloadDecrypted')}`}
      >
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
};
