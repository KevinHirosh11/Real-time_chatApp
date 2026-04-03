<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $pdo = getDbConnection();
    ensureUserProfileColumns($pdo);

    $currentUserId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
    if ($currentUserId <= 0) {
        jsonResponse(422, ['success' => false, 'message' => 'user_id is required']);
    }

    $usersStmt = $pdo->prepare(
        'SELECT
             u.id,
             u.username,
             u.email,
             u.status,
             u.profile_image,
             u.bio,
             u.created_at,
             CASE WHEN c.last_message_at IS NULL THEN 0 ELSE 1 END AS has_conversation,
             c.last_message_at
         FROM users u
         LEFT JOIN (
             SELECT
                 CASE
                     WHEN m.sender_id = :current_user_id_a THEN m.receiver_id
                     ELSE m.sender_id
                 END AS contact_user_id,
                 MAX(m.created_at) AS last_message_at
             FROM messages m
             WHERE m.sender_id = :current_user_id_b OR m.receiver_id = :current_user_id_c
             GROUP BY contact_user_id
         ) c ON c.contact_user_id = u.id
         WHERE u.id <> :current_user_id_d
         ORDER BY has_conversation DESC, c.last_message_at DESC, u.username ASC'
    );
    $usersStmt->execute([
        ':current_user_id_a' => $currentUserId,
        ':current_user_id_b' => $currentUserId,
        ':current_user_id_c' => $currentUserId,
        ':current_user_id_d' => $currentUserId,
    ]);
    $users = $usersStmt->fetchAll();

    $normalizedUsers = array_map(static function (array $user): array {
        $user['id'] = (int) ($user['id'] ?? 0);
        $user['bio'] = isset($user['bio']) ? (string) $user['bio'] : '';
        $user['profile_image'] = resolveProfileImageUrl($user['profile_image'] ?? null);
        $user['has_conversation'] = (int) ($user['has_conversation'] ?? 0);
        return $user;
    }, $users);

    jsonResponse(200, [
        'success' => true,
        'count' => count($normalizedUsers),
        'data' => $normalizedUsers,
    ]);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Failed to fetch users',
        'error' => $e->getMessage(),
    ]);
}
