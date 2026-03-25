<?php
/**
 * Personance — OneSignal push notification backend (example / template)
 *
 * Setup steps
 * ───────────
 * 1. Copy this file to your web server and make it reachable at the URL you
 *    configured as PUSH_PHP_URL in custom/push.js (e.g. /push/notify.php).
 *
 * 2. Fill in ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY below.
 *    The REST API Key is a server-side secret — never expose it in JS files.
 *
 * 3. Make sure PHP's cURL extension is enabled (php_curl).
 *
 * Supported requests
 * ──────────────────
 *   POST   ?                   – schedule a notification
 *   DELETE ?id=<notificationId> – cancel a scheduled notification
 *
 * OneSignal REST API reference
 * ────────────────────────────
 *   https://documentation.onesignal.com/reference/create-notification
 *   https://documentation.onesignal.com/reference/cancel-notification
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Your OneSignal App ID (Dashboard → Settings → Keys & IDs) */
define('ONESIGNAL_APP_ID',       'YOUR_ONESIGNAL_APP_ID');

/** OneSignal REST API Key — keep this secret, never commit it */
define('ONESIGNAL_REST_API_KEY', 'YOUR_REST_API_KEY');

/** OneSignal notifications endpoint */
define('ONESIGNAL_API_URL', 'https://onesignal.com/api/v1/notifications');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Send a JSON response and terminate the script.
 */
function jsonResponse(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body);
    exit;
}

/**
 * Make an HTTP request to the OneSignal REST API via cURL.
 *
 * @param  string $method  HTTP method (POST, DELETE)
 * @param  string $url     Full endpoint URL
 * @param  array  $data    Request body (encoded as JSON for POST)
 * @return array           Decoded JSON response merged with '_http_status'
 */
function onesignalRequest(string $method, string $url, array $data = []): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Basic ' . ONESIGNAL_REST_API_KEY,
        ],
        CURLOPT_POSTFIELDS     => ($method === 'POST') ? json_encode($data) : null,
    ]);

    $response = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($response === false) {
        return ['_http_status' => 0, 'error' => $curlError ?: 'cURL request failed'];
    }

    $decoded = json_decode($response, true);
    if (!is_array($decoded)) {
        $decoded = ['raw' => $response];
    }
    $decoded['_http_status'] = $httpCode;
    return $decoded;
}

// ─── CORS headers ─────────────────────────────────────────────────────────────
// In production restrict this to your application's origin, for example:
//   header('Access-Control-Allow-Origin: https://yoursite.com');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── POST: schedule a notification ─────────────────────────────────────────────

if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $timestamp = isset($input['timestamp']) ? (int) $input['timestamp'] : null;
    $message   = isset($input['message'])   ? trim((string) $input['message'])  : null;
    $userId    = isset($input['userId'])    ? trim((string) $input['userId'])   : null;

    if (!$timestamp || !$message || !$userId) {
        jsonResponse(400, ['error' => 'timestamp, message and userId are required']);
    }

    // OneSignal's send_after expects a UTC datetime string.
    // The JS side sends Unix milliseconds; divide by 1000 to get seconds.
    $sendAfter = gmdate('Y-m-d H:i:s \G\M\T', (int) ($timestamp / 1000));

    $result = onesignalRequest('POST', ONESIGNAL_API_URL, [
        'app_id'             => ONESIGNAL_APP_ID,
        // Target exactly this device by its OneSignal subscription (player) ID.
        'include_player_ids' => [$userId],
        'contents'           => ['en' => $message],
        'send_after'         => $sendAfter,
    ]);

    if (!empty($result['errors'])) {
        jsonResponse(502, ['error' => $result['errors']]);
    }

    if (empty($result['id'])) {
        jsonResponse(502, ['error' => 'OneSignal did not return a notification ID']);
    }

    jsonResponse(200, ['id' => $result['id']]);
}

// ── DELETE: cancel a scheduled notification ───────────────────────────────────

if ($method === 'DELETE') {
    $notificationId = isset($_GET['id']) ? trim((string) $_GET['id']) : null;

    if (!$notificationId) {
        jsonResponse(400, ['error' => 'id query parameter is required']);
    }

    $url = ONESIGNAL_API_URL
         . '/' . rawurlencode($notificationId)
         . '?app_id=' . rawurlencode(ONESIGNAL_APP_ID);

    $result = onesignalRequest('DELETE', $url);

    // 404 from OneSignal means the notification was already delivered or cancelled.
    if ($result['_http_status'] === 404) {
        jsonResponse(404, ['error' => 'notification not found']);
    }

    if (!empty($result['errors'])) {
        jsonResponse(502, ['error' => $result['errors']]);
    }

    jsonResponse(200, ['success' => true]);
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

jsonResponse(405, ['error' => 'Method not allowed']);
