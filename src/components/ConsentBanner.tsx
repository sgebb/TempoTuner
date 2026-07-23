import { useEffect, useState } from 'react';
import { Consent, loadAnalytics, readConsent, saveConsent } from '../lib/analytics';

/**
 * Tiny opt-in pill for analytics cookies. GA only ever loads after a "yes" —
 * decline (or no answer) means no cookies at all, so this can stay small:
 * there's nothing to configure and nothing loads by default.
 */
const ConsentBanner = () => {
  const [choice, setChoice] = useState<Consent | null>(readConsent);

  useEffect(() => {
    if (choice === 'granted') loadAnalytics();
  }, [choice]);

  if (choice !== null) return null;

  const decide = (c: Consent) => {
    saveConsent(c);
    setChoice(c);
  };

  return (
    <div className="consent" data-no-tap role="dialog" aria-label="Cookie consent">
      <span className="consent-text">🍪 OK to count visits anonymously?</span>
      <button className="consent-btn consent-yes" onClick={() => decide('granted')}>
        Yes
      </button>
      <button className="consent-btn" onClick={() => decide('denied')}>
        No
      </button>
    </div>
  );
};

export default ConsentBanner;
