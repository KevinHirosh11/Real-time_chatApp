<?php
declare(strict_types=1);

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = getDbConnection();

    if ($method === 'GET') {
        handleGetProjects($db);
    } elseif ($method === 'POST') {
        handleCreateProject($db);
    } elseif ($method === 'PUT') {
        handleUpdateProject($db);
    } elseif ($method === 'DELETE') {
        handleDeleteProject($db);
    } else {
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}

function handleGetProjects(PDO $db): void
{
    $groupId = $_GET['group_id'] ?? null;
    
    if (!$groupId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'group_id is required']);
        return;
    }

    $stmt = $db->prepare('SELECT * FROM projects WHERE group_id = ? ORDER BY created_at DESC');
    $stmt->execute([$groupId]);
    $projects = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'data' => $projects,
    ]);
}

function handleCreateProject(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    $groupId = $input['group_id'] ?? null;
    $name = $input['name'] ?? null;
    $description = $input['description'] ?? '';
    $createdBy = $input['created_by'] ?? null;

    if (!$groupId || !$name) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'group_id and name are required']);
        return;
    }

    $stmt = $db->prepare(
        'INSERT INTO projects (group_id, name, description, created_by, status) 
         VALUES (?, ?, ?, ?, "active")'
    );
    $stmt->execute([$groupId, $name, $description, $createdBy]);

    $projectId = (int) $db->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => 'Project created successfully',
        'data' => [
            'id' => $projectId,
            'group_id' => $groupId,
            'name' => $name,
            'description' => $description,
            'status' => 'active',
            'created_by' => $createdBy,
            'created_at' => date('Y-m-d H:i:s'),
        ],
    ]);
}

function handleUpdateProject(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $name = $input['name'] ?? null;
    $description = $input['description'] ?? null;
    $status = $input['status'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id is required']);
        return;
    }

    $updates = [];
    $params = [];

    if ($name) {
        $updates[] = 'name = ?';
        $params[] = $name;
    }
    if ($description !== null) {
        $updates[] = 'description = ?';
        $params[] = $description;
    }
    if ($status) {
        $updates[] = 'status = ?';
        $params[] = $status;
    }

    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No fields to update']);
        return;
    }

    $params[] = $id;
    $query = 'UPDATE projects SET ' . implode(', ', $updates) . ' WHERE id = ?';
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);

    echo json_encode([
        'success' => true,
        'message' => 'Project updated successfully',
    ]);
}

function handleDeleteProject(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id is required']);
        return;
    }

    $stmt = $db->prepare('DELETE FROM projects WHERE id = ?');
    $stmt->execute([$id]);

    echo json_encode([
        'success' => true,
        'message' => 'Project deleted successfully',
    ]);
}
