/**
 * Personance — Settings View
 */
import I18n from '../i18n.js';

const SettingsView = (() => {

  function render(settings, { updateAvailable = false, notificationState = {}, installAvailable = false } = {}) {
    const t = I18n.t.bind(I18n);
    const lang = I18n.currentLang();
    const notifState = {
      permission: notificationState.permission || 'default',
      pushSupported: notificationState.pushSupported !== false,
      enabled: !!settings.notificationsEnabled,
      subscription: notificationState.subscription,
    };
    const notificationStatus = _notificationStatusText(notifState, t);
    const subscriptionHint = notifState.subscription && notifState.subscription.endpoint
      ? _formatEndpoint(notifState.subscription.endpoint)
      : null;

    // Day buttons — week starts Monday, JS getDay() 0=Sun
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const dayButtons = dayOrder.map((day, i) => {
      const active = settings.availableDays.includes(day);
      return `<button data-day="${day}" class="${active ? 'active' : ''}">${t('settings.days.' + dayKeys[i])}</button>`;
    }).join('');

    // Hour grid — two rows: 0-11 and 12-23
    const hourRowAM = [];
    const hourRowPM = [];
    for (let h = 0; h < 24; h++) {
      const active = settings.availableHours.includes(h);
      const btn = `<button class="hour-btn ${active ? 'active' : ''}" data-hour="${h}">${String(h).padStart(2, '0')}</button>`;
      if (h < 12) hourRowAM.push(btn);
      else hourRowPM.push(btn);
    }

    const updateSection = updateAvailable ? `
        <div class="settings-section">
          <h2>${t('settings.updateTitle')}</h2>
          <p>${t('settings.updateDescription')}</p>
          <button class="primary-btn" id="apply-update-btn">${t('settings.updateNow')}</button>
        </div>` : '';

    return `
      <div class="header">
        <button class="back-btn" data-action="back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          ${t('general.back')}
        </button>
      </div>
      <div class="settings view-enter">
        <h1 class="text-center">${t('settings.title')}</h1>

        <div class="settings-section">
          <h2>${t('settings.availableDays')}</h2>
          <p>${t('settings.availableDaysDescription')}</p>
          <div class="day-picker">
            ${dayButtons}
          </div>
        </div>

        <div class="settings-section">
          <h2>${t('settings.availableHours')}</h2>
          <p>${t('settings.availableHoursDescription')}</p>
          <div class="hour-grid">
            <div class="hour-row">${hourRowAM.join('')}</div>
            <div class="hour-row">${hourRowPM.join('')}</div>
          </div>
        </div>

         <div class="settings-section">
           <label class="toggle-label">
             <span class="toggle-text">
               <strong>${t('settings.surprise')}</strong>
               <small>${t('settings.surpriseDescription')}</small>
            </span>
            <span class="toggle-switch ${settings.surpriseMode ? 'active' : ''}" id="surprise-toggle">
              <span class="toggle-knob"></span>
            </span>
          </label>
        </div>

		<hr/>

        <div class="settings-section">
          <h2>${t('settings.notifications')}</h2>
          <p>${t('settings.notificationsDescription')}</p>
          <label class="toggle-label">
            <span class="toggle-text">
              <strong>${t('settings.notificationsEnable')}</strong>
              <small data-notification-status>${notificationStatus}</small>
            </span>
            <span class="toggle-switch ${settings.notificationsEnabled ? 'active' : ''} ${notifState.pushSupported ? '' : 'disabled'}" id="notifications-toggle">
				<span class="toggle-knob"></span>
			</span>
          </label>
          ${subscriptionHint ? `<div class="hint-text mono">${subscriptionHint}</div>` : ''}
        </div>

        <div class="settings-section pwa-section">
          <h2>${t('settings.pwaTitle')}</h2>
          <p>${t('settings.pwaDescription')}</p>
          <button class="primary-btn" id="install-pwa-btn">${installAvailable ? t('settings.pwaInstallButton') : t('settings.pwaInstallHelp')}</button>
          <p class="hint-text">${t('settings.pwaManualText')}</p>
        </div>

        <div class="settings-section">
          <h2>${t('settings.language')}</h2>
          <select class="lang-select" id="lang-select">
            <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
            <option value="de" ${lang === 'de' ? 'selected' : ''}>Deutsch</option>
          </select>
        </div>

        ${updateSection}
      </div>`;
  }

  function bind(el, { settings, notificationState = {}, onSave, onBack, onApplyUpdate, onToggleNotifications, onInstall }) {
    const controller = new AbortController();
    const { signal } = controller;
    const t = I18n.t.bind(I18n);

    let current = {
      availableDays: [...settings.availableDays],
      availableHours: [...settings.availableHours],
      language: settings.language,
      surpriseMode: !!settings.surpriseMode,
      notificationsEnabled: !!settings.notificationsEnabled,
    };

    // Day toggle
    el.querySelectorAll('.day-picker button').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = parseInt(btn.dataset.day);
        const idx = current.availableDays.indexOf(day);
        if (idx >= 0) {
          current.availableDays.splice(idx, 1);
          btn.classList.remove('active');
        } else {
          current.availableDays.push(day);
          btn.classList.add('active');
        }
        _autoSave();
      }, { signal });
    });

    // Hour toggle
    el.querySelectorAll('.hour-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hour = parseInt(btn.dataset.hour);
        const idx = current.availableHours.indexOf(hour);
        if (idx >= 0) {
          current.availableHours.splice(idx, 1);
          btn.classList.remove('active');
        } else {
          current.availableHours.push(hour);
          btn.classList.add('active');
        }
        _autoSave();
      }, { signal });
    });

    // Language change
    const langSelect = el.querySelector('#lang-select');
    if (langSelect) {
      langSelect.addEventListener('change', () => {
        current.language = langSelect.value;
        _autoSave(true);
      }, { signal });
    }

    // Surprise toggle
    const surpriseToggle = el.querySelector('#surprise-toggle');
    if (surpriseToggle) {
      surpriseToggle.addEventListener('click', () => {
        current.surpriseMode = !current.surpriseMode;
        surpriseToggle.classList.toggle('active', current.surpriseMode);
        _autoSave();
      }, { signal });
    }

    const notificationsToggle = el.querySelector('#notifications-toggle');
    const notificationsStatus = el.querySelector('[data-notification-status]');
    if (notificationsToggle && typeof onToggleNotifications === 'function') {
      notificationsToggle.addEventListener('click', async () => {
        if (notificationsToggle.classList.contains('disabled')) return;
        notificationsStatus.textContent = t('settings.notificationsWorking');
        const result = await onToggleNotifications(!current.notificationsEnabled);
        current.notificationsEnabled = !!result.enabled;
        notificationsToggle.classList.toggle('active', current.notificationsEnabled);
        const state = {
          permission: result.permission || notificationState.permission,
          pushSupported: typeof result.pushSupported === 'boolean' ? result.pushSupported : notificationState.pushSupported,
          enabled: current.notificationsEnabled,
          subscription: result.subscription || notificationState.subscription,
        };
        notificationsStatus.textContent = _notificationStatusText(state, t);
      }, { signal });
    }

    const installBtn = el.querySelector('#install-pwa-btn');
    if (installBtn && typeof onInstall === 'function') {
      installBtn.addEventListener('click', () => onInstall(), { signal });
    }

    const applyUpdateBtn = el.querySelector('#apply-update-btn');
    if (applyUpdateBtn && typeof onApplyUpdate === 'function') {
      applyUpdateBtn.addEventListener('click', () => onApplyUpdate(), { signal });
    }

    // Back
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="back"]')) {
        onBack();
      }
    }, { signal });

    let _saveTimer = null;
    function _autoSave(langChanged = false) {
      clearTimeout(_saveTimer);
      _saveTimer = setTimeout(() => onSave(current, langChanged), 150);
    }

    return () => {
      clearTimeout(_saveTimer);
      controller.abort();
    };
  }

  function _notificationStatusText(state, t) {
    if (!state.pushSupported) return t('settings.notificationsUnsupported');
    if (state.permission === 'denied') return t('settings.notificationsDenied');
    if (state.enabled && state.permission === 'granted') return t('settings.notificationsOn');
    if (state.permission === 'granted') return t('settings.notificationsOff');
    return t('settings.notificationsPrompt');
  }

  function _formatEndpoint(endpoint) {
    if (!endpoint) return '';
    if (endpoint.length <= 44) return endpoint;
    return `${endpoint.slice(0, 26)}…${endpoint.slice(-12)}`;
  }

  return { render, bind };
})();

export default SettingsView;
