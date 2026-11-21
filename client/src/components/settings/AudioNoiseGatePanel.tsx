import React from 'react';
import { Activity, Mic, Sliders } from 'lucide-react';
import { useVoice } from '../../context/VoiceContext';
import { useSocket } from '../../context/SocketContext';
import { t } from '../../utils/i18n';

function dbToPercent(db: number): number {
  return Math.min(100, Math.max(0, ((db + 80) / 80) * 100));
}

const AGGRESSIVENESS_PRESETS = [
  { value: 0.4, label: 'Hafif', desc: 'Doğal oda tonu' },
  { value: 0.7, label: 'Dengeli', desc: 'Önerilen günlük filtre' },
  { value: 0.95, label: 'Agresif / Klavye', desc: 'Mekanik klavye ve fan kesici' },
] as const;

export const AudioNoiseGatePanel: React.FC = () => {
  const {
    voiceGateDb,
    setVoiceGateDb,
    noiseAggressiveness,
    setNoiseAggressiveness,
    liveAudioTelemetry,
  } = useVoice();
  const { noiseSuppression, isMicTesting, toggleMicTest, language } = useSocket();

  const levelPct = dbToPercent(liveAudioTelemetry.db);
  const floorPct = dbToPercent(liveAudioTelemetry.noiseFloorDb);
  const gatePct = dbToPercent(voiceGateDb);
  const isGateOpen = liveAudioTelemetry.gateOpen;

  return (
    <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-xs font-bold text-white">{t(language, 'voiceGateTitle')}</div>
            <div className="text-[11px] text-white/45">
              AudioWorklet spektral gürültü ve geçit telemetrisi (-80 dB .. 0 dB)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
              isGateOpen
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-white/5 border-white/15 text-white/55'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isGateOpen ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'
              }`}
            />
            {isGateOpen ? t(language, 'gateOpenLabel') : t(language, 'gateClosedLabel')}
          </span>
          <button
            type="button"
            onClick={toggleMicTest}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 transition border ${
              isMicTesting
                ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>{isMicTesting ? 'Testi Durdur' : 'Canlı Test Et'}</span>
          </button>
        </div>
      </div>

      {/* Real-time dB Meter with Gate & Noise Floor markers */}
      <div className="space-y-1.5">
        <div className="relative h-4 rounded-full bg-black/60 border border-white/10 overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ${
              isGateOpen
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400'
                : 'bg-gradient-to-r from-slate-500/70 to-amber-500/70'
            }`}
            style={{ width: `${levelPct}%` }}
          />
          {/* Adaptive Noise Floor Marker */}
          <div
            title={`Gürültü Tabanı: ${Math.round(liveAudioTelemetry.noiseFloorDb)} dB`}
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-300/70"
            style={{ left: `${floorPct}%` }}
          />
          {/* Configured Gate Threshold Marker */}
          <div
            title={`Geçit Eşiği: ${voiceGateDb} dB`}
            className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
            style={{ left: `calc(${gatePct}% - 2px)` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-white/55">
          <span>Anlık Giriş: <b className="text-white">{Math.round(liveAudioTelemetry.db)} dB</b></span>
          <span>Taban: <b className="text-cyan-300">{Math.round(liveAudioTelemetry.noiseFloorDb)} dB</b></span>
          <span>Zayıflatma: <b className="text-amber-300">-{liveAudioTelemetry.gainReductionDb.toFixed(1)} dB</b></span>
        </div>
      </div>

      {/* Voice Gate dB Threshold Slider */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/75 font-medium">Konuşma Geçit Eşiği (Voice Gate)</span>
          <span className="font-mono font-bold text-amber-300">{voiceGateDb} dB</span>
        </div>
        <input
          type="range"
          min={-80}
          max={-20}
          step={1}
          value={voiceGateDb}
          onChange={(e) => setVoiceGateDb(Number(e.target.value))}
          className="w-full accent-amber-400"
        />
        <div className="flex justify-between text-[10px] text-white/35">
          <span>-80 dB (Hassas)</span>
          <span>-55 dB (Standart)</span>
          <span>-20 dB (Katı)</span>
        </div>
      </div>

      {/* Suppression Aggressiveness Presets */}
      <div className="space-y-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white/80 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t(language, 'noiseSuppressionStrength')}</span>
          </span>
          <span className="text-[10px] font-mono text-indigo-300">
            {Math.round(noiseAggressiveness * 100)}%
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {AGGRESSIVENESS_PRESETS.map((preset) => {
            const active = Math.abs(noiseAggressiveness - preset.value) < 0.08;
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setNoiseAggressiveness(preset.value)}
                className={`p-2 rounded-xl border text-left transition ${
                  active
                    ? 'bg-indigo-500/20 border-indigo-400 text-white'
                    : 'bg-white/5 border-white/10 text-white/65 hover:bg-white/10'
                }`}
              >
                <div className="text-[11px] font-bold">{preset.label}</div>
                <div className="text-[10px] text-white/45 truncate">{preset.desc}</div>
              </button>
            );
          })}
        </div>
        {!noiseSuppression && (
          <p className="text-[11px] text-amber-300/80">
            Not: Spektral gürültü azaltma için yukarıdaki &quot;Yapay Zeka Gürültü Engelleme&quot; anahtarını açık tutun.
          </p>
        )}
      </div>
    </div>
  );
};
