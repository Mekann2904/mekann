# Task Manager Frontend

A web-based frontend for the Task Manager REST API.

## Components

### 1. Tasks Page (`tasks-page`)
- Main container displaying all tasks
- Shows loading state, empty state, and task list
- Automatically refreshes on task changes

### 2. Task Card (`task-card`)
- Individual task display component
- Shows title, description, status, priority, due date, assignee, and tags
- Visual indicators for overdue tasks and completed tasks
- Action buttons: Complete, Edit, Delete

### 3. Task Form (`task-form`)
- Modal form for creating and editing tasks
- Fields: Title, Description, Status, Priority, Due Date, Assignee, Tags, Parent Task ID
- Form validation and error handling

### 4. Task Filters (`task-filters`)
- Filter by status (To Do, In Progress, Completed, Cancelled)
- Filter by priority (Urgent, High, Medium, Low)
- Filter by tag (text input)
- Filter by assignee (text input)
- Overdue only checkbox
- Clear filters button

## Usage

### Start the API Server

```bash
# Using pi CLI
/api start

# Or specify a port
/api start 8080
```

### Access the Frontend

1. Start the server (default port: 3456)
2. Open http://localhost:3456 in your browser

### Features

- **Create Task**: Click "+ New Task" button
- **Edit Task**: Click "Edit" button on any task card
- **Complete Task**: Click "Done" button on any task card
- **Delete Task**: Click "Delete" button, then confirm
- **Filter Tasks**: Use the filter controls at the top
- **View Statistics**: Stats bar shows totals and breakdowns

## File Structure

```
public/
  index.html    - Main HTML structure
  styles.css    - CSS styling
  app.js        - JavaScript application logic
  README.md     - This file
```

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | GET | List tasks (with filters) |
| `/api/tasks` | POST | Create task |
| `/api/tasks/:id` | GET | Get single task |
| `/api/tasks/:id` | PUT | Update task |
| `/api/tasks/:id` | DELETE | Delete task |
| `/api/tasks/:id/complete` | PATCH | Mark task complete |
| `/api/tasks/stats` | GET | Get statistics |

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Uses ES6+ features (fetch API, async/await, template literals)
- Responsive design for mobile and desktop

## Styling

- CSS custom properties for theming
- Mobile-first responsive design
- Accessibility considerations (focus states, color contrast)
