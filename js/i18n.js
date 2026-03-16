/**
 * Personance — Internationalization module
 * Loads JSON translation files and provides t() lookup with interpolation.
 */
const I18n = (() => {
  let _strings = {};
  let _lang = 'en';
  const _cache = {};

  async function load(lang) {
    if (_cache[lang]) {
      _strings = _cache[lang];
      _lang = lang;
      return;
    }
    const res = await fetch(`lang/${lang}.json`);
    if (!res.ok) throw new Error(`Could not load language: ${lang}`);
    const data = await res.json();
    _cache[lang] = data;
    _strings = data;
    _lang = lang;
  }

  /** Resolve a dotted key like "contacts.distance" */
  function _resolve(key) {
    return key.split('.').reduce((obj, k) => (obj && obj[k] !== undefined ? obj[k] : null), _strings);
  }

  /**
   * Translate a key, with optional interpolation.
   * t('contacts.uncertaintyFormat', { percent: 75, days: 102 })
   */
  function t(key, params) {
    let val = _resolve(key);
    if (val === null) return `[${key}]`;
    if (typeof val !== 'string') return val;
    if (params) {
      Object.keys(params).forEach(k => {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
      });
    }
    return val;
  }

  function currentLang() {
    return _lang;
  }

  return { load, t, currentLang };
})();

export default I18n;
