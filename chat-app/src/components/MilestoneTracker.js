import React, { useEffect, useState, useCallback } from 'react';

function MilestoneTracker({ group, apiBase, currentUser, users }) {
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isCreateMilestoneOpen, setIsCreateMilestoneOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: '', description: '' });
  const [milestoneForm, setMilestoneForm] = useState({
    name: '',
    description: '',
    priority: 'Medium',
    startDate: '',
    dueDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch projects for the group
  const fetchProjects = useCallback(async () => {
    if (!group) return;

    try {
      setLoading(true);
      const response = await fetch(
        `${apiBase}/projects.php?group_id=${encodeURIComponent(group.id)}`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load projects');
      }

      setProjects(result.data || []);
      if (result.data && result.data.length > 0 && !activeProject) {
        setActiveProject(result.data[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [group, apiBase, activeProject]);

  // Fetch milestones for active project
  const fetchMilestones = useCallback(async () => {
    if (!activeProject) {
      setMilestones([]);
      return;
    }

    try {
      const response = await fetch(
        `${apiBase}/milestones.php?project_id=${encodeURIComponent(activeProject)}`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load milestones');
      }

      setMilestones(result.data || []);
    } catch (err) {
      setError(err.message);
    }
  }, [activeProject, apiBase]);

  useEffect(() => {
    fetchProjects();
  }, [group, fetchProjects]);

  useEffect(() => {
    fetchMilestones();
  }, [activeProject, fetchMilestones]);

  const handleCreateProject = async (event) => {
    event.preventDefault();
    setError('');

    const name = projectForm.name.trim();
    if (!name) {
      setError('Project name is required');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/projects.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: group.id,
          name,
          description: projectForm.description.trim(),
          created_by: currentUser.id,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create project');
      }

      setProjects((prev) => [result.data, ...prev]);
      setProjectForm({ name: '', description: '' });
      setIsCreateProjectOpen(false);
      setActiveProject(result.data.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateMilestone = async (event) => {
    event.preventDefault();
    setError('');

    const name = milestoneForm.name.trim();
    if (!name || !activeProject) {
      setError('Milestone name is required');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/milestones.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: activeProject,
          name,
          description: milestoneForm.description.trim(),
          priority: milestoneForm.priority,
          start_date: milestoneForm.startDate || null,
          due_date: milestoneForm.dueDate || null,
          created_by: currentUser.id,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create milestone');
      }

      setMilestones((prev) => [result.data, ...prev]);
      setMilestoneForm({
        name: '',
        description: '',
        priority: 'Medium',
        startDate: '',
        dueDate: '',
      });
      setIsCreateMilestoneOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteProject = async (projectId) => {
    if (!window.confirm('Are you sure you want to delete this project?')) return;

    try {
      const response = await fetch(`${apiBase}/projects.php`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to delete project');
      }

      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (activeProject === projectId) {
        setActiveProject(projects[0]?.id || null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  if (!group) {
    return (
      <div className="milestone-tracker">
        <p className="helper-text">Select a group to manage project milestones</p>
      </div>
    );
  }

  return (
    <section className="milestone-tracker">
      <div className="milestone-header">
        <h3>Project Milestones</h3>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setIsCreateProjectOpen(true)}
        >
          + New Project
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {isCreateProjectOpen && (
        <form className="milestone-form" onSubmit={handleCreateProject}>
          <h4>Create New Project</h4>
          <input
            type="text"
            placeholder="Project name"
            value={projectForm.name}
            onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
            required
          />
          <textarea
            placeholder="Project description"
            value={projectForm.description}
            onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
          />
          <div className="form-actions">
            <button type="submit">Create Project</button>
            <button
              type="button"
              onClick={() => setIsCreateProjectOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {projects.length > 0 && (
        <div className="projects-list">
          <div className="projects-tabs">
            {projects.map((project) => (
              <button
                key={project.id}
                className={`project-tab ${activeProject === project.id ? 'active' : ''}`}
                onClick={() => setActiveProject(project.id)}
              >
                {project.name}
                <span className="project-status" title={project.status}>
                  {project.status?.charAt(0).toUpperCase()}
                </span>
              </button>
            ))}
          </div>

          <div className="milestones-section">
            <div className="milestones-header">
              <h4>Milestones</h4>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCreateMilestoneOpen(true)}
              >
                + Add Milestone
              </button>
            </div>

            {isCreateMilestoneOpen && (
              <form className="milestone-form" onSubmit={handleCreateMilestone}>
                <h5>Create New Milestone</h5>
                <input
                  type="text"
                  placeholder="Milestone name"
                  value={milestoneForm.name}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, name: e.target.value })
                  }
                  required
                />
                <textarea
                  placeholder="Milestone description"
                  value={milestoneForm.description}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, description: e.target.value })
                  }
                />
                <select
                  value={milestoneForm.priority}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, priority: e.target.value })
                  }
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                </select>
                <input
                  type="date"
                  placeholder="Start date"
                  value={milestoneForm.startDate}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, startDate: e.target.value })
                  }
                />
                <input
                  type="date"
                  placeholder="Due date"
                  value={milestoneForm.dueDate}
                  onChange={(e) =>
                    setMilestoneForm({ ...milestoneForm, dueDate: e.target.value })
                  }
                />
                <div className="form-actions">
                  <button type="submit">Create Milestone</button>
                  <button
                    type="button"
                    onClick={() => setIsCreateMilestoneOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="milestones-list">
              {loading && <p>Loading milestones...</p>}
              {milestones.length === 0 && !loading && (
                <p className="helper-text">No milestones yet. Create one to get started!</p>
              )}
              {milestones.map((milestone) => (
                <MilestoneItem
                  key={milestone.id}
                  milestone={milestone}
                  apiBase={apiBase}
                  currentUser={currentUser}
                  users={users}
                  onDelete={() => {
                    setMilestones((prev) =>
                      prev.filter((m) => m.id !== milestone.id)
                    );
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Milestone Item Component
function MilestoneItem({ milestone, apiBase, currentUser, users, onDelete }) {
  const [tasks, setTasks] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assignedTo: '',
    priority: 'Medium',
    dueDate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${apiBase}/milestone_tasks.php?milestone_id=${encodeURIComponent(milestone.id)}`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to load tasks');
      }

      setTasks(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isExpanded) {
      fetchTasks();
    }
  }, [isExpanded]);

  const handleAddTask = async (event) => {
    event.preventDefault();
    setError('');

    const title = taskForm.title.trim();
    if (!title) {
      setError('Task title is required');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/milestone_tasks.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          milestone_id: milestone.id,
          title,
          description: taskForm.description.trim(),
          assigned_to: taskForm.assignedTo || null,
          priority: taskForm.priority,
          due_date: taskForm.dueDate || null,
          created_by: currentUser.id,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create task');
      }

      setTasks((prev) => [result.data, ...prev]);
      setTaskForm({
        title: '',
        description: '',
        assignedTo: '',
        priority: 'Medium',
        dueDate: '',
      });
      setIsAddTaskOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleTask = async (task) => {
    try {
      const response = await fetch(`${apiBase}/milestone_tasks.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          completed: task.completed ? 0 : 1,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update task');
      }

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, completed: task.completed ? 0 : 1 } : t
        )
      );
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;

    try {
      const response = await fetch(`${apiBase}/milestone_tasks.php`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to delete task');
      }

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err.message);
    }
  };

  const progressPercentage =
    tasks.length > 0
      ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100)
      : 0;

  return (
    <div className="milestone-item">
      <div
        className="milestone-header-row"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="milestone-info">
          <h5>{milestone.name}</h5>
          <p>{milestone.description}</p>
          <div className="milestone-meta">
            <span className={`priority-badge priority-${milestone.priority?.toLowerCase()}`}>
              {milestone.priority}
            </span>
            <span className="dates">
              {milestone.due_date && `Due: ${milestone.due_date}`}
            </span>
            <span className="progress">
              {tasks.length} tasks • {progressPercentage}% complete
            </span>
          </div>
        </div>
        <div className="milestone-actions">
          <button
            type="button"
            className="expand-btn"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <button
            type="button"
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Delete this milestone?')) {
                onDelete();
              }
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="milestone-details">
          {error && <p className="error-banner">{error}</p>}

          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPercentage}%` }} />
          </div>

          {isAddTaskOpen && (
            <form className="add-task-form" onSubmit={handleAddTask}>
              <input
                type="text"
                placeholder="Task title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                required
              />
              <textarea
                placeholder="Task description"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
              <select
                value={taskForm.assignedTo}
                onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
              >
                <option value="">Assign to...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username}
                  </option>
                ))}
              </select>
              <select
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
              />
              <div className="form-actions">
                <button type="submit">Add Task</button>
                <button type="button" onClick={() => setIsAddTaskOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={() => setIsAddTaskOpen(true)}
          >
            + Add Task
          </button>

          <div className="tasks-list">
            {loading && <p>Loading tasks...</p>}
            {tasks.length === 0 && !loading && (
              <p className="helper-text">No tasks in this milestone yet</p>
            )}
            {tasks.map((task) => (
              <MilestoneTask
                key={task.id}
                task={task}
                onToggle={() => handleToggleTask(task)}
                onDelete={() => handleDeleteTask(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Milestone Task Component
function MilestoneTask({ task, onToggle, onDelete }) {
  return (
    <div className={`milestone-task ${task.completed ? 'completed' : ''}`}>
      <label>
        <input
          type="checkbox"
          checked={Boolean(task.completed)}
          onChange={onToggle}
        />
        <div className="task-content">
          <p className="task-title">{task.title}</p>
          {task.assigned_to_name && (
            <p className="task-assignee">Assigned to: {task.assigned_to_name}</p>
          )}
          <p className="task-meta">
            {task.priority && <span className="priority">{task.priority}</span>}
            {task.due_date && <span className="due-date">{task.due_date}</span>}
          </p>
        </div>
      </label>
      <button type="button" className="delete-btn" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

export default MilestoneTracker;
