import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  // Register the service worker so the app can load quickly as a lightweight PWA.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/TempoTuner/sw.js').catch(() => {
      // Service worker registration is optional; failures should not block the app.
    });
  });
}
