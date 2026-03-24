/**
 * Personance — Contact List View (main screen)
 */
import I18n from '../i18n.js';
import Scheduler from '../scheduler.js';

const ContactListView = (() => {

  function render(contacts, settings) {
    const t = I18n.t.bind(I18n);
    const lang = I18n.currentLang();
    const surpriseMode = !!(settings && settings.surpriseMode);

    if (contacts.length === 0) {
      return `
        <div class="header">
          <h1>${t('app.name')}</h1>
          <div class="header-actions">
            <button class="icon-btn" data-action="info" aria-label="Info" title="Info">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
            <button class="icon-btn" data-action="settings" aria-label="${t('settings.title')}" title="${t('settings.title')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.6 1z"/>
              </svg>
            </button>
            <button class="icon-btn" data-action="add" aria-label="${t('contacts.addNew')}" title="${t('contacts.addNew')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>${t('contacts.empty')}</p>
        </div>`;
    }

    // Sort: due contacts first, then by reminder date ascending
    const sorted = [...contacts].sort((a, b) => {
      const aDue = Scheduler.isDue(a);
      const bDue = Scheduler.isDue(b);
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      return new Date(a.reminderDate) - new Date(b.reminderDate);
    });

    const cards = sorted.map(c => {
      const isDue = Scheduler.isDue(c);
      const uncertaintyDays = Math.round((c.distance || 0) * (c.uncertainty || 0) / 100);
      const targetDateStr = `≈ ${Scheduler.formatTargetDate(c.distance, lang)} ${t('contacts.plusMinusDays', { days: uncertaintyDays })}`;
      const dateStr = isDue
        ? t('contacts.dueNow')
        : targetDateStr;
      const canReveal = surpriseMode && !isDue;
      const exactDateStr = c.reminderDate ? Scheduler.formatExactDate(c.reminderDate, lang) : '';
      return `
        <div class="contact-card ${isDue ? 'is-due' : ''}" data-action="edit" data-id="${c.id}">
          <div class="contact-card-top">
            <span class="contact-card-name">${_esc(c.name)}</span>
            ${canReveal
              ? `<button type="button" class="contact-card-date is-surprise" data-action="reveal" data-exact="${_esc(exactDateStr)}">${dateStr}</button>`
              : `<span class="contact-card-date">${dateStr}</span>`}
          </div>
          ${isDue ? `
          <button class="release-btn" data-action="release" data-id="${c.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            ${t('contacts.release')}
          </button>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="header">
        <h1>${t('app.name')}</h1>
        <div class="header-actions">
          <button class="icon-btn" data-action="info" aria-label="Info" title="Info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="settings" aria-label="${t('settings.title')}" title="${t('settings.title')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 .6 1 1.65 1.65 0 0 0 1 .33H21a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1 .33 1.65 1.65 0 0 0-.6 1z"/>
            </svg>
          </button>
          <button class="icon-btn" data-action="add" aria-label="${t('contacts.addNew')}" title="${t('contacts.addNew')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
      <div class="contact-list">
        ${cards}
      </div>`;
  }

  function bind(el, { onEdit, onRelease, onAdd, onSettings, onInfo }) {
    const controller = new AbortController();
    const { signal } = controller;

    el.addEventListener('click', (e) => {
      // Reveal exact date (surprise mode — tap on approx date)
      const revealEl = e.target.closest('[data-action="reveal"]');
      if (revealEl) {
        e.stopPropagation();
        revealEl.textContent = revealEl.dataset.exact;
        revealEl.classList.add('reveal-anim');
        revealEl.classList.remove('is-surprise');
        revealEl.removeAttribute('data-action');
        return;
      }
      // Release button (stop propagation so card edit doesn't fire)
      const releaseBtn = e.target.closest('[data-action="release"]');
      if (releaseBtn) {
        e.stopPropagation();
        onRelease(releaseBtn.dataset.id);
        return;
      }
      // Card click → edit
      const card = e.target.closest('[data-action="edit"]');
      if (card) {
        onEdit(card.dataset.id);
        return;
      }
      // Add
      if (e.target.closest('[data-action="add"]')) {
        onAdd();
        return;
      }
      // Settings
      if (e.target.closest('[data-action="settings"]')) {
        onSettings();
        return;
      }
      // Info
      if (e.target.closest('[data-action="info"]')) {
        onInfo();
      }
    }, { signal });

    return () => controller.abort();
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { render, bind };
})();

export default ContactListView;
