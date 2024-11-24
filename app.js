// Utility functions
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

// SeaTable configuration
const SEATABLE_CONFIG = {
    server: 'https://cloud.seatable.io',
    workspaceID: 'teplogas'
};

// State management
let seatable = null;
let connectionCheckInterval = null;
const state = {
    connected: false,
    todos: [],
    notes: [],
    activity: loadActivityData()
};

// SeaTable connection functions
function getStoredApiKey() {
    return localStorage.getItem('seatableApiKey');
}

function saveApiKey(key) {
    localStorage.setItem('seatableApiKey', key);
}

async function initSeaTable() {
    const apiKey = getStoredApiKey();
    if (!apiKey) {
        console.log('No API key found');
        return;
    }

    try {
        // Initialize SeaTable client
        seatable = new SeaTableAPI();
        await seatable.init({
            server: 'https://cloud.seatable.io',
            APIToken: apiKey
        });
        
        state.connected = true;
        
        // Start connection check if not already running
        if (!connectionCheckInterval) {
            connectionCheckInterval = setInterval(checkConnection, 60000);
        }
        
        // Load initial data
        await loadFromSeaTable();
        
    } catch (error) {
        console.error('Failed to connect to SeaTable:', error);
        state.connected = false;
        seatable = null;
    }
}

async function checkConnection() {
    if (!seatable) {
        state.connected = false;
        return;
    }

    try {
        await seatable.ping();
        state.connected = true;
    } catch (error) {
        console.error('Lost connection to SeaTable:', error);
        state.connected = false;
        seatable = null;
        
        // Try to reconnect
        await initSeaTable();
    }
}

// SeaTable Data Operations
async function loadFromSeaTable() {
    try {
        // Load todos
        const todos = await seatable.query('SELECT * FROM Todos');
        state.todos = todos.map(todo => ({
            id: todo._id,
            description: todo.description,
            dueDate: todo.due_date,
            priority: todo.priority,
            completed: todo.completed === 1,
            createdAt: todo.created_at
        }));

        // Load notes
        const notes = await seatable.query('SELECT * FROM Notes');
        state.notes = notes.map(note => ({
            id: note._id,
            content: note.content,
            createdAt: note.created_at
        }));

        // Render the data
        renderTodos();
        renderNotes();
    } catch (error) {
        console.error('Error loading data from SeaTable:', error);
        loadFromLocalStorage();
    }
}

async function saveTodoToSeaTable(todo) {
    try {
        const row = {
            description: todo.description,
            due_date: todo.dueDate,
            priority: todo.priority,
            completed: todo.completed ? 1 : 0,
            created_at: todo.createdAt
        };
        
        const result = await seatable.addRow('Todos', row);
        todo.id = result._id;
        return true;
    } catch (error) {
        console.error('Error saving todo to SeaTable:', error);
        return false;
    }
}

async function updateTodoInSeaTable(todo) {
    try {
        const row = {
            description: todo.description,
            due_date: todo.dueDate,
            priority: todo.priority,
            completed: todo.completed ? 1 : 0
        };
        
        await seatable.updateRow('Todos', todo.id, row);
        return true;
    } catch (error) {
        console.error('Error updating todo in SeaTable:', error);
        return false;
    }
}

async function deleteTodoFromSeaTable(id) {
    try {
        await seatable.deleteRow('Todos', id);
        return true;
    } catch (error) {
        console.error('Error deleting todo from SeaTable:', error);
        return false;
    }
}

async function saveNoteToSeaTable(note) {
    try {
        const row = {
            content: note.content,
            created_at: note.createdAt
        };
        
        const result = await seatable.addRow('Notes', row);
        note.id = result._id;
        return true;
    } catch (error) {
        console.error('Error saving note to SeaTable:', error);
        return false;
    }
}

async function deleteNoteFromSeaTable(id) {
    try {
        await seatable.deleteRow('Notes', id);
        return true;
    } catch (error) {
        console.error('Error deleting note from SeaTable:', error);
        return false;
    }
}

// Fallback localStorage functions
function loadFromLocalStorage() {
    state.todos = JSON.parse(localStorage.getItem('teploCrm_todos')) || [];
    state.notes = JSON.parse(localStorage.getItem('teploCrm_notes')) || [];
    renderTodos();
    renderNotes();
}

function saveToLocalStorage() {
    localStorage.setItem('teploCrm_todos', JSON.stringify(state.todos));
    localStorage.setItem('teploCrm_notes', JSON.stringify(state.notes));
}

