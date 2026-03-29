<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
}

try {
    $pdo = getDbConnection();
    $stmt = $pdo->query('SELECT id, username, email, status, created_at FROM users ORDER BY id ASC');
    $users = $stmt->fetchAll();

    jsonResponse(200, [
        'success' => true,
        'count' => count($users),
        'data' => $users,
    ]);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Failed to fetch users',
        'error' => $e->getMessage(),
    ]);
}
