/**
 * Task Manager Frontend Application
 * Interacts with the REST API at http://localhost:3456/api/tasks
 */

const API_BASE = 'http://localhost:3456/api';

// State
let tasks = [];
let currentEditId = null;
let deleteTaskId = null;

// DOM Elements
const tasksList = document.getElementById('tasksList');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const taskFormModal = document.getElementById('taskFormModal');
const deleteModal = document.getElementById('deleteModal');
const taskForm = document.getElementById('taskForm');

// Filter elements
const statusFilter = document.getElementById('statusFilter');
const priorityFilter = document.getElementById('priorityFilter');
const tagFilter = document.getElementById('tagFilter');
const assigneeFilter = document.getElementById('assigneeFilter');
const overdueFilter = document.getElementById('overdueFilter');

// Stats elements
const totalTasks = document.getElementById('totalTasks');
const todoTasks = document.getElementById('todoTasks');
const inProgressTasks = document.getElementById('inProgressTasks');
const completedTasks = document.getElementById('completedTasks');
const overdueTasks = document.getElementById('overdueTasks');

// ============================================
// API Functions
// ============================================

async function fetchTasks(params = {}) {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.priority) query.append('priority', params.priority);
    if (params.tag) query.append('tag', params.tag);
    if (params.assignee) query.append('assignee', params.assignee);
    if (params.overdue) query.append('overdue', 'true');

    const url = `${API_BASE}/tasks${query.toString() ? '?' + query.toString() : ''}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to fetch tasks');
    }
    
    return data.data;
}

async function fetchTask(id) {
    const response = await fetch(`${API_BASE}/tasks/${id}`);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Task not found');
    }
    
    return data.data;
}

async function createTask(taskData) {
    const response = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to create task');
    }
    
    return data.data;
}

async function updateTask(id, taskData) {
    const response = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to update task');
    }
    
    return data.data;
}

async function completeTask(id) {
    const response = await fetch(`${API_BASE}/tasks/${id}/complete`, {
        method: 'PATCH'
    });
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to complete task');
    }
    
    return data.data;
}

async function deleteTask(id) {
    const response = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'DELETE'
    });
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to delete task');
    }
    
    return data.data;
}

async function fetchStats() {
    const response = await fetch(`${API_BASE}/tasks/stats`);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Failed to fetch stats');
    }
    
    return data.data;
}

// ============================================
// UI Functions
// ============================================

function getFilters() {
    return {
        status: statusFilter.value,
        priority: priorityFilter.value,
        tag: tagFilter.value,
        assignee: assigneeFilter.value,
        overdue: overdueFilter.checked
    };
}

async function loadTasks() {
    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    tasksList.innerHTML = '';
    
    try {
        const filters = getFilters();
        tasks = await fetchTasks(filters);
        renderTasks();
        await updateStats();
    } catch (error) {
        showToast(error.message, 'error');
        emptyState.style.display = 'block';
    } finally {
        loadingState.style.display = 'none';
    }
}

async function updateStats() {
    try {
        const stats = await fetchStats();
        totalTasks.textContent = stats.total || 0;
        todoTasks.textContent = stats.byStatus?.todo || 0;
        inProgressTasks.textContent = stats.byStatus?.in_progress || 0;
        completedTasks.textContent = stats.byStatus?.completed || 0;
        overdueTasks.textContent = stats.overdue || 0;
    } catch (error) {
        console.error('Failed to update stats:', error);
    }
}

function renderTasks() {
    if (tasks.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    tasksList.innerHTML = tasks.map(task => createTaskCard(task)).join('');
    
    // Attach event listeners
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
    });
    
    document.querySelectorAll('.complete-btn').forEach(btn => {
        btn.addEventListener('click', () => handleComplete(btn.dataset.id));
    });
}

function createTaskCard(task) {
    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && 
                      task.status !== 'completed' && task.status !== 'cancelled';
    
    const tagsHtml = task.tags && task.tags.length > 0
        ? task.tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')
        : '';
    
    const dueDateHtml = task.dueDate
        ? `<span class="task-meta-item ${isOverdue ? 'overdue' : ''}">Due: ${formatDate(task.dueDate)}</span>`
        : '';
    
    const assigneeHtml = task.assignee
        ? `<span class="task-meta-item">Assignee: ${escapeHtml(task.assignee)}</span>`
        : '';
    
    const descriptionHtml = task.description
        ? `<p class="task-description">${escapeHtml(task.description)}</p>`
        : '';
    
    return `
        <div class="task-card ${task.status === 'completed' ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}" data-id="${task.id}">
            <div class="task-header">
                <h3 class="task-title">${escapeHtml(task.title)}</h3>
                <div class="task-actions">
                    ${task.status !== 'completed' ? `
                        <button class="btn btn-small btn-primary complete-btn" data-id="${task.id}" title="Mark complete">Done</button>
                    ` : ''}
                    <button class="btn btn-small btn-secondary edit-btn" data-id="${task.id}" title="Edit">Edit</button>
                    <button class="btn btn-small btn-danger delete-btn" data-id="${task.id}" title="Delete">Delete</button>
                </div>
            </div>
            <div class="task-meta">
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                <span class="status-badge status-${task.status}">${formatStatus(task.status)}</span>
                ${dueDateHtml}
                ${assigneeHtml}
            </div>
            ${descriptionHtml}
            ${tagsHtml ? `<div class="task-tags">${tagsHtml}</div>` : ''}
        </div>
    `;
}

// ============================================
// Modal Functions
// ============================================

function openCreateModal() {
    currentEditId = null;
    document.getElementById('formTitle').textContent = 'New Task';
    document.getElementById('submitBtn').textContent = 'Create Task';
    taskForm.reset();
    taskFormModal.style.display = 'flex';
}

async function openEditModal(id) {
    try {
        const task = await fetchTask(id);
        currentEditId = id;
        
        document.getElementById('formTitle').textContent = 'Edit Task';
        document.getElementById('submitBtn').textContent = 'Save Changes';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title || '';
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskStatus').value = task.status || 'todo';
        document.getElementById('taskPriority').value = task.priority || 'medium';
        document.getElementById('taskDueDate').value = task.dueDate ? task.dueDate.split('T')[0] : '';
        document.getElementById('taskAssignee').value = task.assignee || '';
        document.getElementById('taskTags').value = task.tags ? task.tags.join(', ') : '';
        document.getElementById('taskParentId').value = task.parentTaskId || '';
        
        taskFormModal.style.display = 'flex';
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function closeFormModal() {
    taskFormModal.style.display = 'none';
    currentEditId = null;
}

function openDeleteModal(id) {
    deleteTaskId = id;
    deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    deleteModal.style.display = 'none';
    deleteTaskId = null;
}

// ============================================
// Event Handlers
// ============================================

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const taskData = {
        title: document.getElementById('taskTitle').value.trim(),
        description: document.getElementById('taskDescription').value.trim() || undefined,
        status: document.getElementById('taskStatus').value,
        priority: document.getElementById('taskPriority').value,
        dueDate: document.getElementById('taskDueDate').value || undefined,
        assignee: document.getElementById('taskAssignee').value.trim() || undefined,
        tags: parseTags(document.getElementById('taskTags').value),
        parentTaskId: document.getElementById('taskParentId').value.trim() || undefined
    };
    
    try {
        if (currentEditId) {
            await updateTask(currentEditId, taskData);
            showToast('Task updated successfully', 'success');
        } else {
            await createTask(taskData);
            showToast('Task created successfully', 'success');
        }
        
        closeFormModal();
        await loadTasks();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleComplete(id) {
    try {
        await completeTask(id);
        showToast('Task completed', 'success');
        await loadTasks();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function handleDelete() {
    if (!deleteTaskId) return;
    
    try {
        await deleteTask(deleteTaskId);
        showToast('Task deleted', 'success');
        closeDeleteModal();
        await loadTasks();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function clearFilters() {
    statusFilter.value = '';
    priorityFilter.value = '';
    tagFilter.value = '';
    assigneeFilter.value = '';
    overdueFilter.checked = false;
    loadTasks();
}

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatStatus(status) {
    const statusMap = {
        'todo': 'To Do',
        'in_progress': 'In Progress',
        'completed': 'Completed',
        'cancelled': 'Cancelled'
    };
    return statusMap[status] || status;
}

function parseTags(tagString) {
    if (!tagString.trim()) return [];
    return tagString.split(',').map(tag => tag.trim()).filter(tag => tag);
}

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// Event Listeners
// ============================================

document.getElementById('newTaskBtn').addEventListener('click', openCreateModal);
document.getElementById('closeModalBtn').addEventListener('click', closeFormModal);
document.getElementById('cancelBtn').addEventListener('click', closeFormModal);
taskForm.addEventListener('submit', handleFormSubmit);

document.getElementById('confirmDeleteBtn').addEventListener('click', handleDelete);
document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);

document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

// Filter change listeners
[statusFilter, priorityFilter].forEach(el => {
    el.addEventListener('change', loadTasks);
});

[tagFilter, assigneeFilter].forEach(el => {
    let timeout;
    el.addEventListener('input', () => {
        clearTimeout(timeout);
        timeout = setTimeout(loadTasks, 300);
    });
});

overdueFilter.addEventListener('change', loadTasks);

// Close modals on outside click
taskFormModal.addEventListener('click', (e) => {
    if (e.target === taskFormModal) closeFormModal();
});

deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeDeleteModal();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeFormModal();
        closeDeleteModal();
    }
});

// Initialize
loadTasks();