// Generate default activity data
function loadActivityData() {
    const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
    const hours = Array.from({length: 11}, (_, i) => i + 8); // 8:00 - 18:00
    const activity = {};

    days.forEach(day => {
        activity[day] = {};
        hours.forEach(hour => {
            // Generate more realistic activity patterns
            let baseActivity = 30; // Base activity level
            
            // Morning peak (9-11)
            if (hour >= 9 && hour <= 11) baseActivity = 70;
            // Lunch dip (12-13)
            if (hour >= 12 && hour <= 13) baseActivity = 40;
            // Afternoon peak (14-16)
            if (hour >= 14 && hour <= 16) baseActivity = 60;
            
            // Weekend adjustments
            if (day === 'Суббота') baseActivity = Math.min(baseActivity * 1.2, 100);
            if (day === 'Воскресенье') baseActivity = baseActivity * 0.6;
            
            // Add some randomness
            activity[day][hour] = Math.min(100, Math.max(0, 
                baseActivity + Math.floor(Math.random() * 20) - 10
            ));
        });
    });

    return activity;
}

// Activity Prediction
let activityChart = null;

function getCurrentActivity() {
    const now = new Date();
    const currentHour = now.getHours();
    const weekday = now.toLocaleString('ru-RU', { weekday: 'long' });
    const formattedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    
    if (currentHour < 8 || currentHour > 18) {
        return 0; // Outside working hours
    }
    
    return state.activity[formattedWeekday][currentHour] || 0;
}

function updateActivityIndicator() {
    const activityLevel = getCurrentActivity();
    const fillElement = document.querySelector('.activity-fill');
    const percentageElement = document.querySelector('.activity-percentage');
    
    if (fillElement && percentageElement) {
        fillElement.style.width = `${activityLevel}%`;
        percentageElement.textContent = `${activityLevel}%`;
    }
}

function initActivityChart() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    const now = new Date();
    const weekday = now.toLocaleString('ru-RU', { weekday: 'long' });
    const formattedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    
    // Get data for current day
    const dayData = state.activity[formattedWeekday] || state.activity['Понедельник'];
    
    // Prepare data for chart
    const hours = Object.keys(dayData).map(hour => `${hour}:00`);
    const values = Object.values(dayData);
    
    // Highlight current hour
    const currentHour = now.getHours();
    const backgroundColor = hours.map(hour => {
        const hourNum = parseInt(hour);
        return hourNum === currentHour ? 'rgba(0, 120, 212, 0.8)' : 'rgba(0, 120, 212, 0.2)';
    });

    // Destroy existing chart if it exists
    if (activityChart) {
        activityChart.destroy();
    }

    // Create new chart
    activityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: hours,
            datasets: [{
                label: 'Загруженность (%)',
                data: values,
                backgroundColor: backgroundColor,
                borderColor: 'rgba(0, 120, 212, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Загруженность: ${context.raw}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Загруженность (%)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Время'
                    }
                }
            }
        }
    });
}

// Date and Time
function updateDateTime() {
    const now = new Date();
    $('#time').textContent = now.toLocaleTimeString('ru-RU');
    $('#date').textContent = now.toLocaleDateString('ru-RU');
    $('#weekday').textContent = now.toLocaleString('ru-RU', { weekday: 'long' });
    updateActivityIndicator();
    
    // Update chart if the hour changes
    const currentHour = now.getHours();
    if (currentHour !== lastUpdatedHour) {
        initActivityChart();
        lastUpdatedHour = currentHour;
    }
}

let lastUpdatedHour = new Date().getHours();

// Navigation
$$('nav a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        
        $$('.page').forEach(p => p.style.display = 'none');
        $(`#${page}`).style.display = 'block';
        
        $$('nav a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
    });
});

// Todo functionality
async function addTodo(todo) {
    const newTodo = {
        description: todo.description,
        dueDate: todo.dueDate,
        priority: todo.priority,
        completed: false,
        createdAt: new Date().toISOString()
    };

    const success = await saveTodoToSeaTable(newTodo);
    if (success) {
        state.todos.push(newTodo);
        renderTodos();
    } else {
        // Fallback to localStorage
        newTodo.id = Date.now();
        state.todos.push(newTodo);
        saveToLocalStorage();
        renderTodos();
    }
}

async function toggleTodo(id) {
    const todo = state.todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        const success = await updateTodoInSeaTable(todo);
        if (!success) {
            saveToLocalStorage();
        }
        renderTodos();
    }
}

async function deleteTodo(id) {
    const success = await deleteTodoFromSeaTable(id);
    state.todos = state.todos.filter(t => t.id !== id);
    if (!success) {
        saveToLocalStorage();
    }
    renderTodos();
}

// Todo filters
$$('.todo-filters button').forEach(button => {
    button.addEventListener('click', () => {
        $$('.todo-filters button').forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        renderTodos();
    });
});

function getPriorityIcon(priority) {
    switch(priority) {
        case 'high':
            return '<span class="priority high" title="Высокий приоритет">priority_high</span>';
        case 'medium':
            return '<span class="priority medium" title="Средний приоритет">remove</span>';
        case 'low':
            return '<span class="priority low" title="Низкий приоритет">arrow_downward</span>';
        default:
            return '';
    }
}

