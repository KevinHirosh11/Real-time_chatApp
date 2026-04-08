<?php
declare(strict_types=1);

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = getDbConnection();

    if ($method === 'GET') {
        handleGetMilestones($db);
    } elseif ($method === 'POST') {
        handleCreateMilestone($db);
    } elseif ($method === 'PUT') {
        handleUpdateMilestone($db);
    } elseif ($method === 'DELETE') {
        handleDeleteMilestone($db);
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

function handleGetMilestones(PDO $db): void
{
    $projectId = $_GET['project_id'] ?? null;
    
    if (!$projectId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id is required']);
        return;
    }

    $stmt = $db->prepare(
        'SELECT m.*, 
                COUNT(CASE WHEN t.completed = 1 THEN 1 END) as completed_tasks,
                COUNT(t.id) as total_tasks
         FROM milestones m
         LEFT JOIN milestone_tasks t ON m.id = t.milestone_id
         WHERE m.project_id = ?
         GROUP BY m.id
         ORDER BY m.due_date ASC'
    );
    $stmt->execute([$projectId]);
    $milestones = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'data' => $milestones,
    ]);
}

function handleCreateMilestone(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    $projectId = $input['project_id'] ?? null;
    $name = $input['name'] ?? null;
    $description = $input['description'] ?? '';
    $priority = $input['priority'] ?? 'Medium';
    $dueDate = $input['due_date'] ?? null;
    $startDate = $input['start_date'] ?? null;
    $createdBy = $input['created_by'] ?? null;

    if (!$projectId || !$name) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'project_id and name are required']);
        return;
    }

    $stmt = $db->prepare(
        'INSERT INTO milestones (project_id, name, description, priority, due_date, start_date, created_by, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, "not_started")'
    );
    $stmt->execute([$projectId, $name, $description, $priority, $dueDate, $startDate, $createdBy]);

    $milestoneId = (int) $db->lastInsertId();

    echo json_encode([
        'success' => true,
        'message' => 'Milestone created successfully',
        'data' => [
            'id' => $milestoneId,
            'project_id' => $projectId,
            'name' => $name,
            'description' => $description,
            'priority' => $priority,
            'status' => 'not_started',
            'due_date' => $dueDate,
            'start_date' => $startDate,
            'progress_percentage' => 0,
            'created_by' => $createdBy,
            'created_at' => date('Y-m-d H:i:s'),
            'completed_tasks' => 0,
            'total_tasks' => 0,
        ],
    ]);
}

function handleUpdateMilestone(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $name = $input['name'] ?? null;
    $description = $input['description'] ?? null;
    $status = $input['status'] ?? null;
    $priority = $input['priority'] ?? null;
    $dueDate = $input['due_date'] ?? null;
    $startDate = $input['start_date'] ?? null;
    $progressPercentage = $input['progress_percentage'] ?? null;

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
    if ($priority) {
        $updates[] = 'priority = ?';
        $params[] = $priority;
    }
    if ($dueDate !== null) {
        $updates[] = 'due_date = ?';
        $params[] = $dueDate;
    }
    if ($startDate !== null) {
        $updates[] = 'start_date = ?';
        $params[] = $startDate;
    }
    if ($progressPercentage !== null) {
        $updates[] = 'progress_percentage = ?';
        $params[] = $progressPercentage;
    }

    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No fields to update']);
        return;
    }

    $params[] = $id;
    $query = 'UPDATE milestones SET ' . implode(', ', $updates) . ' WHERE id = ?';
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);

    echo json_encode([
        'success' => true,
        'message' => 'Milestone updated successfully',
    ]);
}

function handleDeleteMilestone(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id is required']);
        return;
    }

    $stmt = $db->prepare('DELETE FROM milestones WHERE id = ?');
    $stmt->execute([$id]);

    echo json_encode([
        'success' => true,
        'message' => 'Milestone deleted successfully',
    ]);
}
