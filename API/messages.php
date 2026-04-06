<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

function toSriLankaIso(?string $timestamp): ?string
{
    $value = trim((string) $timestamp);
    if ($value === '') {
        return null;
    }

    try {
        $utc = new DateTimeZone('UTC');
        $colombo = new DateTimeZone('Asia/Colombo');
        $date = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $value, $utc);

        if (!$date) {
            return $value;
        }

        return $date->setTimezone($colombo)->format(DateTimeInterface::ATOM);
    } catch (Throwable $e) {
        return $value;
    }
}

function normalizeMessageAttachmentType(string $value): string
{
    $normalized = strtolower(trim($value));
    if ($normalized === 'image') {
        return 'image';
    }

    if ($normalized === 'file') {
        return 'file';
    }

    return 'text';
}

function saveMessageAttachment(array $upload, string $attachmentType): array
{
    if ((int) ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Attachment upload failed');
    }

    $tmpName = (string) ($upload['tmp_name'] ?? '');
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        throw new RuntimeException('Invalid attachment payload');
    }

    $size = (int) ($upload['size'] ?? 0);
    if ($size <= 0) {
        throw new RuntimeException('Attachment is empty');
    }

    if ($size > 12 * 1024 * 1024) {
        throw new RuntimeException('Attachment size must be 12MB or less');
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = $finfo ? (string) finfo_file($finfo, $tmpName) : '';
    if ($finfo) {
        finfo_close($finfo);
    }

    if ($attachmentType === 'image') {
        if (!preg_match('#^(image|video)/#i', $mimeType)) {
            throw new RuntimeException('Only image or video files are allowed in Photos & videos');
        }
    } elseif ($attachmentType === 'file') {
        if (preg_match('#^application/x-php#i', $mimeType) || preg_match('#^text/x-php#i', $mimeType)) {
            throw new RuntimeException('PHP files are not allowed');
        }
    } else {
        throw new RuntimeException('Invalid attachment type');
    }

    $uploadDirectory = __DIR__ . '/uploads/messages';
    if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0777, true) && !is_dir($uploadDirectory)) {
        throw new RuntimeException('Could not create attachment directory');
    }

    $originalName = trim((string) ($upload['name'] ?? 'attachment'));
    $safeOriginalName = preg_replace('/[^A-Za-z0-9._-]/', '_', $originalName);
    $extension = strtolower(pathinfo((string) $safeOriginalName, PATHINFO_EXTENSION));
    $baseName = pathinfo((string) $safeOriginalName, PATHINFO_FILENAME);

    if ($baseName === '') {
        $baseName = 'attachment';
    }

    if ($extension === '') {
        $extension = 'bin';
    }

    $storedName = sprintf('%s_%d_%s.%s', $attachmentType, time(), bin2hex(random_bytes(4)), $extension);
    $targetPath = $uploadDirectory . '/' . $storedName;

    if (!move_uploaded_file($tmpName, $targetPath)) {
        throw new RuntimeException('Failed to save attachment');
    }

    $relativePath = 'uploads/messages/' . $storedName;

    return [
        'path' => $relativePath,
        'url' => resolveProfileImageUrl($relativePath),
        'name' => $safeOriginalName !== '' ? $safeOriginalName : ($baseName . '.' . $extension),
        'size' => $size,
    ];
}

