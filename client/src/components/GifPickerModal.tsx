import React, { useEffect, useState } from 'react';
import { X, Search, Sparkles, Loader2 } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

interface GifPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string, title: string) => void;
}

interface GifItem {
  id: string;
  title: string;
  url: string;
  previewUrl?: string;
  category: string;
}

const POPULAR_GIFS: GifItem[] = [
  // Gaming / CS2 / Valorant
  { id: 'g1', title: 'CS2 Headshot Victory', category: 'Oyun', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHpqd2Zmb3V5cWpmZXVyZ3hxY2psOTNrbnd4eHBsNHhjcjE1dWw3MCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7TKSjRrfIPjeiVyM/giphy.gif' },
  { id: 'g2', title: 'GG Well Played', category: 'Oyun', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG9yY3V3eDlvMnBxZGxjc3h0eW12NnVnbjZ2eHBiYWlhdTZvYjJvaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/11ISwbgGL2esE/giphy.gif' },
  { id: 'g3', title: 'Clutch or Kick', category: 'Oyun', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcjBhNGF5bjZlajQxdmkyZTZmbnhicWExNHFpMHRlZm44ZTRzYWdrayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/dMsh6gRYJDymMVFsCV/giphy.gif' },
  { id: 'g4', title: 'Victory Royale Dance', category: 'Oyun', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHYwdmFxbXN5Z3Rxb2VlOHdrcnExbnpzb3NteTZ4ZWNpcnlscW1xYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: 'g5', title: 'Rage Quit Smash', category: 'Tepki', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2ptMmkyODJrcTNjN2Z0ZWVicnV3bGNyZXFjZXkyaWRsc2Fsa2U3ZSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/11tTNkNy1SdXGg/giphy.gif' },
  { id: 'g6', title: 'Popcorn Eating', category: 'Tepki', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbnFlOXo4anJndnJydzFia252eWR5cmlwNHN3czQ5eXp3YWRjMDVpNiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/gl0mkIZOW6Nwc/giphy.gif' },
  { id: 'g7', title: 'Poggers Hype', category: 'Tepki', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWZreTNhNHN3Z3RqOXB4eWhxM2RkMWF2OW53cmxubXgxcWkwaG1iaCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/c5skRQb3BXp8RwKGKW/giphy.gif' },
  { id: 'g8', title: 'Cat Jamming Beat', category: 'Müzik', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmZ1bWRrY2huc2FzMDc3Y3M2cWlyYjNydGlzYmZ2OHp5aXhzM2VxeSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/jpbnoe3UIa8TU8LM13/giphy.gif' },
  { id: 'g9', title: 'Mind Blown', category: 'Tepki', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXk1bDRhNGkyNG1qM2FwaGhyOXo0c2k2dWZndHB2ZzR0OXNldzdzMSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26ufdipQqU2lhNA4g/giphy.gif' },
  { id: 'g10', title: 'Anime Wow', category: 'Anime', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb214M2Rsd3Q4enZ0ZnUxaGtwd2Rnbjlyam16cmE3cTY3M2ZqNW1ieSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3NtY188QaxDdC/giphy.gif' },
  { id: 'g11', title: 'Salute Respect', category: 'Tepki', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG13NWVzZWRxb3J3a3U3bDR3b2w3d3RxeHgyOWE2d2J2ZnNuMWJ6YiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/fxsAcheaMi1PnxCulG/giphy.gif' },
  { id: 'g12', title: 'Hacker Typing Fast', category: 'Oyun', url: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2k3NTRtbmU2NmhzOXN4ZXkycGcxeXR0Mzh1cWZ5NDh3c2I5a2V1MCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ule4akeXnY9fb4xFTM/giphy.gif' },
];

const CATEGORIES = ['Tümü', 'Oyun', 'Tepki', 'Müzik', 'Anime'];

export const GifPickerModal: React.FC<GifPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectGif,
}) => {
  const { currentServerHost } = useSocket();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tümü');
  const [liveGifs, setLiveGifs] = useState<GifItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGiphyActive, setIsGiphyActive] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          q: search.trim(),
          category: selectedCategory,
          limit: '24',
        });
        const res = await fetch(`${currentServerHost}/api/gifs?${params.toString()}`);
        if (!res.ok) throw new Error('HTTP error');
        const data = await res.json();
        if (cancelled) return;
        if (data?.source === 'giphy' && Array.isArray(data.gifs)) {
          setLiveGifs(data.gifs);
          setIsGiphyActive(true);
        } else {
          setLiveGifs(null);
          setIsGiphyActive(false);
        }
      } catch {
        if (!cancelled) {
          setLiveGifs(null);
          setIsGiphyActive(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, search, selectedCategory, currentServerHost]);

  if (!isOpen) return null;

  const fallbackGifs = POPULAR_GIFS.filter((gif) => {
    const matchesCategory = selectedCategory === 'Tümü' || gif.category === selectedCategory;
    const matchesSearch = !search.trim() || gif.title.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const displayedGifs = liveGifs !== null ? liveGifs : fallbackGifs;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full max-w-lg bg-[#14151b]/95 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-white animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">GIF Galerisi</h3>
            {isGiphyActive && (
              <span className="px-2 py-0.5 rounded-full bg-pink-500/20 border border-pink-500/30 text-[10px] font-bold text-pink-300">
                GIPHY
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Bar & Categories */}
        <div className="p-4 space-y-3 border-b border-white/[0.06] bg-black/20">
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="GIF Ara (CS2, GG, Gülme, Zafer, Dans)..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-white/30 outline-none focus:border-pink-500"
              autoFocus
            />
            {isLoading && (
              <Loader2 className="w-4 h-4 text-pink-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-pink-500 text-white shadow-md shadow-pink-500/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* GIF Grid */}
        <div className="p-4 overflow-y-auto max-h-[380px] grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {displayedGifs.map((gif) => (
            <div
              key={gif.id}
              onClick={() => {
                onSelectGif(gif.url, gif.title);
                onClose();
              }}
              className="relative group rounded-xl overflow-hidden aspect-video bg-black/40 border border-white/5 hover:border-pink-500/60 cursor-pointer transition-all hover:scale-[1.02] shadow"
            >
              <img
                src={gif.previewUrl || gif.url}
                alt={gif.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-2">
                <span className="text-[10px] font-bold text-white truncate">{gif.title}</span>
              </div>
            </div>
          ))}

          {!isLoading && displayedGifs.length === 0 && (
            <div className="col-span-full py-12 text-center text-white/30 text-xs">
              Eşleşen GIF bulunamadı.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
