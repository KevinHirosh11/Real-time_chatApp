<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
}

$body = readJsonBody();
$username = isset($body['username']) ? trim((string) $body['username']) : '';
$email = isset($body['email']) ? strtolower(trim((string) $body['email'])) : '';
$password = isset($body['password']) ? (string) $body['password'] : '';

if ($username === '' || $email === '' || $password === '') {
    jsonResponse(422, [
        'success' => false,
        'message' => 'username, email, and password are required',
    ]);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(422, [
        'success' => false,
        'message' => 'Please provide a valid email address',
    ]);
}

if (strlen($password) < 6) {
    jsonResponse(422, [
        'success' => false,
        'message' => 'Password must be at least 6 characters',
    ]);
}

try {
    $pdo = getDbConnection();
    ensureUserProfileColumns($pdo);

    $checkStmt = $pdo->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $checkStmt->execute([':email' => $email]);
    $existingUser = $checkStmt->fetch();

    if ($existingUser) {
        jsonResponse(409, [
            'success' => false,
            'message' => 'Email already exists',
        ]);
    }

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    $insertStmt = $pdo->prepare('INSERT INTO users (username, email, password, status) VALUES (:username, :email, :password, :status)');
    $insertStmt->execute([
        ':username' => $username,
        ':email' => $email,
        ':password' => $passwordHash,
        ':status' => 'online',
    ]);

    $userId = (int) $pdo->lastInsertId();

    jsonResponse(201, [
        'success' => true,
        'message' => 'Registration successful',
        'data' => [
            'id' => $userId,
            'username' => $username,
            'email' => $email,
            'status' => 'online',
            'bio' => '',
            'profile_image' => null,
        ],
    ]);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Registration failed',
        'error' => $e->getMessage(),
    ]);
}
