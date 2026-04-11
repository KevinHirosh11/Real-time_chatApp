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
        $this->ensureSocketQueueTable();
    }

    public function onOpen(ConnectionInterface $conn): void
    {
        $this->clients->attach($conn, ['userId' => null]);

        $this->sendJson($conn, [
            'type' => 'connected',
            'message' => 'WebSocket connected. Authenticate with {"type":"auth","userId":1}',
        ]);

        $this->broadcastUsersRefresh();
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

        if ($type === 'relay_message') {
            $this->handleRelayMessage($from, $senderId, $payload);
            return;
        }

        if ($type === 'group_message') {
            $this->handleGroupMessage($from, $senderId, $payload);
            return;
        }

        if ($type === 'message_update') {
            $this->handleMessageUpdate($from, $senderId, $payload);
            return;
        }

        if ($type === 'message_delete') {
            $this->handleMessageDelete($from, $senderId, $payload);
            return;
        }

        if ($type === 'group_message_update') {
            $this->handleGroupMessageUpdate($from, $senderId, $payload);
            return;
        }

        if ($type === 'group_message_delete') {
            $this->handleGroupMessageDelete($from, $senderId, $payload);
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
            $this->broadcastUsersRefresh();
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

        $this->deliverQueuedPackets($conn, $userId);

        $this->broadcastUsersRefresh();
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

    private function handleRelayMessage(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $receiverId = isset($payload['receiverId']) ? (int) $payload['receiverId'] : 0;
        $messageId = isset($payload['id']) ? (int) $payload['id'] : 0;
        $messageType = isset($payload['messageType']) ? (string) $payload['messageType'] : 'text';
        $message = isset($payload['message']) ? (string) $payload['message'] : '';
        $createdAt = isset($payload['createdAt']) ? (string) $payload['createdAt'] : '';

        if ($receiverId <= 0 || $messageId <= 0 || $message === '') {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'relay_message requires id, receiverId, and message',
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

        $packet = [
            'type' => 'private_message',
            'id' => $messageId,
            'senderId' => $senderId,
            'receiverId' => $receiverId,
            'message' => $message,
            'messageType' => $messageType,
            'createdAt' => $createdAt !== '' ? $createdAt : (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM),
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
            return;
        }

        $this->queuePacket($receiverId, [
            'type' => 'new_message',
            'data' => $packet,
        ]);
    }

    private function handleGroupMessage(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $groupId = isset($payload['groupId']) ? trim((string) $payload['groupId']) : '';
        $messageId = isset($payload['id']) ? (int) $payload['id'] : (int) (microtime(true) * 1000);
        $messageType = isset($payload['messageType']) ? (string) $payload['messageType'] : 'text';
        $message = isset($payload['message']) ? trim((string) $payload['message']) : '';
        $createdAt = isset($payload['createdAt']) ? (string) $payload['createdAt'] : '';
        $group = isset($payload['group']) && is_array($payload['group']) ? $payload['group'] : [];

        $memberIdsRaw = [];
        if (isset($group['memberIds']) && is_array($group['memberIds'])) {
            $memberIdsRaw = $group['memberIds'];
        } elseif (isset($payload['memberIds']) && is_array($payload['memberIds'])) {
            $memberIdsRaw = $payload['memberIds'];
        }

        $memberIds = [];
        foreach ($memberIdsRaw as $memberId) {
            $value = (int) $memberId;
            if ($value > 0) {
                $memberIds[$value] = $value;
            }
        }

        if ($groupId === '' || $message === '' || count($memberIds) === 0) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'group_message requires groupId, message, and memberIds',
            ]);
            return;
        }

        $memberIds[$senderId] = $senderId;

        $packet = [
            'id' => $messageId,
            'groupId' => $groupId,
            'senderId' => $senderId,
            'message' => $message,
            'messageType' => $messageType,
            'createdAt' => $createdAt !== '' ? $createdAt : (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM),
            'group' => [
                'id' => $groupId,
                'name' => isset($group['name']) ? (string) $group['name'] : 'Group',
                'description' => isset($group['description']) ? (string) $group['description'] : '',
                'image' => isset($group['image']) ? (string) $group['image'] : '',
                'memberIds' => array_values($memberIds),
                'adminIds' => isset($group['adminIds']) && is_array($group['adminIds']) ? $group['adminIds'] : [$senderId],
                'permissions' => isset($group['permissions']) && is_array($group['permissions'])
                    ? $group['permissions']
                    : ['onlyAdminsCanMessage' => false, 'onlyAdminsCanEdit' => true],
                'createdBy' => isset($group['createdBy']) ? (int) $group['createdBy'] : $senderId,
            ],
        ];

        foreach ($memberIds as $memberId) {
            if (!isset($this->userConnections[$memberId])) {
                continue;
            }

            $this->sendJson($this->userConnections[$memberId], [
                'type' => 'group_message',
                'data' => $packet,
            ]);
        }
    }

    private function handleMessageUpdate(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $receiverId = isset($payload['receiverId']) ? (int) $payload['receiverId'] : 0;
        $messageId = isset($payload['id']) ? (int) $payload['id'] : 0;
        $message = isset($payload['message']) ? (string) $payload['message'] : '';
        $messageType = isset($payload['messageType']) ? (string) $payload['messageType'] : 'text';
        $createdAt = isset($payload['createdAt']) ? (string) $payload['createdAt'] : '';

        if ($receiverId <= 0 || $messageId <= 0 || $message === '') {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'message_update requires id, receiverId, and message',
            ]);
            return;
        }

        $packet = [
            'type' => 'message_update',
            'data' => [
                'id' => $messageId,
                'senderId' => $senderId,
                'receiverId' => $receiverId,
                'message' => $message,
                'messageType' => $messageType,
                'createdAt' => $createdAt !== '' ? $createdAt : (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM),
            ],
        ];

        $this->sendJson($from, $packet);

        if (isset($this->userConnections[$receiverId])) {
            $this->sendJson($this->userConnections[$receiverId], $packet);
            return;
        }

        $this->queuePacket($receiverId, $packet);
    }

    private function handleMessageDelete(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $receiverId = isset($payload['receiverId']) ? (int) $payload['receiverId'] : 0;
        $messageId = isset($payload['id']) ? (int) $payload['id'] : 0;
        $createdAt = isset($payload['createdAt']) ? (string) $payload['createdAt'] : '';

        if ($receiverId <= 0 || $messageId <= 0) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'message_delete requires id and receiverId',
            ]);
            return;
        }

        $packet = [
            'type' => 'message_delete',
            'data' => [
                'id' => $messageId,
                'senderId' => $senderId,
                'receiverId' => $receiverId,
                'createdAt' => $createdAt !== '' ? $createdAt : (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM),
            ],
        ];

        $this->sendJson($from, $packet);

        if (isset($this->userConnections[$receiverId])) {
            $this->sendJson($this->userConnections[$receiverId], $packet);
            return;
        }

        $this->queuePacket($receiverId, $packet);
    }

    private function handleGroupMessageUpdate(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $groupId = isset($payload['groupId']) ? trim((string) $payload['groupId']) : '';
        $messageId = isset($payload['id']) ? (int) $payload['id'] : 0;
        $message = isset($payload['message']) ? trim((string) $payload['message']) : '';
        $messageType = isset($payload['messageType']) ? (string) $payload['messageType'] : 'text';
        $createdAt = isset($payload['createdAt']) ? (string) $payload['createdAt'] : '';
        $group = isset($payload['group']) && is_array($payload['group']) ? $payload['group'] : [];

        if ($groupId === '' || $messageId <= 0 || $message === '') {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'group_message_update requires groupId, id, and message',
            ]);
            return;
        }

        $memberIds = [];
        if (isset($group['memberIds']) && is_array($group['memberIds'])) {
            foreach ($group['memberIds'] as $memberId) {
                $value = (int) $memberId;
                if ($value > 0) {
                    $memberIds[$value] = $value;
                }
            }
        }

        $memberIds[$senderId] = $senderId;

        $packet = [
            'type' => 'group_message_update',
            'data' => [
                'id' => $messageId,
                'groupId' => $groupId,
                'senderId' => $senderId,
                'message' => $message,
                'messageType' => $messageType,
                'createdAt' => $createdAt !== '' ? $createdAt : (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM),
                'group' => [
                    'id' => $groupId,
                    'name' => isset($group['name']) ? (string) $group['name'] : 'Group',
                    'description' => isset($group['description']) ? (string) $group['description'] : '',
                    'image' => isset($group['image']) ? (string) $group['image'] : '',
                    'memberIds' => array_values($memberIds),
                    'adminIds' => isset($group['adminIds']) && is_array($group['adminIds']) ? $group['adminIds'] : [$senderId],
                    'permissions' => isset($group['permissions']) && is_array($group['permissions'])
                        ? $group['permissions']
                        : ['onlyAdminsCanMessage' => false, 'onlyAdminsCanEdit' => true],
                    'createdBy' => isset($group['createdBy']) ? (int) $group['createdBy'] : $senderId,
                ],
            ],
        ];

        foreach ($memberIds as $memberId) {
            if (isset($this->userConnections[$memberId])) {
                $this->sendJson($this->userConnections[$memberId], $packet);
                continue;
            }

            $this->queuePacket($memberId, $packet);
        }
    }

    private function handleGroupMessageDelete(ConnectionInterface $from, int $senderId, array $payload): void
    {
        $groupId = isset($payload['groupId']) ? trim((string) $payload['groupId']) : '';
        $messageId = isset($payload['id']) ? (int) $payload['id'] : 0;
        $createdAt = isset($payload['createdAt']) ? (string) $payload['createdAt'] : '';
        $group = isset($payload['group']) && is_array($payload['group']) ? $payload['group'] : [];

        if ($groupId === '' || $messageId <= 0) {
            $this->sendJson($from, [
                'type' => 'error',
                'message' => 'group_message_delete requires groupId and id',
            ]);
            return;
        }

        $memberIds = [];
        if (isset($group['memberIds']) && is_array($group['memberIds'])) {
            foreach ($group['memberIds'] as $memberId) {
                $value = (int) $memberId;
                if ($value > 0) {
                    $memberIds[$value] = $value;
                }
            }
        }

        $memberIds[$senderId] = $senderId;

        $packet = [
            'type' => 'group_message_delete',
            'data' => [
                'id' => $messageId,
                'groupId' => $groupId,
                'senderId' => $senderId,
                'createdAt' => $createdAt !== '' ? $createdAt : (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Colombo')))->format(\DateTimeInterface::ATOM),
                'group' => [
                    'id' => $groupId,
                    'name' => isset($group['name']) ? (string) $group['name'] : 'Group',
                    'description' => isset($group['description']) ? (string) $group['description'] : '',
                    'image' => isset($group['image']) ? (string) $group['image'] : '',
                    'memberIds' => array_values($memberIds),
                    'adminIds' => isset($group['adminIds']) && is_array($group['adminIds']) ? $group['adminIds'] : [$senderId],
                    'permissions' => isset($group['permissions']) && is_array($group['permissions'])
                        ? $group['permissions']
                        : ['onlyAdminsCanMessage' => false, 'onlyAdminsCanEdit' => true],
                    'createdBy' => isset($group['createdBy']) ? (int) $group['createdBy'] : $senderId,
                ],
            ],
        ];

        foreach ($memberIds as $memberId) {
            if (isset($this->userConnections[$memberId])) {
                $this->sendJson($this->userConnections[$memberId], $packet);
                continue;
            }

            $this->queuePacket($memberId, $packet);
        }
    }

    private function sendJson(ConnectionInterface $conn, array $payload): void
    {
        $conn->send((string) json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    private function broadcastUsersRefresh(): void
    {
        foreach ($this->clients as $client) {
            if (!$client instanceof ConnectionInterface) {
                continue;
            }

            $this->sendJson($client, [
                'type' => 'users_refresh',
            ]);
        }
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

    private function ensureSocketQueueTable(): void
    {
        $this->pdo->exec(
            'CREATE TABLE IF NOT EXISTS socket_message_queue (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                receiver_id INT NOT NULL,
                payload_json LONGTEXT NOT NULL,
                delivered TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                delivered_at TIMESTAMP NULL DEFAULT NULL,
                INDEX idx_receiver_delivered (receiver_id, delivered)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    private function queuePacket(int $receiverId, array $payload): void
    {
        $insert = $this->pdo->prepare(
            'INSERT INTO socket_message_queue (receiver_id, payload_json, delivered) VALUES (:receiver_id, :payload_json, 0)'
        );

        $insert->execute([
            ':receiver_id' => $receiverId,
            ':payload_json' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
    }

    private function deliverQueuedPackets(ConnectionInterface $conn, int $userId): void
    {
        $select = $this->pdo->prepare(
            'SELECT id, payload_json FROM socket_message_queue WHERE receiver_id = :receiver_id AND delivered = 0 ORDER BY id ASC LIMIT 500'
        );
        $select->execute([':receiver_id' => $userId]);
        $rows = $select->fetchAll(PDO::FETCH_ASSOC);

        if (!is_array($rows) || count($rows) === 0) {
            return;
        }

        $deliveredIds = [];

        foreach ($rows as $row) {
            $queueId = isset($row['id']) ? (int) $row['id'] : 0;
            $payloadRaw = isset($row['payload_json']) ? (string) $row['payload_json'] : '';

            if ($queueId <= 0 || $payloadRaw === '') {
                continue;
            }

            $payload = json_decode($payloadRaw, true);
            if (!is_array($payload)) {
                $deliveredIds[] = $queueId;
                continue;
            }

            $this->sendJson($conn, $payload);
            $deliveredIds[] = $queueId;
        }

        if (count($deliveredIds) === 0) {
            return;
        }

        $placeholders = implode(',', array_fill(0, count($deliveredIds), '?'));
        $update = $this->pdo->prepare(
            "UPDATE socket_message_queue SET delivered = 1, delivered_at = CURRENT_TIMESTAMP WHERE id IN ({$placeholders})"
        );
        $update->execute($deliveredIds);
    }
}
