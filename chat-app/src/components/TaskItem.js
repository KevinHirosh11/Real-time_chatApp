import React from 'react';

function TaskItem({ task, onToggle, onDelete }) {
  return (
    <article className={`task-item ${task.completed ? 'completed' : ''}`}>
      <label className="task-item-main">
        <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} />
        <div>
          <p className="task-title">{task.title}</p>
          <p className="task-meta">
            <span>{task.priority} priority</span>
            <span>Assigned: {task.assigneeName}</span>
            {task.dueDate ? <span>Due: {task.dueDate}</span> : null}
          </p>
        </div>
      </label>
      <button type="button" className="task-delete-btn" onClick={() => onDelete(task.id)}>
        Delete
      </button>
    </article>
  );
}

export default TaskItem;
