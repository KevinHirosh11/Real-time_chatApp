import React, { useMemo, useState } from 'react';
import TaskItem from './TaskItem';

function TaskTracker({ tasks, users, currentUser, onAddTask, onToggleTask, onDeleteTask }) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [dueDate, setDueDate] = useState('');

  const assigneeOptions = useMemo(() => {
    return [currentUser, ...users].filter(Boolean);
  }, [currentUser, users]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return;
    }

    const selectedAssignee = assigneeOptions.find((user) => String(user.id) === String(assigneeId));

    onAddTask({
      title: trimmedTitle,
      assigneeId: selectedAssignee ? Number(selectedAssignee.id) : Number(currentUser.id),
      assigneeName: selectedAssignee ? selectedAssignee.username : currentUser.username,
      priority,
      dueDate,
    });

    setTitle('');
    setAssigneeId('');
    setPriority('Medium');
    setDueDate('');
  };

  return (
    <section className="tasks-board">
      <div className="tasks-summary">
        <h3>Task Tracking</h3>
        <p>
          {tasks.filter((task) => !task.completed).length} open of {tasks.length} total
        </p>
      </div>

      <form className="task-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Add new task item"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">Assign to me</option>
          {assigneeOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </select>

        <select value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>

        <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />

        <button type="submit">Add Task</button>
      </form>

      <div className="task-list">
        {tasks.length === 0 ? <p className="helper-text">No tasks yet. Add your first task item.</p> : null}
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} onToggle={onToggleTask} onDelete={onDeleteTask} />
        ))}
      </div>
    </section>
  );
}

export default TaskTracker;
