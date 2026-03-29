<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

try {
    $pdo = getDbConnection();
    $pdo->query('SELECT 1');

    jsonResponse(200, [
        'success' => true,
        'message' => 'API is running',
        'database' => 'connected',
    ]);
} catch (Throwable $e) {
    jsonResponse(500, [
        'success' => false,
        'message' => 'Database connection failed',
        'error' => $e->getMessage(),
    ]);
}
