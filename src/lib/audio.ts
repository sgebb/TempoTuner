/**
 * iOS plays Web Audio through the "ambient" audio session, which the ringer
 * (silent) switch mutes — so the metronome and demo were silent for anyone
 * with the switch off. Promote the session to "playback" (Audio Session API,
 * iOS 17+); for older iOS, keep a silent looping <audio> element playing —
 * HTMLMediaElement audio ignores the silent switch and drags the Web Audio
 * output along with it. Must be called from a user gesture.
 */

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** A 0.1s silent 8-bit mono WAV, built in memory so nothing is downloaded. */
const silentWavUrl = (): string => {
  const samples = 800;
  const buf = new Uint8Array(44 + samples).fill(0x80, 44);
  const view = new DataView(buf.buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[offset + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
};

let silentEl: HTMLAudioElement | null = null;

export function ensureAudiblePlayback() {
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session) {
    try {
      session.type = 'playback';
      return;
    } catch {
      // fall through to the <audio> workaround
    }
  }
  if (!silentEl) {
    silentEl = new Audio(silentWavUrl());
    silentEl.loop = true;
    silentEl.setAttribute('playsinline', '');
  }
  silentEl.play().catch(() => undefined);
}
