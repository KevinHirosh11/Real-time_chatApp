<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $pdo = getDbConnection();
    ensureUserProfileColumns($pdo);

    $stmt = $pdo->query('SELECT id, username, email, status, profile_image, bio, created_at FROM users ORDER BY id ASC');
    $users = $stmt->fetchAll();

    $normalizedUsers = array_map(static function (array $user): array {
        $user['bio'] = isset($user['bio']) ? (string) $user['bio'] : '';
        $user['profile_image'] = resolveProfileImageUrl($user['profile_image'] ?? null);
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
