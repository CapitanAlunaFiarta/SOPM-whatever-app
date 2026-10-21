import React, { useState, useEffect } from 'react';
import logo from './logo.png';

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsStandalone(checkStandalone);

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowGuideModal(true);
  };

  if (isStandalone) return null;

  return (
    <>
      <div className="pwa-download-bar pwa-install-banner">
        <div className="pwa-bar-left">
          <img src={logo} alt="Whatever Icon" className="pwa-mini-logo" />
          <div>
            <strong>Descarcă Aplicația Mobilă „Whatever” (Android & iOS)</strong>
            <p>Instalează direct din browser pe ecranul telefonului cu acces GPS & Biometric</p>
          </div>
        </div>
        <div className="pwa-bar-actions pwa-install-actions">
          <button type="button" className="btn-pwa-install" onClick={handleInstallClick}>
            📲 Instalează pe Telefon
          </button>
        </div>
      </div>

      {showGuideModal && (
        <div className="modal-overlay" onClick={() => setShowGuideModal(false)}>
          <div className="biometric-modal pwa-modal" onClick={(e) => e.stopPropagation()}>
            <img src={logo} alt="Logo" className="pwa-modal-logo" />
            <h3>Instalare Aplicație „Whatever”</h3>
            <div className="pwa-steps-box">
              <div className="pwa-os-block">
                <h4>🤖 Pe Android (Chrome / Edge / Samsung)</h4>
                <p>1. Apasă pe meniul browserului <strong>(⋮)</strong> din colțul dreapta-sus.</p>
                <p>2. Selectează <strong>„Instalează aplicația” (Install app)</strong> sau <strong>„Adaugă pe ecranul de pornire”</strong>.</p>
              </div>
              <div className="pwa-os-block">
                <h4>🍎 Pe iPhone / iOS (Safari sau Chrome)</h4>
                <p>1. Apasă pe butonul <strong>Share / Partajare (⬆️)</strong> din bara browserului.</p>
                <p>2. Derulează în jos și apasă pe <strong>„Add to Home Screen” (Adaugă la ecranul principal)</strong>.</p>
                <p>3. Apasă <strong>Add (Adaugă)</strong> în colțul dreapta-sus.</p>
              </div>
            </div>
            <button
              type="button"
              className="btn-bio-confirm"
              onClick={() => setShowGuideModal(false)}
            >
              Am înțeles
            </button>
          </div>
        </div>
      )}
    </>
  );
}