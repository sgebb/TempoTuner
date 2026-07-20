import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'recorded' | 'playing' | 'denied';

export type VolumeSample = {
  /** performance.now() timestamp — same clock as taps */
  t: number;
  /** RMS level, roughly 0..0.5 */
  level: number;
};

const METER_INTERVAL_MS = 100;

/**
 * Microphone recorder with playback. Timestamps use performance.now(), the
 * same clock as taps, so the volume envelope and playback position can be
 * drawn on the tap timeline. `playbackTime` is the current absolute timeline
 * position while playing, otherwise null.
 */
export function useRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [playbackTime, setPlaybackTime] = useState<number | null>(null);
  const [volume, setVolume] = useState<VolumeSample[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const recordStartRef = useRef<number | null>(null);
  const recordEndRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const meterRef = useRef<{ ctx: AudioContext; timer: number } | null>(null);

  const stopMeter = () => {
    if (meterRef.current) {
      window.clearInterval(meterRef.current.timer);
      meterRef.current.ctx.close().catch(() => undefined);
      meterRef.current = null;
    }
  };

  const cleanupAudio = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      cleanupAudio();
      chunksRef.current = [];
      setVolume([]);
      setPlaybackTime(null);

      // Live volume meter so the graph can show when singing happened.
      const Ctx =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const timer = window.setInterval(() => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const level = Math.sqrt(sum / data.length);
          setVolume((prev) => [...prev, { t: performance.now(), level }]);
        }, METER_INTERVAL_MS);
        meterRef.current = { ctx, timer };
      }

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        stopMeter();
        recordEndRef.current = performance.now();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        urlRef.current = URL.createObjectURL(blob);
        setStatus('recorded');
      };
      recorderRef.current = recorder;
      recordStartRef.current = performance.now();
      recorder.start();
      setStatus('recording');
    } catch {
      setStatus('denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    setPlaybackTime(null);
    setStatus('recorded');
  }, []);

  /**
   * MediaRecorder webm blobs report Infinity duration in Chrome until you
   * force a seek past the end, which makes later seeks work.
   */
  const prepareAudio = () =>
    new Promise<HTMLAudioElement | null>((resolve) => {
      if (!urlRef.current) return resolve(null);
      const audio = new Audio(urlRef.current);
      audio.addEventListener('error', () => resolve(null), { once: true });
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (Number.isFinite(audio.duration)) return resolve(audio);
          audio.addEventListener('seeked', () => resolve(audio), { once: true });
          audio.currentTime = 1e10;
        },
        { once: true }
      );
    });

  const startPlaybackAt = useCallback(
    async (offsetS: number) => {
      audioRef.current?.pause();
      const audio = await prepareAudio();
      if (!audio) return;
      audioRef.current = audio;
      audio.onended = () => stopPlayback();
      const maxS = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_VALUE;
      audio.currentTime = Math.max(0, Math.min(maxS, offsetS));
      audio.play().catch(() => stopPlayback());
      setStatus('playing');
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const tick = () => {
        if (audioRef.current && recordStartRef.current !== null) {
          setPlaybackTime(recordStartRef.current + audioRef.current.currentTime * 1000);
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [stopPlayback]
  );

  const play = useCallback(() => startPlaybackAt(0), [startPlaybackAt]);

  /** Jump playback to an absolute timeline position (starts playing if idle). */
  const seek = useCallback(
    (absMs: number) => {
      if (recordStartRef.current === null || !urlRef.current) return;
      const offsetS = (absMs - recordStartRef.current) / 1000;
      const audio = audioRef.current;
      if (audio && !audio.paused) {
        const maxS = Number.isFinite(audio.duration) ? audio.duration : Number.MAX_VALUE;
        audio.currentTime = Math.max(0, Math.min(maxS, offsetS));
      } else {
        startPlaybackAt(offsetS);
      }
    },
    [startPlaybackAt]
  );

  const clear = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    stopMeter();
    cleanupAudio();
    recordStartRef.current = null;
    recordEndRef.current = null;
    setVolume([]);
    setPlaybackTime(null);
    setStatus('idle');
  }, []);

  useEffect(() => clear, [clear]);

  return {
    status,
    playbackTime,
    volume,
    hasRecording: status === 'recorded' || status === 'playing',
    startRecording,
    stopRecording,
    play,
    seek,
    stopPlayback,
    clear,
  };
}
