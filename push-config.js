// Personance — Push notification credentials
// ============================================
// Fill in your OneSignal credentials to enable push notifications.
//
// Steps:
//   1. Create a free account at https://onesignal.com
//   2. Create a new app → choose "Web Push"
//   3. Follow the setup wizard (enter your site URL and name)
//   4. Copy your credentials from Settings → Keys & IDs
//   5. Paste them below
//
// Without appId:    push is disabled; notifications still work while the browser is open.
// With appId only:  the browser can subscribe, but scheduled delivery needs restApiKey.
// With both:        full push — reminders arrive even when the browser is closed.
//
// Security note: restApiKey is used to call the OneSignal REST API directly from the
// browser. For a personal self-hosted deployment this is acceptable since only you
// have access to this file. Do not publish this file publicly with your key filled in.

window.PUSH_CONFIG = {
  appId:      '',   // OneSignal App ID   (Settings → Keys & IDs → OneSignal App ID)
  restApiKey: '',   // REST API Key       (Settings → Keys & IDs → REST API Key)
};
