// 30-second song previews, streamed straight from Apple's CDN (never
// downloaded or hosted by us — that's the licensing deal). HTMLAudioElement
// also ignores the iOS silent switch natively, so no session juggling needed.

type PitchyAudio = HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };

let el: HTMLAudioElement | null = null;
let doneCb: (() => void) | null = null;

const finish = () => {
  const cb = doneCb;
  doneCb = null;
  el = null;
  cb?.();
};

export function stopPreview() {
  el?.pause();
  finish();
}

/**
 * Play a preview clip. `scramble` keeps the pitch but plays it at a
 * randomized tempo 10–25% off — recognizable enough to remind you how the
 * song goes, useless as a tempo answer. `onDone` fires when playback ends,
 * errors, or is stopped, so buttons can reset their state.
 */
export function playPreview(url: string, opts: { scramble?: boolean; onDone?: () => void } = {}) {
  stopPreview();
  const audio = new Audio(url) as PitchyAudio;
  if (opts.scramble) {
    const sign = Math.random() < 0.5 ? -1 : 1;
    audio.preservesPitch = true;
    audio.webkitPreservesPitch = true;
    audio.playbackRate = 1 + sign * (0.1 + Math.random() * 0.15);
  }
  el = audio;
  doneCb = opts.onDone ?? null;
  // guard against a replaced element's late events clobbering the new one
  const done = () => {
    if (el === audio) finish();
  };
  audio.onended = done;
  audio.onerror = done;
  audio.play().catch(done);
}
