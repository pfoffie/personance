/**
 * Personance — Custom push notification provider (example / template)
 *
 * Copy this file to  custom/push.js  and fill in your implementation.
 * The custom/ folder is gitignored, so credentials stay private.
 *
 * Personance will automatically load custom/push.js at startup and call
 * these three named exports at the appropriate moments:
 *
 *   registerNotifications()
 *     → called when the user enables push notifications
 *     → return a string user/device ID that identifies this device
 *
 *   scheduleNotification(timestamp, message, userId)
 *     → called when a reminder is created or rescheduled
 *     → timestamp: Unix timestamp in milliseconds (Date.getTime())
 *     → message:   contact name / notification body
 *     → userId:    the ID returned by registerNotifications()
 *     → return a unique string message ID (used to cancel later)
 *
 *   removeNotification(messageId)
 *     → called when a reminder is deleted or replaced
 *     → messageId: the ID returned by scheduleNotification()
 */

/**
 * Register this device with your push service.
 * @returns {Promise<string>} A unique identifier for this device/user
 */
export async function registerNotifications() {
  // Example: obtain a push subscription and register it with your backend,
  // then return the server-assigned user ID.
  throw new Error('registerNotifications() not implemented — edit custom/push.js');
}

/**
 * Schedule a push notification to be delivered at the given timestamp.
 * @param {number} timestamp  Unix timestamp in ms when the notification should fire
 * @param {string} message    Notification body text (contact name)
 * @param {string} userId     The ID returned by registerNotifications()
 * @returns {Promise<string>} A unique message ID for later cancellation
 */
export async function scheduleNotification(timestamp, message, userId) {
  // Example: POST to your push backend and return the notification ID.
  throw new Error('scheduleNotification() not implemented — edit custom/push.js');
}

/**
 * Cancel a previously scheduled notification.
 * @param {string} messageId  The ID returned by scheduleNotification()
 * @returns {Promise<void>}
 */
export async function removeNotification(messageId) {
  // Example: DELETE /notifications/:messageId on your backend.
  throw new Error('removeNotification() not implemented — edit custom/push.js');
}
