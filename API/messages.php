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
        $body = readJsonBody();

        $senderId = isset($body['sender_id']) ? (int) $body['sender_id'] : 0;
        $receiverId = isset($body['receiver_id']) ? (int) $body['receiver_id'] : 0;
        $message = isset($body['message']) ? trim((string) $body['message']) : '';

        if ($senderId <= 0 || $receiverId <= 0 || $message === '') {
            jsonResponse(422, [
                'success' => false,
                'message' => 'sender_id, receiver_id, and message are required',
            ]);
        }

        $stmt = $pdo->prepare('INSERT INTO messages (sender_id, receiver_id, message, message_type, is_read) VALUES (:sender_id, :receiver_id, :message, :message_type, 0)');
        $stmt->execute([
            ':sender_id' => $senderId,
            ':receiver_id' => $receiverId,
            ':message' => $message,
            ':message_type' => 'text',
        ]);

        jsonResponse(201, [
            'success' => true,
            'message' => 'Message sent',
            'id' => (int) $pdo->lastInsertId(),
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
