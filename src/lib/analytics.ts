// Google Analytics, loaded only after the user opts in via the consent pill.
// Nothing GA-related touches the page until consent is granted, so no cookies
// are set for users who decline or haven't answered.

export const GA_MEASUREMENT_ID = 'G-W11558S2DR';

export type Consent = 'granted' | 'denied';

const CONSENT_KEY = 'tt-consent';

export function readConsent(): Consent | null {
  const raw = localStorage.getItem(CONSENT_KEY);
  return raw === 'granted' || raw === 'denied' ? raw : null;
}

export function saveConsent(choice: Consent) {
  localStorage.setItem(CONSENT_KEY, choice);
}

export function clearConsent() {
  localStorage.removeItem(CONSENT_KEY);
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let loaded = false;

export function loadAnalytics() {
  if (loaded) return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // gtag.js requires the real `arguments` object, not a spread array
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}
