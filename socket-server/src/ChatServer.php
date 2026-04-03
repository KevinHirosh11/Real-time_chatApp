<?php
declare(strict_types=1);

namespace SocketServer;

use PDO;
use Ratchet\ConnectionInterface;
use Ratchet\MessageComponentInterface;
use SplObjectStorage;
use Throwable;

class ChatServer implements MessageComponentInterface
{
    private SplObjectStorage $clients;
    private PDO $pdo;

    /**
     * @var array<int, ConnectionInterface>
     */
    private array $userConnections = [];

    public function __construct()
    {
        $this->clients = new SplObjectStorage();
        $this->pdo = $this->buildConnection();
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        $this->clients->attach($conn, ['userId' => null]);

        $this->sendJson($conn, [
            'type' => 'connected',
            'message' => 'WebSocket connected. Authenticate with {"type":"auth","userId":1}',
        ]);
    }

    public function onMessage(ConnectionInterface $from, $msg): void
    {
        $payload = json_decode((string) $msg, true);
        if (!is_array($payload) || !isset($payload['type'])) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'Invalid JSON payload',
            ]);
            return;
        }

        $type = (string) $payload['type'];

        if ($type === 'auth') {
            $this->handleAuth($from, $payload);
            return;
        }

        $connectionData = $this->clients[$from] ?? ['userId' => null];
        $senderId = isset($connectionData['userId']) ? (int) $connectionData['userId'] : 0;

        if ($senderId <= 0) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'Authenticate first',
            ]);
            return;
        }

        if ($type === 'private_message') {
            $this->handlePrivateMessage($from, $senderId, $payload);
            return;
        }

        $this->sendJson($from, [
            'type' => 'error',
            'message' => 'Unsupported message type',
        ]);
    }

    public function onClose(ConnectionInterface $conn): void
    {
        if ($this->clients->contains($conn)) {
            $data = $this->clients[$conn] ?? ['userId' => null];
            $userId = isset($data['userId']) ? (int) $data['userId'] : 0;

            if ($userId > 0) {
                unset($this->userConnections[$userId]);
                $this->updateUserStatus($userId, 'offline');
            }

            $this->clients->detach($conn);
        }
    }

    public function onError(ConnectionInterface $conn, \Exception $e): void
    {
        $this->sendJson($conn, [
            'type' => 'error',
            'message' => 'Socket error',
            'details' => $e->getMessage(),
        ]);

        $conn->close();
    }

    private function handleAuth(ConnectionInterface $conn, array $payload): void
    {
        $userId = isset($payload['userId']) ? (int) $payload['userId'] : 0;
        if ($userId <= 0) {
            $this->sendJson($conn, [
                'type' => 'error',
                'message' => 'auth requires userId',
            ]);
            return;
        }

        if (!$this->userExists($userId)) {
            $this->sendJson($conn, [
                'type' => 'error',
                'message' => 'User does not exist',
            ]);
            return;
        }

        $this->clients[$conn] = ['userId' => $userId];
        $this->userConnections[$userId] = $conn;
        $this->updateUserStatus($userId, 'online');

        $this->sendJson($conn, [
            'type' => 'auth_ok',
            'userId' => $userId,
            'message' => 'Authenticated',
        ]);
    }

    private function handlePrivateMessage(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $receiverId = isset($payload['receiverId']) ? (int) $payload['receiverId'] : 0;
        $message = isset($payload['message']) ? trim((string) $payload['message']) : '';

        if ($receiverId <= 0 || $message === '') {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'private_message requires receiverId and message',
            ]);
            return;
        }

        if (!$this->userExists($receiverId)) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'Receiver does not exist',
            ]);
            return;
        }

        try {
            $insert = $this->pdo->prepare(
                'INSERT INTO messages (sender_id, receiver_id, message, message_type, is_read) VALUES (:sender, :receiver, :message, :type, 0)'
            );
            $insert->execute([
                ':sender' => $senderId,
                ':receiver' => $receiverId,
                ':message' => $message,
                ':type' => 'text',
            ]);

            $messageId = (int) $this->pdo->lastInsertId();
            $createdAtStmt = $this->pdo->prepare('SELECT created_at FROM messages WHERE id = :id LIMIT 1');
            $createdAtStmt->execute([':id' => $messageId]);
            $createdAtRaw = (string) ($createdAtStmt->fetchColumn() ?: '');

            $createdAt = $this->toSriLankaIso($createdAtRaw);

            $packet = [
                'type' => 'private_message',
                'id' => $messageId,
                'senderId' => $senderId,
                'receiverId' => $receiverId,
                'message' => $message,
                'createdAt' => $createdAt,
            ];

            $this->sendJson($from, [
                'type' => 'message_sent',
                'data' => $packet,
            ]);

            if (isset($this->userConnections[$receiverId])) {
                $this->sendJson($this->userConnections[$receiverId], [
                    'type' => 'new_message',
                    'data' => $packet,
                ]);
            }
        } catch (Throwable $e) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'Could not save/send message',
                'details' => $e->getMessage(),
            ]);
        }
    }

    private function sendJson(ConnectionInterface $conn, array $payload): void
    {
        $conn->send((string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function userExists(int $userId): bool
    {
        $stmt = $this->pdo->prepare('SELECT id FROM users WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => $userId]);
        return (bool) $stmt->fetchColumn();
    }

    private function updateUserStatus(int $userId, string $status): void
    {
        $lastSeen = $status === 'offline' ? date('Y-m-d H:i:s') : null;

        $stmt = $this->pdo->prepare('UPDATE users SET status = :status, last_seen = :last_seen WHERE id = :id');
        $stmt->execute([
            ':status' => $status,
            ':last_seen' => $lastSeen,
            ':id' => $userId,
        ]);
    }

    private function buildConnection(): PDO
    {
        $host = '127.0.0.1';
        $port = '3306';
        $dbName = 'chat_app';
        $username = 'root';
        $password = '';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";

        $pdo = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        $pdo->exec("SET time_zone = '+00:00'");

        return $pdo;
    }

    private function toSriLankaIso(string $timestamp): string
    {
        $value = trim($timestamp);
        if ($value === '') {
            return (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM);
        }

        $date = \DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $value, new \DateTimeZone('UTC'));
        if (!$date) {
            return $value;
        }

        return $date->setTimezone(new \DateTimeZone('Asia/Colombo'))->format(\DateTimeInterface::ATOM);
    }
}
