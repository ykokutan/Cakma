import React, { useState, useEffect } from 'react';
import { X, Trophy, MessageSquare, Mic, Search } from 'lucide-react';
import { AvatarView } from './AvatarView';
import { useSocket } from '../context/SocketContext';
import { MemberLevelData } from '../types';

interface LeaderboardModalProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ serverId, serverName, onClose }) => {
  const { leaderboardData, fetchLeaderboard } = useSocket();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchLeaderboard(serverId);
  }, [serverId]);

  const list = (leaderboardData[serverId] || []) as MemberLevelData[];

  const filtered = list.filter((m) =>
    m.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTierBadge = (level: number) => {
    if (level >= 50) return { name: 'Efsane', color: 'from-amber-400 to-red-500', text: 'text-amber-300' };
    if (level >= 30) return { name: 'Elmas', color: 'from-cyan-400 to-blue-500', text: 'text-cyan-300' };
    if (level >= 15) return { name: 'Altın', color: 'from-yellow-400 to-amber-500', text: 'text-yellow-300' };
    if (level >= 5) return { name: 'Gümüş', color: 'from-slate-300 to-slate-400', text: 'text-slate-300' };
    return { name: 'Bronz', color: 'from-amber-700 to-amber-800', text: 'text-amber-500' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-xl bg-[#12131a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shadow-lg shadow-amber-500/20">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                Sunucu Liderlik Tablosu (XP & Seviye)
              </h3>
              <p className="text-[11px] text-white/50">{serverName} topluluğunun en aktif üyeleri</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-white/10 bg-white/[0.01]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-white/30" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Üye ara..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-amber-500 focus:outline-none text-xs text-white placeholder-white/30"
            />
          </div>
        </div>

        {/* Member List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-xs">
              <Trophy className="w-8 h-8 mx-auto mb-2 text-white/20" />
              <p>Henüz kayıtlı seviye verisi bulunmuyor.</p>
              <p className="text-[10px] text-white/30 mt-1">Sohbette mesaj yazarak ve ses odalarında vakit geçirerek XP kazanın!</p>
            </div>
          ) : (
            filtered.map((member, index) => {
              const tier = getTierBadge(member.level);
              const medal =
                index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;

              return (
                <div
                  key={member.userId}
                  className={`p-3.5 rounded-2xl border transition flex items-center justify-between ${
                    index === 0
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : index === 1
                      ? 'bg-slate-400/10 border-slate-400/30'
                      : index === 2
                      ? 'bg-amber-700/10 border-amber-700/30'
                      : 'bg-white/[0.02] border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-base font-bold w-6 text-center shrink-0">{medal}</span>
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-base shrink-0 shadow overflow-hidden">
                      <AvatarView avatar={member.avatar} alt={member.username} fallback="👤" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span className="truncate">{member.username}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md bg-white/10 ${tier.text} font-bold`}>
                          {tier.name}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/40 flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {member.messageCount || 0} mesaj
                        </span>
                        <span className="flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          {member.voiceMinutes || 0} dk ses
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-amber-300">
                      Seviye {member.level}
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      {member.xp} XP
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
