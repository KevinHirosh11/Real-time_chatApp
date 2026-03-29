<?php
declare(strict_types=1);

use Ratchet\Http\HttpServer;
use Ratchet\Server\IoServer;
use Ratchet\WebSocket\WsServer;
use SocketServer\ChatServer;

require __DIR__ . '/vendor/autoload.php';

$host = '0.0.0.0';
$port = 8080;

$chatServer = new ChatServer();
$socketServer = IoServer::factory(
    new HttpServer(
        new WsServer($chatServer)
    ),
    $port,
    $host
);

echo "WebSocket server running on ws://{$host}:{$port}" . PHP_EOL;
$socketServer->run();