try {
    $pdo = getDbConnection();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $senderId = isset($_GET['sender_id']) ? (int) $_GET['sender_id'] : 0;
        $receiverId = isset($_GET['receiver_id']) ? (int) $_GET['receiver_id'] : 0;

        if ($senderId <= 0 || $receiverId <= 0) {
            jsonResponse(422, ['success' => false, 'message' => 'sender_id and receiver_id are required']);
        }

        $sql = 'SELECT id, sender_id, receiver_id, message, message_type, is_read, created_at
                FROM messages
                WHERE (sender_id = :senderA AND receiver_id = :receiverA)
                   OR (sender_id = :senderB AND receiver_id = :receiverB)
                ORDER BY created_at ASC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':senderA' => $senderId,
            ':receiverA' => $receiverId,
            ':senderB' => $receiverId,
            ':receiverB' => $senderId,
        ]);

        $messages = $stmt->fetchAll();

        foreach ($messages as &$messageRow) {
            $messageRow['created_at'] = toSriLankaIso($messageRow['created_at'] ?? null);
        }
        unset($messageRow);

        jsonResponse(200, [
            'success' => true,
            'count' => count($messages),
            'data' => $messages,
        ]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
        $body = str_starts_with($contentType, 'application/json') ? readJsonBody() : [];

        $senderId = isset($_POST['sender_id']) ? (int) $_POST['sender_id'] : (isset($body['sender_id']) ? (int) $body['sender_id'] : 0);
        $receiverId = isset($_POST['receiver_id']) ? (int) $_POST['receiver_id'] : (isset($body['receiver_id']) ? (int) $body['receiver_id'] : 0);
        $message = isset($_POST['message']) ? trim((string) $_POST['message']) : (isset($body['message']) ? trim((string) $body['message']) : '');

        $attachmentTypeRaw = isset($_POST['attachment_type'])
            ? (string) $_POST['attachment_type']
            : (isset($body['attachment_type']) ? (string) $body['attachment_type'] : 'text');

        $attachmentType = normalizeMessageAttachmentType($attachmentTypeRaw);
        $attachmentUpload = $_FILES['attachment'] ?? null;
        $hasAttachment = is_array($attachmentUpload)
            && (int) ($attachmentUpload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

        if ($senderId <= 0 || $receiverId <= 0) {
            jsonResponse(422, [
                'success' => false,
                'message' => 'sender_id and receiver_id are required',
            ]);
        }

        $storedMessage = $message;
        $messageType = 'text';

        if ($hasAttachment) {
            try {
                $savedAttachment = saveMessageAttachment($attachmentUpload, $attachmentType);
            } catch (RuntimeException $exception) {
                jsonResponse(422, [
                    'success' => false,
                    'message' => $exception->getMessage(),
                ]);
            }

            $messageType = $attachmentType;
            $storedMessage = (string) json_encode([
                'url' => $savedAttachment['url'],
                'name' => $savedAttachment['name'],
                'size' => $savedAttachment['size'],
                'caption' => $message,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        if (!$hasAttachment && $storedMessage === '') {
            jsonResponse(422, [
                'success' => false,
                'message' => 'message is required when no attachment is provided',
            ]);
        }

        $stmt = $pdo->prepare('INSERT INTO messages (sender_id, receiver_id, message, message_type, is_read) VALUES (:sender_id, :receiver_id, :message, :message_type, 0)');
        $stmt->execute([
            ':sender_id' => $senderId,
            ':receiver_id' => $receiverId,
            ':message' => $storedMessage,
            ':message_type' => $messageType,
        ]);

        $insertedId = (int) $pdo->lastInsertId();
        $createdAtStmt = $pdo->prepare('SELECT created_at FROM messages WHERE id = :id LIMIT 1');
        $createdAtStmt->execute([':id' => $insertedId]);
        $createdAt = toSriLankaIso((string) ($createdAtStmt->fetchColumn() ?: ''));

        jsonResponse(201, [
            'success' => true,
            'message' => 'Message sent',
            'id' => $insertedId,
            'data' => [
                'id' => $insertedId,
                'sender_id' => $senderId,
                'receiver_id' => $receiverId,
                'message' => $storedMessage,
                'message_type' => $messageType,
                'created_at' => $createdAt,
            ],
        ]);
    }

    jsonResponse(405, ['success' => false, 'message' => 'Method not allowed']);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Message endpoint error',
        'error' => $e->getMessage(),
    ]);
}
