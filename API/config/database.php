<?php
declare(strict_types=1);

function getDbConnection(): PDO
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

    // Keep DB timestamps deterministic in UTC, then convert in API responses.
    $pdo->exec("SET time_zone = '+00:00'");

    return $pdo;
}
