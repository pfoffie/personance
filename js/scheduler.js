/**
 * Personance — Reminder scheduling engine
 * Calculates when the next reminder should fire based on distance,
 * uncertainty, available days and available hours.
 */
const Scheduler = (() => {

  /**
   * Calculate a random reminder date for a contact.
   * @param {number} distanceDays  — base distance in days (1–365)
   * @param {number} uncertaintyPct — uncertainty percentage (0–100)
   * @param {number[]} availableDays — array of weekday numbers (0=Sun … 6=Sat)
   * @param {number[]} availableHours — array of hours (0–23)
   * @param {Date} [fromDate] — starting point (default: now)
   * @returns {Date} the computed reminder datetime
   */
  function computeNextReminder(distanceDays, uncertaintyPct, availableDays, availableHours, fromDate) {
    const from = fromDate || new Date();
    const spreadDays = distanceDays * (uncertaintyPct / 100);
    const minDays = Math.max(1, Math.round(distanceDays - spreadDays));
    const maxDays = Math.round(distanceDays + spreadDays);

    // Pick a random day offset within the range
    const offsetDays = _randomInt(minDays, maxDays);

    // Start candidate date
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + offsetDays);

    // Adjust to an available day of the week
    const adjusted = _snapToAvailableDay(candidate, availableDays);

    // Pick a random available hour
    const hour = _pickRandomFrom(availableHours);
    adjusted.setHours(hour, _randomInt(0, 59), 0, 0);

    return adjusted;
  }

  /**
   * Check if a contact is due (reminder date is in the past or now).
   */
  function isDue(contact) {
    if (!contact.reminderDate) return false;
    return new Date(contact.reminderDate) <= new Date();
  }

  /**
   * Format a reminder date as approximate string.
   */
  function formatApproxDate(date, locale) {
    const d = new Date(date);
    const loc = locale === 'de' ? 'de-DE' : 'en-US';
    return '≈ ' + d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Format the base target date (exactly N days from now).
   */
  function formatTargetDate(daysAway, locale, fromDate) {
    const d = new Date(fromDate || new Date());
    d.setDate(d.getDate() + Math.max(0, parseInt(daysAway, 10) || 0));
    const loc = locale === 'de' ? 'de-DE' : 'en-US';
    return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /**
   * Snap a date to the nearest available weekday.
   * Searches forward up to 7 days.
   */
  function _snapToAvailableDay(date, availableDays) {
    if (!availableDays || availableDays.length === 0) return date;
    const d = new Date(date);
    for (let i = 0; i < 7; i++) {
      if (availableDays.includes(d.getDay())) return d;
      d.setDate(d.getDate() + 1);
    }
    return date; // fallback
  }

  function _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function _pickRandomFrom(arr) {
    if (!arr || arr.length === 0) return 12; // fallback noon
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Format a reminder date as exact date + time string.
   */
  function formatExactDate(date, locale) {
    const d = new Date(date);
    const loc = locale === 'de' ? 'de-DE' : 'en-US';
    return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ', ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }

  return { computeNextReminder, isDue, formatApproxDate, formatTargetDate, formatExactDate };
})();

export default Scheduler;
