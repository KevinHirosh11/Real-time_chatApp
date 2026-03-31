<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

try {
    $pdo = getDbConnection();
    ensureUserProfileColumns($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $userId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
        if ($userId <= 0) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'user_id is required',
            ]);
        }

        $stmt = $pdo->prepare('SELECT id, username, email, status, profile_image, bio, created_at FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        $user = $stmt->fetch();

        if (!$user) {
            jsonResponse(404, [
                'success' => false,
                'message' => 'User not found',
            ]);
        }

        $user['bio'] = isset($user['bio']) ? (string) $user['bio'] : '';
        $user['profile_image'] = resolveProfileImageUrl($user['profile_image'] ?? null);

        jsonResponse(200, [
            'success' => true,
            'data' => $user,
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
    }

    $userId = isset($_POST['user_id']) ? (int) $_POST['user_id'] : 0;
    $username = isset($_POST['username']) ? trim((string) $_POST['username']) : '';
    $bio = isset($_POST['bio']) ? trim((string) $_POST['bio']) : '';

    if ($userId <= 0 || $username === '') {
        jsonResponse(422, [
            'success' => false,
            'message' => 'user_id and username are required',
        ]);
    }

    if (mb_strlen($bio) > 500) {
        jsonResponse(422, [
            'success' => false,
            'message' => 'Bio cannot exceed 500 characters',
        ]);
    }

    $stmt = $pdo->prepare('SELECT id, email, status, profile_image, bio FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => $userId]);
    $existingUser = $stmt->fetch();

    if (!$existingUser) {
        jsonResponse(404, [
            'success' => false,
            'message' => 'User not found',
        ]);
    }

    $storedImagePath = isset($existingUser['profile_image']) ? trim((string) $existingUser['profile_image']) : '';
    $upload = $_FILES['profile_image'] ?? null;

    if (is_array($upload) && (int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        if ((int) $upload['error'] !== UPLOAD_ERR_OK) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'Failed to upload image',
            ]);
        }

        $tmpName = (string) ($upload['tmp_name'] ?? '');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'Invalid upload payload',
            ]);
        }

        $fileSize = (int) ($upload['size'] ?? 0);
        if ($fileSize > 5 * 1024 * 1024) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'Image size must be 5MB or less',
            ]);
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mimeType = $finfo ? (string) finfo_file($finfo, $tmpName) : '';
        if ($finfo) {
            finfo_close($finfo);
        }

        $allowedTypes = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
        ];

        if (!isset($allowedTypes[$mimeType])) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'Only JPG, PNG, WEBP, or GIF images are allowed',
            ]);
        }

        $uploadDirectory = __DIR__ . '/uploads/profiles';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0777, true) && !is_dir($uploadDirectory)) {
            jsonResponse(500, [
                'success' => false,
                'message' => 'Could not create upload directory',
            ]);
        }

        $newFileName = sprintf('user_%d_%d.%s', $userId, time(), $allowedTypes[$mimeType]);
        $targetPath = $uploadDirectory . '/' . $newFileName;

        if (!move_uploaded_file($tmpName, $targetPath)) {
            jsonResponse(500, [
                'success' => false,
                'message' => 'Failed to save uploaded image',
            ]);
        }

        if ($storedImagePath !== '' && strpos($storedImagePath, 'uploads/profiles/') === 0) {
            $oldPath = __DIR__ . '/' . $storedImagePath;
            if (is_file($oldPath)) {
                @unlink($oldPath);
            }
        }

        $storedImagePath = 'uploads/profiles/' . $newFileName;
    }

    $updateStmt = $pdo->prepare(
        'UPDATE users SET username = :username, bio = :bio, profile_image = :profile_image WHERE id = :id'
    );

    $updateStmt->execute([
        ':username' => $username,
        ':bio' => $bio,
        ':profile_image' => $storedImagePath !== '' ? $storedImagePath : null,
        ':id' => $userId,
    ]);

    jsonResponse(200, [
        'success' => true,
        'message' => 'Profile updated successfully',
        'data' => [
            'id' => $userId,
            'username' => $username,
            'email' => (string) $existingUser['email'],
            'status' => (string) $existingUser['status'],
            'bio' => $bio,
            'profile_image' => resolveProfileImageUrl($storedImagePath),
        ],
    ]);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Profile request failed',
        'error' => $e->getMessage(),
    ]);
}
