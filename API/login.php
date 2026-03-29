<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
}

$body = readJsonBody();
$email = isset($body['email']) ? strtolower(trim((string) $body['email'])) : '';
$password = isset($body['password']) ? (string) $body['password'] : '';

if ($email === '' || $password === '') {
    jsonResponse(422, [
        'success' => false,
        'message' => 'email and password are required',
    ]);
}

try {
    $pdo = getDbConnection();

    $stmt = $pdo->prepare('SELECT id, username, email, password, status FROM users WHERE email = :email LIMIT 1');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(401, [
            'success' => false,
            'message' => 'Invalid email or password',
        ]);
    }

    $passwordMatches = password_verify($password, (string) $user['password'])
        || hash_equals((string) $user['password'], $password);

    if (!$passwordMatches) {
        jsonResponse(401, [
            'success' => false,
            'message' => 'Invalid email or password',
        ]);
    }

    $updateStmt = $pdo->prepare('UPDATE users SET status = :status, last_seen = NULL WHERE id = :id');
    $updateStmt->execute([
        ':status' => 'online',
        ':id' => (int) $user['id'],
    ]);

    jsonResponse(200, [
        'success' => true,
        'message' => 'Login successful',
        'data' => [
            'id' => (int) $user['id'],
            'username' => (string) $user['username'],
            'email' => (string) $user['email'],
            'status' => 'online',
        ],
    ]);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Login failed',
        'error' => $e->getMessage(),
    ]);
}
