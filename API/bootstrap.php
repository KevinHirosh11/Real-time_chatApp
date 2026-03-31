<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function jsonResponse(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readJsonBody(): array
{
    $rawBody = file_get_contents('php://input');
    if ($rawBody === false || $rawBody === '') {
        return [];
    }

    $data = json_decode($rawBody, true);
    return is_array($data) ? $data : [];
}

function ensureUserProfileColumns(PDO $pdo): void
{
    $columnStmt = $pdo->query("SHOW COLUMNS FROM users");
    $columns = $columnStmt ? $columnStmt->fetchAll(PDO::FETCH_COLUMN, 0) : [];
    $lookup = [];

    foreach ($columns as $name) {
        $lookup[strtolower((string) $name)] = true;
    }

    if (!isset($lookup['bio'])) {
        $pdo->exec("ALTER TABLE users ADD COLUMN bio VARCHAR(500) DEFAULT NULL");
    }

    if (!isset($lookup['profile_image'])) {
        $pdo->exec("ALTER TABLE users ADD COLUMN profile_image VARCHAR(255) DEFAULT NULL");
    }
}

function resolveProfileImageUrl(?string $storedPath): ?string
{
    $path = trim((string) $storedPath);
    if ($path === '') {
        return null;
    }

    if (preg_match('#^https?://#i', $path)) {
        return $path;
    }

    $scheme = 'http';
    if (!empty($_SERVER['REQUEST_SCHEME'])) {
        $scheme = (string) $_SERVER['REQUEST_SCHEME'];
    } elseif (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        $scheme = 'https';
    }

    $host = !empty($_SERVER['HTTP_HOST']) ? (string) $_SERVER['HTTP_HOST'] : 'localhost';
    $basePath = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    $normalizedPath = ltrim(str_replace('\\', '/', $path), '/');

    return sprintf('%s://%s%s/%s', $scheme, $host, $basePath, $normalizedPath);
}
