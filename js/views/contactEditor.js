/**
 * Personance — Contact Editor View
 */
import I18n from '../i18n.js';
import Scheduler from '../scheduler.js';

const ContactEditorView = (() => {

  function render(contact, settings) {
    const t = I18n.t.bind(I18n);
    const lang = I18n.currentLang();
    const isNew = !contact;

    const name = contact ? contact.name : '';
    const distance = contact ? contact.distance : 90;
    const uncertainty = contact ? contact.uncertainty : 50;

    const uncertaintyDays = Math.round(distance * uncertainty / 100);
    const uncertaintyLabel = t('contacts.uncertaintyFormat', {
      percent: uncertainty,
      days: uncertaintyDays,
    });

    const surpriseMode = !!settings.surpriseMode;
    const previewDate = (contact && contact.reminderDate)
      ? new Date(contact.reminderDate)
      : Scheduler.computeNextReminder(
          distance, uncertainty,
          settings.availableDays, settings.availableHours
        );
    const approxDateStr = `≈ ${Scheduler.formatTargetDate(distance, lang)} ${t('contacts.plusMinusDays', { days: uncertaintyDays })}`;
    const exactDateStr = Scheduler.formatExactDate(previewDate, lang);

    return `
      <div class="header">
        <button class="back-btn" data-action="back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          ${t('general.back')}
        </button>
      </div>
      <div class="editor view-enter">
        <div class="editor-field">
          <input type="text" id="contact-name" value="${_escAttr(name)}" placeholder="${t('contacts.namePlaceholder')}" autocomplete="off" />
        </div>

        <div class="editor-field">
          <label>
            ${t('contacts.distance')}
            <span class="field-value" id="distance-value">${distance} ${t('contacts.daysUnit')}</span>
          </label>
          <div class="range-wrap">
            <div class="range-track"></div>
            <div class="range-fill" id="distance-fill" style="width:${(distance / 365) * 100}%"></div>
            <input type="range" id="distance-slider" min="1" max="365" value="${distance}" />
          </div>
        </div>

        <div class="editor-field">
          <label>
            ${t('contacts.uncertainty')}
            <span class="field-value" id="uncertainty-value">${uncertaintyLabel}</span>
          </label>
          <div class="range-wrap">
            <div class="range-track"></div>
            <div class="range-fill" id="uncertainty-fill" style="width:${uncertainty}%"></div>
            <input type="range" id="uncertainty-slider" min="0" max="100" value="${uncertainty}" />
          </div>
        </div>

        <div class="editor-field">
          ${surpriseMode
            ? `<button type="button" class="approx-date is-surprise" id="approx-date" data-action="reveal-preview" data-exact="${_escAttr(exactDateStr)}">${approxDateStr}</button>`
            : `<span class="approx-date" id="approx-date">${approxDateStr}</span>`}
        </div>

        <div class="spacer"></div>

        <button class="primary-btn" data-action="save">${t('contacts.save')}</button>

        ${!isNew ? `<button class="delete-btn" data-action="delete">${t('contacts.deleteContact')}</button>` : ''}
      </div>`;
  }

  function bind(el, { contact, settings, onSave, onDelete, onBack }) {
    const controller = new AbortController();
    const { signal } = controller;

    const t = I18n.t.bind(I18n);
    const lang = I18n.currentLang();

    const nameInput = el.querySelector('#contact-name');
    const distSlider = el.querySelector('#distance-slider');
    const uncSlider = el.querySelector('#uncertainty-slider');
    const distValue = el.querySelector('#distance-value');
    const uncValue = el.querySelector('#uncertainty-value');
    const distFill = el.querySelector('#distance-fill');
    const uncFill = el.querySelector('#uncertainty-fill');
    const approxEl = el.querySelector('#approx-date');

    function updateLabels() {
      const dist = parseInt(distSlider.value);
      const unc = parseInt(uncSlider.value);
      const spreadDays = Math.round(dist * unc / 100);

      distValue.textContent = `${dist} ${t('contacts.daysUnit')}`;
      uncValue.textContent = t('contacts.uncertaintyFormat', { percent: unc, days: spreadDays });
      distFill.style.width = `${(dist / 365) * 100}%`;
      uncFill.style.width = `${unc}%`;

      const preview = Scheduler.computeNextReminder(
        dist, unc, settings.availableDays, settings.availableHours
      );
      approxEl.textContent = `≈ ${Scheduler.formatTargetDate(dist, lang)} ${t('contacts.plusMinusDays', { days: spreadDays })}`;
      if (settings.surpriseMode) {
        approxEl.dataset.exact = Scheduler.formatExactDate(preview, lang);
      }
    }

    distSlider.addEventListener('input', updateLabels, { signal });
    uncSlider.addEventListener('input', updateLabels, { signal });

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="back"]')) {
        onBack();
        return;
      }
      if (e.target.closest('[data-action="save"]')) {
        const name = nameInput.value.trim();
        if (!name) {
          nameInput.focus();
          return;
        }
        onSave({
          name,
          distance: parseInt(distSlider.value),
          uncertainty: parseInt(uncSlider.value),
        });
        return;
      }
      const revealPreviewEl = e.target.closest('[data-action="reveal-preview"]');
      if (revealPreviewEl) {
        e.stopPropagation();
        revealPreviewEl.textContent = revealPreviewEl.dataset.exact;
        revealPreviewEl.classList.add('reveal-anim');
        revealPreviewEl.classList.remove('is-surprise');
        revealPreviewEl.removeAttribute('data-action');
        return;
      }
      if (e.target.closest('[data-action="delete"]')) {
        if (contact) onDelete(contact.id, contact.name);
      }
    }, { signal });

    // Auto-focus name field for new contacts
    if (!contact) {
      requestAnimationFrame(() => nameInput.focus());
    }

    return () => controller.abort();
  }

  function _escAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { render, bind };
})();

export default ContactEditorView;
