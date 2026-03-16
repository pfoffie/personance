/**
 * Personance — Introduction View
 * Explains what Personance is. Shown on first launch and accessible via info button.
 */
import I18n from '../i18n.js';

const IntroView = (() => {

  function render({ showBack = false } = {}) {
    const t = I18n.t.bind(I18n);

    const headerHTML = showBack
      ? `<div class="header">
          <button class="back-btn" data-action="back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            ${t('general.back')}
          </button>
        </div>`
      : '';

    return `
      ${headerHTML}
      <div class="intro view-enter">
        <div class="intro-hero">
          <h1>${t('app.name')}</h1>
          <p class="intro-subtitle">${t('intro.subtitle')}</p>
        </div>

        <div class="intro-section">
          <h2>${t('intro.what')}</h2>
          <p>${t('intro.whatText')}</p>
        </div>

        <div class="intro-section">
          <h2>${t('intro.how')}</h2>
          <p>${t('intro.howText')}</p>
        </div>

        <div class="intro-section">
          <h2>${t('intro.privacy')}</h2>
          <p>${t('intro.privacyText')}</p>
        </div>

        ${!showBack ? `<div class="spacer"></div>
        <button class="primary-btn" data-action="start">${t('intro.getStarted')}</button>` : ''}
      </div>`;
  }

  function bind(el, { onStart, onBack }) {
    const controller = new AbortController();
    const { signal } = controller;

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="start"]') && typeof onStart === 'function') {
        onStart();
      }
      if (e.target.closest('[data-action="back"]') && typeof onBack === 'function') {
        onBack();
      }
    }, { signal });

    return () => controller.abort();
  }

  return { render, bind };
})();

export default IntroView;
