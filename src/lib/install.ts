// PWA install plumbing. Chrome/Edge/Android fire `beforeinstallprompt` once,
// early in the page's life — it must be captured at module load and stashed so
// the UI can re-offer it at the right moment (after a streak exists) instead
// of the browser's own mini-infobar.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
});

/** Already running as an installed app (home screen / start menu). */
export const isInstalled = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** The browser offered an install prompt we can replay on a user gesture. */
export const canPromptInstall = (): boolean => deferred !== null;

/**
 * iOS Safari never fires beforeinstallprompt — installing is a manual
 * Share → Add to Home Screen, so the UI shows instructions instead.
 * (iPadOS masquerades as MacIntel; the touch check catches it.)
 */
export const isIos = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Replay the captured prompt. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const ev = deferred;
  if (!ev) return false;
  deferred = null; // browsers allow prompt() only once per captured event
  await ev.prompt();
  try {
    return (await ev.userChoice).outcome === 'accepted';
  } catch {
    return false;
  }
}
