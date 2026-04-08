<?php
declare(strict_types=1);

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    $db = getDbConnection();

    if ($method === 'GET') {
        handleGetTasks($db);
    } elseif ($method === 'POST') {
        handleCreateTask($db);
    } elseif ($method === 'PUT') {
        handleUpdateTask($db);
    } elseif ($method === 'DELETE') {
        handleDeleteTask($db);
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

function handleGetTasks(PDO $db): void
{
    $milestoneId = $_GET['milestone_id'] ?? null;
    
    if (!$milestoneId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'milestone_id is required']);
        return;
    }

    $stmt = $db->prepare(
        'SELECT t.*, u.username as assigned_to_name
         FROM milestone_tasks t
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.milestone_id = ?
         ORDER BY t.created_at DESC'
    );
    $stmt->execute([$milestoneId]);
    $tasks = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'data' => $tasks,
    ]);
}

function handleCreateTask(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    $milestoneId = $input['milestone_id'] ?? null;
    $title = $input['title'] ?? null;
    $description = $input['description'] ?? '';
    $assignedTo = $input['assigned_to'] ?? null;
    $priority = $input['priority'] ?? 'Medium';
    $dueDate = $input['due_date'] ?? null;
    $createdBy = $input['created_by'] ?? null;

    if (!$milestoneId || !$title) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'milestone_id and title are required']);
        return;
    }

    $stmt = $db->prepare(
        'INSERT INTO milestone_tasks (milestone_id, title, description, assigned_to, priority, due_date, created_by, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, "open")'
    );
    $stmt->execute([$milestoneId, $title, $description, $assignedTo, $priority, $dueDate, $createdBy]);

    $taskId = (int) $db->lastInsertId();

    // Get assigned user name
    $assignedToName = null;
    if ($assignedTo) {
        $userStmt = $db->prepare('SELECT username FROM users WHERE id = ?');
        $userStmt->execute([$assignedTo]);
        $user = $userStmt->fetch();
        $assignedToName = $user ? $user['username'] : null;
    }

    echo json_encode([
        'success' => true,
        'message' => 'Task created successfully',
        'data' => [
            'id' => $taskId,
            'milestone_id' => $milestoneId,
            'title' => $title,
            'description' => $description,
            'assigned_to' => $assignedTo,
            'assigned_to_name' => $assignedToName,
            'priority' => $priority,
            'status' => 'open',
            'due_date' => $dueDate,
            'completed' => 0,
            'created_by' => $createdBy,
            'created_at' => date('Y-m-d H:i:s'),
        ],
    ]);
}

function handleUpdateTask(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);

    $id = $input['id'] ?? null;
    $title = $input['title'] ?? null;
    $description = $input['description'] ?? null;
    $status = $input['status'] ?? null;
    $priority = $input['priority'] ?? null;
    $dueDate = $input['due_date'] ?? null;
    $completed = $input['completed'] ?? null;
    $assignedTo = $input['assigned_to'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id is required']);
        return;
    }

    $updates = [];
    $params = [];

    if ($title) {
        $updates[] = 'title = ?';
        $params[] = $title;
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
    if ($completed !== null) {
        $updates[] = 'completed = ?';
        $params[] = $completed ? 1 : 0;
    }
    if ($assignedTo !== null) {
        $updates[] = 'assigned_to = ?';
        $params[] = $assignedTo;
    }

    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'No fields to update']);
        return;
    }

    $params[] = $id;
    $query = 'UPDATE milestone_tasks SET ' . implode(', ', $updates) . ' WHERE id = ?';
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);

    echo json_encode([
        'success' => true,
        'message' => 'Task updated successfully',
    ]);
}

function handleDeleteTask(PDO $db): void
{
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? null;

    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'id is required']);
        return;
    }

    $stmt = $db->prepare('DELETE FROM milestone_tasks WHERE id = ?');
    $stmt->execute([$id]);

    echo json_encode([
        'success' => true,
        'message' => 'Task deleted successfully',
    ]);
}
