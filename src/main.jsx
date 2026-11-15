import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// Sur mobile, le clavier réduit la zone visible sans redimensionner la page : on l'expose au CSS.
const viewport = window.visualViewport;
if (viewport) {
  const sync = () => {
    document.documentElement.style.setProperty('--vvh', `${viewport.height}px`);
    document.documentElement.style.setProperty('--vvt', `${viewport.offsetTop}px`);
  };
  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync);
  sync();
}

// Après un déploiement, le nouveau service worker prend la main alors que la page affichée vient
// encore de l'ancienne version : on recharge pour ne pas rester un lancement en retard.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