function renderTodos() {
    const todoList = $('#todoList');
    const activeFilter = $('.todo-filters button.active').dataset.filter;
    
    const filteredTodos = state.todos.filter(todo => {
        if (activeFilter === 'active') return !todo.completed;
        if (activeFilter === 'completed') return todo.completed;
        return true;
    });

    // Sort todos by priority (high -> medium -> low) and then by due date
    filteredTodos.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return new Date(a.dueDate) - new Date(b.dueDate);
    });

    todoList.innerHTML = filteredTodos.map(todo => `
        <div class="todo-item ${todo.completed ? 'completed' : ''} priority-${todo.priority}">
            <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo(${todo.id})">
            <div class="todo-content">
                <div class="todo-header">
                    ${getPriorityIcon(todo.priority)}
                    <p>${todo.description}</p>
                </div>
                <span class="due-date">${formatDate(todo.dueDate)}</span>
            </div>
            <button onclick="deleteTodo(${todo.id})">
                <span class="material-icons">delete</span>
            </button>
        </div>
    `).join('');

    renderQuickTodos();
}

function renderQuickTodos() {
    const quickList = $('#quickTodoList');
    const uncompletedTodos = state.todos
        .filter(todo => !todo.completed)
        .slice(0, 5);

    quickList.innerHTML = uncompletedTodos.map(todo => `
        <div class="quick-todo-item">
            <span class="material-icons">circle</span>
            <span>${todo.description}</span>
        </div>
    `).join('');
}

// Notes functionality
async function addNote(note) {
    const newNote = {
        content: note.content,
        createdAt: new Date().toISOString()
    };

    const success = await saveNoteToSeaTable(newNote);
    if (success) {
        state.notes.push(newNote);
        renderNotes();
    } else {
        // Fallback to localStorage
        newNote.id = Date.now();
        state.notes.push(newNote);
        saveToLocalStorage();
        renderNotes();
    }
}

async function deleteNote(id) {
    if (confirm('Удалить заметку?')) {
        try {
            if (state.connected && seatable) {
                await seatable.query(`DELETE FROM Notes WHERE _id = '${id}'`);
            }
            state.notes = state.notes.filter(note => (note._id || note.id) !== id);
            saveToLocalStorage();
            renderNotes();
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    }
}

function renderNotes() {
    const notesList = $('#notesList');
    notesList.innerHTML = state.notes
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(note => `
            <div class="note-card" data-id="${note._id || note.id}">
                <div class="note-content">
                    <div class="note-timestamp">
                        ${formatDate(note.createdAt)}
                    </div>
                    <div class="note-text">
                        ${note.content}
                    </div>
                </div>
                <button class="delete-note" aria-label="Удалить заметку">
                    <span class="material-icons">delete_outline</span>
                </button>
            </div>
        `).join('');

    // Add event listeners for delete buttons
    $$('.delete-note').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const noteId = e.target.closest('.note-card').dataset.id;
            deleteNote(noteId);
        });
    });
}

function renderQuickNotes() {
    const quickList = $('#quickNotesList');
    const recentNotes = state.notes.slice(-3);

    quickList.innerHTML = recentNotes.map(note => `
        <div class="quick-note-item">
            <p>${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</p>
        </div>
    `).join('');
}

// Modal handling
function setupModals() {
    // Todo Modal
    $('#addTodo').addEventListener('click', () => {
        $('#todoModal').style.display = 'flex';
        $('#todoDueDate').value = getTodayDate();
        $('#todoPriority').value = 'medium'; // Set default priority
    });

    $('#todoForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addTodo({
            description: $('#todoDescription').value,
            dueDate: $('#todoDueDate').value,
            priority: $('#todoPriority').value
        });
        $('#todoModal').style.display = 'none';
        $('#todoForm').reset();
    });

    // Note Modal
    $('#addNote').addEventListener('click', () => {
        $('#noteModal').style.display = 'flex';
    });

    $('#noteForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addNote({
            content: $('#noteContent').value
        });
        $('#noteModal').style.display = 'none';
        $('#noteForm').reset();
    });

    // Close modals
    $$('.modal .cancel').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
            button.closest('form').reset();
        });
    });

    $$('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                modal.querySelector('form').reset();
            }
        });
    });
}

// API Key handling
function setupApiKeyHandler() {
    const apiKeyInput = $('#apiKey');
    let typingTimer;
    
    // Set initial value
    apiKeyInput.value = getStoredApiKey() || '';
    
    // Handle input with debounce
    apiKeyInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(async () => {
            const newApiKey = apiKeyInput.value.trim();
            if (newApiKey !== getStoredApiKey()) {
                saveApiKey(newApiKey);
                
                // Clear any existing connection
                if (connectionCheckInterval) {
                    clearInterval(connectionCheckInterval);
                    connectionCheckInterval = null;
                }
                state.connected = false;
                seatable = null;
                
                // Try to connect with new key
                await initSeaTable();
            }
        }, 1000); // Wait 1 second after typing stops
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    setupApiKeyHandler();
    updateDateTime();
    initSeaTable();
    initActivityChart();
    setupModals();
    
    // Update time and activity every second
    setInterval(updateDateTime, 1000);
});

function formatDate(date) {
    return new Date(date).toLocaleDateString('ru-RU');
}

function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}
