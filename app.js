// State Management
let currentDate = new Date();
let currentView = 'day-view';
let selectedPeriod = new Date().getHours() >= 12 ? 'PM' : 'AM';

// Constants
const AM_HOURS = ["12:00-12:59", "1:00-1:59", "2:00-2:59", "3:00-3:59", "4:00-4:59", "5:00-5:59", "6:00-6:59", "7:00-7:59", "8:00-8:59", "9:00-9:59", "10:00-10:59", "11:00-11:59"];
const PM_HOURS = ["12:00-12:59", "1:00-1:59", "2:00-2:59", "3:00-3:59", "4:00-4:59", "5:00-5:59", "6:00-6:59", "7:00-7:59", "8:00-8:59", "9:00-9:59", "10:00-10:59", "11:00-11:59"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STORAGE_KEY = 'WorkflowData';

// Data Store
var workData = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

// Migrate old data on load (convert string tasks to objects)
for (let d in workData) {
    ['AM', 'PM'].forEach(p => {
        if (workData[d][p]) {
            for (let h in workData[d][p]) {
                if (Array.isArray(workData[d][p][h])) {
                    workData[d][p][h] = workData[d][p][h].map(task => {
                        if (typeof task === 'string') {
                            return { desc: task, category: 'personal', done: false, id: Date.now() + Math.random() };
                        }
                        return task;
                    });
                }
            }
        }
    });
}
saveData();

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workData));
    if (typeof syncToFirebase === 'function') {
        syncToFirebase(workData);
    }
}

let activeInlineInput = null; // Track where the user is currently typing

const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view-section');
const periodToggles = document.querySelectorAll('.ampm-toggle .toggle-btn');
const scheduleList = document.getElementById('schedule-list');
const expensesSection = document.getElementById('expenses-section');
const showExpensesBtn = document.getElementById('show-expenses');
const ampmToggle = document.querySelector('.ampm-toggle');
const expenseForm = document.getElementById('expense-form');
const expensesList = document.getElementById('expenses-list');

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initSwipeGestures();
    
    if (showExpensesBtn) {
        showExpensesBtn.addEventListener('click', () => {
            currentDayMode = 'expenses';
            populateExpenseTimeSlots();
            renderDayView();
        });
    }

    const editBudgetBtn = document.getElementById('edit-budget-btn');
    if (editBudgetBtn) {
        editBudgetBtn.addEventListener('click', () => {
            const dateStr = getFormatDate(currentDate);
            const globalBudget = localStorage.getItem('WorkflowBudget') || 500;
            const currentDayBudget = workData[dateStr]?.budget || globalBudget;
            
            const newBudget = prompt(`Set daily budget for ${dateStr} (৳):`, currentDayBudget);
            if (newBudget !== null && !isNaN(newBudget) && newBudget.trim() !== "") {
                const val = parseFloat(newBudget);
                if (!workData[dateStr]) workData[dateStr] = {};
                workData[dateStr].budget = val;
                
                saveData();
                updateProgressRing();
            }
        });
    }

    const refreshBtns = document.querySelectorAll('.refresh-app');
    refreshBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.reload();
        });
    });

    if (expenseForm) {
        expenseForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const desc = document.getElementById('expense-desc').value.trim();
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const category = document.getElementById('expense-category').value;
            const timeSlot = document.getElementById('expense-time').value;

            if (desc && !isNaN(amount) && timeSlot) {
                addExpense(desc, amount, category, timeSlot);
                expenseForm.reset();
            }
        });
    }
});

let currentDayMode = 'schedule'; // 'schedule' or 'expenses'

function initSwipeGestures() {
    let touchstartX = 0;
    let touchendX = 0;
    let touchstartY = 0;
    let touchendY = 0;

    const content = document.querySelector('.content-wrapper');

    content.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
        touchstartY = e.changedTouches[0].screenY;
    }, { passive: true });

    content.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        touchendY = e.changedTouches[0].screenY;
        handleGesture();
    }, { passive: true });

    function handleGesture() {
        const dx = touchendX - touchstartX;
        const dy = touchendY - touchstartY;

        // Ensure vertical scroll isn't swallowed
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
            if (dx > 0) {
                // Swipe Right -> Previous
                navigate('prev');
            } else {
                // Swipe Left -> Next
                navigate('next');
            }
        }
    }

    function navigate(dir) {
        if (currentView === 'day-view') {
            currentDate.setDate(currentDate.getDate() + (dir === 'next' ? 1 : -1));
            renderDayView();
        } else if (currentView === 'month-view') {
            currentDate.setMonth(currentDate.getMonth() + (dir === 'next' ? 1 : -1));
            renderMonthView();
        } else if (currentView === 'year-view') {
            currentDate.setFullYear(currentDate.getFullYear() + (dir === 'next' ? 1 : -1));
            renderYearView();
        }
        
        // Add a visual feedback/transition if needed
        content.style.transition = 'none';
        content.style.transform = dir === 'next' ? 'translateX(20px)' : 'translateX(-20px)';
        content.style.opacity = '0.7';
        
        setTimeout(() => {
            content.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            content.style.transform = 'translateX(0)';
            content.style.opacity = '1';
        }, 50);
    }
}

tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        const targetView = e.currentTarget.dataset.tab;
        
        // Sync all tab buttons (desktop + mobile)
        tabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === targetView);
        });

        views.forEach(v => {
            v.classList.remove('active');
            if (v.id === targetView) v.classList.add('active');
        });

        currentView = targetView;
        renderCurrentView();
        
        // On mobile, scroll to top when changing view
        if (window.innerWidth < 600) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
});

periodToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        currentDayMode = 'schedule';
        periodToggles.forEach(t => t.classList.remove('active'));
        toggle.classList.add('active');
        selectedPeriod = toggle.dataset.period;
        renderDayView();
    });
});

// Navigation Handlers Day/Month/Year
document.querySelector('.prev-date').addEventListener('click', () => { currentDate.setDate(currentDate.getDate() - 1); renderDayView(); });
document.querySelector('.next-date').addEventListener('click', () => { currentDate.setDate(currentDate.getDate() + 1); renderDayView(); });

document.querySelector('.prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderMonthView(); });
document.querySelector('.next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderMonthView(); });

document.querySelector('.prev-year').addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() - 1); renderYearView(); });
document.querySelector('.next-year').addEventListener('click', () => { currentDate.setFullYear(currentDate.getFullYear() + 1); renderYearView(); });

const MOTIVATIONAL_QUOTES = [
    "The secret of getting ahead is getting started.",
    "Don't stop when you're tired. Stop when you're done.",
    "Small disciplines repeated with consistency every day lead to great achievements.",
    "Every action you take is a vote for the type of person you wish to become.",
    "Focus on being productive instead of busy.",
    "Great acts are made up of small deeds.",
    "Someday is not a day of the week. Start now.",
    "The way to get started is to quit talking and begin doing."
];

function updateLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    const now = new Date();
    clockEl.innerHTML = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).replace(' ', '&nbsp;');
}

// Core Functions
function initApp() {
    // Sync AM/PM toggle buttons with the current time period
    periodToggles.forEach(t => {
        t.classList.toggle('active', t.dataset.period === selectedPeriod);
    });

    renderCurrentView();

    // Set a random motivational quote
    const quoteEl = document.getElementById('motivation-quote');
    if (quoteEl) {
        quoteEl.textContent = `"${MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)]}"`;
    }

    // Initialize clock immediately, then every second
    updateLiveClock();
    setInterval(updateLiveClock, 1000);

    populateExpenseTimeSlots();

    // Edit Modal Listeners
    const editForm = document.getElementById('edit-expense-form');
    if (editForm) editForm.addEventListener('submit', handleEditSave);
    
    const closeBtn = document.getElementById('close-edit-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeEditModal);

    const cancelBtnModal = document.getElementById('cancel-edit-btn');
    if (cancelBtnModal) cancelBtnModal.addEventListener('click', closeEditModal);

    setInterval(() => {
        if (currentView === 'day-view') {
            updateCurrentTimeHighlight();
        }
    }, 60000);
}

function populateExpenseTimeSlots() {
    const expenseTimeSelect = document.getElementById('expense-time');
    if (!expenseTimeSelect) return;

    expenseTimeSelect.innerHTML = ''; // Clear existing
    
    const now = new Date();
    const currentHourNum = now.getHours();
    const currentIsAm = currentHourNum < 12;
    const currentPeriod = currentIsAm ? 'AM' : 'PM';
    const displayHr = currentHourNum === 0 ? 12 : (currentHourNum > 12 ? currentHourNum - 12 : currentHourNum);
    const currentTimeSlotFull = `${displayHr}:00-${displayHr}:59 ${currentPeriod}`;

    // Default placeholder
    const placeholder = document.createElement('option');
    placeholder.value = "";
    placeholder.textContent = "Pick Time Slot";
    placeholder.disabled = true;
    expenseTimeSelect.appendChild(placeholder);

    const addOptions = (hours, period) => {
        hours.forEach(h => {
            const opt = document.createElement('option');
            const val = h + ' ' + period;
            opt.value = val;
            
            if (val === currentTimeSlotFull) {
                opt.textContent = val + " (Current Time Slot)";
                opt.selected = true;
            } else {
                opt.textContent = val;
            }
            expenseTimeSelect.appendChild(opt);
        });
    };

    addOptions(AM_HOURS, "AM");
    addOptions(PM_HOURS, "PM");
}

function renderCurrentView() {
    if (currentView === 'day-view') renderDayView();
    if (currentView === 'month-view') renderMonthView();
    if (currentView === 'year-view') renderYearView();
}

function getFormatDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// ---------------- DAY VIEW ----------------
// ---------------- DAY VIEW ----------------
function renderDayView() {
    // Header
    const isMobile = window.innerWidth <= 600;
    const options = isMobile ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date-display').textContent = currentDate.toLocaleDateString(undefined, options);

    const shortOptions = { weekday: 'short', day: 'numeric' };
    document.getElementById('widget-date-display').textContent = currentDate.toLocaleDateString(undefined, shortOptions);

    // Mode switching
    if (currentDayMode === 'expenses') {
        scheduleList.style.display = 'none';
        expensesSection.style.display = 'flex';
        ampmToggle.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        showExpensesBtn.classList.add('active');
        renderExpensesView();
    } else {
        scheduleList.style.display = 'grid';
        expensesSection.style.display = 'none';
        showExpensesBtn.classList.remove('active');
        ampmToggle.querySelectorAll('.toggle-btn').forEach(b => {
             b.classList.toggle('active', b.dataset.period === selectedPeriod);
        });

        // Hide empty state if in expenses mode
        const emptyStateEl = document.getElementById('empty-day-state');
        if (emptyStateEl) emptyStateEl.style.display = 'none';
        
        // List rendering
        scheduleList.innerHTML = '';
        const hours = selectedPeriod === 'AM' ? AM_HOURS : PM_HOURS;
        const dateStr = getFormatDate(currentDate);

        hours.forEach(hour => {
            const row = document.createElement('div');
            row.className = 'hour-row';
            
            // Highlight current time if applicable
            const now = new Date();
            if (getFormatDate(now) === dateStr) {
                const hourNum = now.getHours();
                const isAm = hourNum < 12;
                const displayAm = isAm ? (hourNum === 0 ? 12 : hourNum) : (hourNum === 12 ? 12 : hourNum - 12);
                if (selectedPeriod === (isAm ? 'AM' : 'PM') && hour.startsWith(displayAm + ':')) {
                    row.classList.add('current-time-slot');
                }
            }

            const label = document.createElement('div');
            label.className = 'hour-label';
            label.textContent = `${hour} ${selectedPeriod}`;
            row.appendChild(label);

            const tasksContainer = document.createElement('div');
            tasksContainer.className = 'hour-tasks';

            const currentTasks = workData[dateStr]?.[selectedPeriod]?.[hour] || [];

            if (currentTasks.length === 0) {
                if (activeInlineInput === hour) {
                    renderInlineInput(tasksContainer, dateStr, hour);
                } else {
                    const empty = document.createElement('div');
                    empty.className = 'empty-slot';
                    empty.textContent = '+ Add work';
                    empty.title = "Click to add work to this hour";
                    empty.addEventListener('click', () => {
                        activeInlineInput = hour;
                        renderDayView();
                    });
                    tasksContainer.appendChild(empty);
                }
            } else {
                currentTasks.forEach((task, index) => {
                    const taskBtn = document.createElement('div');
                    taskBtn.className = `task-item cat-${task.category} ${task.done ? 'done' : ''}`;

                    const cb = document.createElement('div');
                    cb.className = `task-checkbox ${task.done ? 'done' : ''}`;
                    cb.title = "Toggle Completion";
                    cb.addEventListener('click', (e) => {
                        e.stopPropagation();
                        task.done = !task.done;
                        if (task.done && typeof confetti === 'function') {
                            confetti({
                                particleCount: 80,
                                spread: 60,
                                colors: ['#10b981', '#38bdf8', '#f43f5e', '#6366f1'],
                                origin: { y: 0.6 }
                            });
                        }
                        saveData();
                        renderDayView();
                    });

                    const txt = document.createElement('div');
                    txt.className = 'task-text';
                    txt.innerHTML = `${task.desc} ${task.amount ? `<span class="task-amount-tag">৳${task.amount.toFixed(2)}</span>` : ''}`;
                    txt.title = "Double-click to edit";

                    const editBtn = document.createElement('div');
                    editBtn.className = 'task-edit';
                    editBtn.innerHTML = '&#9998;'; // Pencil icon
                    editBtn.title = "Edit Task";
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEditModal(task.id);
                    });

                    const del = document.createElement('div');
                    del.className = 'task-delete';
                    del.innerHTML = '&times;';
                    del.title = "Delete Task";
                    del.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`Remove this work: "${task.desc}"?`)) {
                            workData[dateStr][selectedPeriod][hour].splice(index, 1);
                            saveData();
                            renderDayView();
                        }
                    });

                    taskBtn.appendChild(cb);
                    taskBtn.appendChild(txt);
                    taskBtn.appendChild(editBtn);
                    taskBtn.appendChild(del);
                    tasksContainer.appendChild(taskBtn);
                });

                if (activeInlineInput === hour) {
                    renderInlineInput(tasksContainer, dateStr, hour);
                } else {
                    const addMore = document.createElement('div');
                    addMore.innerHTML = '&#43;';
                    addMore.style.cursor = 'pointer';
                    addMore.style.color = 'var(--text-secondary)';
                    addMore.style.padding = '0.5rem';
                    addMore.title = "Add another task";
                    addMore.addEventListener('click', () => {
                        activeInlineInput = hour;
                        renderDayView();
                    });
                    tasksContainer.appendChild(addMore);
                }
            }

            row.appendChild(tasksContainer);
            scheduleList.appendChild(row);

        });
    }

    updateProgressRing();
    updateCurrentTimeHighlight();
}

// ---------------- EXPENSES ----------------
function renderExpensesView() {
    expensesList.innerHTML = '';
    const dateStr = getFormatDate(currentDate);
    const dayData = workData[dateStr] || {};
    const manualExpenses = dayData.expenses || [];
    
    // Collect task-based expenses
    let allExpenses = [];
    
    // Add manual expenses
    manualExpenses.forEach(e => {
        allExpenses.push({...e, isTask: false});
    });

    // Add task-based expenses
    ['AM', 'PM'].forEach(p => {
        if (dayData[p]) {
            Object.keys(dayData[p]).forEach(hour => {
                dayData[p][hour].forEach(t => {
                    if (t.amount && t.amount > 0) {
                        allExpenses.push({
                            desc: t.desc,
                            amount: t.amount,
                            category: t.category,
                            id: t.id,
                            isTask: true,
                            period: p,
                            hour: hour
                        });
                    }
                });
            });
        }
    });

    allExpenses.sort((a,b) => b.id - a.id);

    if (allExpenses.length === 0) {
        expensesList.innerHTML = '<div class="empty-day-state"><div class="empty-icon">💸</div><h4>No expenses logged for today.</h4></div>';
    } else {
        allExpenses.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'expense-item';
            div.innerHTML = `
                <div class="expense-info">
                    <span class="expense-name">
                        <span class="cat-dot cat-dot-${item.category || 'personal'}"></span>
                        ${item.desc}
                        ${item.isTask ? '<span class="expense-type-tag">Schedule</span>' : '<span class="expense-type-tag">Manual</span>'}
                    </span>
                    <span class="expense-date">${new Date(item.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div class="expense-amount-group">
                    <span class="expense-value">৳${item.amount.toFixed(2)}</span>
                    <div class="expense-actions">
                        <button class="expense-action-btn edit-btn" title="Edit Expense">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="expense-action-btn delete-btn" title="Delete Expense">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                </div>
            `;
            
            div.querySelector('.edit-btn').addEventListener('click', () => editExpense(item.id));
            div.querySelector('.delete-btn').addEventListener('click', () => deleteExpenseById(item.id));
            
            expensesList.appendChild(div);
        });
    }
}

function addExpense(desc, amount, category = 'personal', timeSlotStr = '') {
    const dateStr = getFormatDate(currentDate);
    
    // If a time slot is provided, sync it to the Work Log (AM/PM tabs)
    if (timeSlotStr) {
        const parts = timeSlotStr.split(' '); // e.g. ["7:00-7:59", "AM"]
        const hourSlot = parts[0];
        const period = parts[1];

        if (!workData[dateStr]) workData[dateStr] = { AM: {}, PM: {} };
        if (!workData[dateStr][period]) workData[dateStr][period] = {};
        if (!workData[dateStr][period][hourSlot]) workData[dateStr][period][hourSlot] = [];

        workData[dateStr][period][hourSlot].push({
            desc: desc,
            category: category,
            done: false,
            amount: amount,
            id: Date.now()
        });
    } else {
        // Fallback for manual legacy expenses if needed (though UI now requires time)
        if (!workData[dateStr]) workData[dateStr] = {};
        if (!workData[dateStr].expenses) workData[dateStr].expenses = [];
        workData[dateStr].expenses.push({ id: Date.now(), desc, amount });
    }

    saveData();
    renderDayView();
}

function deleteExpenseById(id) {
    const dateStr = getFormatDate(currentDate);
    if (!confirm("Are you sure you want to delete this expense?")) return;

    let found = false;

    // 1. Check manual expenses
    if (workData[dateStr] && workData[dateStr].expenses) {
        const idx = workData[dateStr].expenses.findIndex(e => e.id === id);
        if (idx !== -1) {
            workData[dateStr].expenses.splice(idx, 1);
            found = true;
        }
    }

    // 2. Check task-based expenses if not found yet
    if (!found) {
        ['AM', 'PM'].forEach(p => {
            if (workData[dateStr] && workData[dateStr][p]) {
                Object.keys(workData[dateStr][p]).forEach(hour => {
                    const tasks = workData[dateStr][p][hour];
                    const idx = tasks.findIndex(t => t.id === id);
                    if (idx !== -1) {
                        // Either delete the whole task or just the amount? 
                        // User said "delete from time am/pm shot also" which implies removing the task or its expense nature.
                        // Let's remove the amount from the task to keep the record of work, or delete it if it's purely an expense.
                        // Most users expect 'delete expense' to remove the cost.
                        tasks[idx].amount = 0; 
                        // If it came from the expense tab, it might be a 'task' created just for the expense.
                        // Let's just zero the amount to be safe.
                        found = true;
                    }
                });
            }
        });
    }

    if (found) {
        saveData();
        renderDayView();
    }
}

let editingId = null;

function editExpense(id) {
    const dateStr = getFormatDate(currentDate);
    let target = null;

    // Find the item
    if (workData[dateStr] && workData[dateStr].expenses) {
        target = workData[dateStr].expenses.find(e => e.id === id);
    }
    
    if (!target && workData[dateStr]) {
        ['AM', 'PM'].forEach(p => {
            if (workData[dateStr][p]) {
                Object.keys(workData[dateStr][p]).forEach(hour => {
                    const found = workData[dateStr][p][hour].find(t => t.id === id);
                    if (found) target = found;
                });
            }
        });
    }

    if (!target) return;

    editingId = id;
    document.getElementById('edit-desc').value = target.desc;
    document.getElementById('edit-amount').value = target.amount;
    document.getElementById('edit-modal-overlay').classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-modal-overlay').classList.remove('active');
    editingId = null;
}

function handleEditSave(e) {
    e.preventDefault();
    if (!editingId) return;

    const dateStr = getFormatDate(currentDate);
    const newDesc = document.getElementById('edit-desc').value.trim();
    const newAmount = parseFloat(document.getElementById('edit-amount').value);

    let target = null;
    if (workData[dateStr] && workData[dateStr].expenses) {
        target = workData[dateStr].expenses.find(e => e.id === editingId);
    }
    
    if (!target && workData[dateStr]) {
        ['AM', 'PM'].forEach(p => {
            if (workData[dateStr][p]) {
                Object.keys(workData[dateStr][p]).forEach(hour => {
                    const found = workData[dateStr][p][hour].find(t => t.id === editingId);
                    if (found) target = found;
                });
            }
        });
    }

    if (target) {
        target.desc = newDesc || target.desc;
        target.amount = isNaN(newAmount) ? 0 : newAmount;
        saveData();
        renderDayView();
    }

    closeEditModal();
}

// Dynamic Shortcuts
let userShortcuts = JSON.parse(localStorage.getItem('userShortcuts')) || [
    { name: "Ghumabo", cat: "personal" },
    { name: "Office", cat: "office" },
    { name: "Commute", cat: "routine" },
    { name: "Breakfast", cat: "personal" },
    { name: "Lunch", cat: "personal" },
    { name: "Dinner", cat: "personal" },
    { name: "Gym", cat: "routine" }
];

// Migration for old string-based shortcuts
userShortcuts = userShortcuts.map(s => typeof s === 'string' ? { name: s, cat: 'personal' } : s);

function saveShortcuts() {
    localStorage.setItem('userShortcuts', JSON.stringify(userShortcuts));
}

function renderInlineInput(container, dateStr, hour) {
    const wrap = document.createElement('div');
    wrap.className = 'inline-add-container';

    const form = document.createElement('form');
    form.className = 'inline-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-input';
    input.placeholder = 'What needs to be done?';
    input.required = true;

    const select = document.createElement('select');
    select.className = 'inline-select';
    select.innerHTML = `
        <option value="personal" selected>🟢 Personal</option>
        <option value="office">🏢 Office</option>
        <option value="routine">🔵 Routine</option>
        <option value="work">💼 Work</option>
        <option value="urgent">🔴 Urgent</option>
    `;

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.className = 'inline-input';
    amountInput.placeholder = '৳0.00';
    amountInput.step = '0.01';
    amountInput.style.maxWidth = '80px';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'inline-btn';
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'inline-btn btn-cancel';
    cancelBtn.textContent = 'Cancel';

    cancelBtn.addEventListener('click', () => {
        activeInlineInput = null;
        renderDayView();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(amountInput.value) || 0;
        saveInlineTask(dateStr, selectedPeriod, hour, input.value, select.value, amt);
    });

    const mainRow = document.createElement('div');
    mainRow.className = 'inline-main-row';
    mainRow.appendChild(input);
    form.appendChild(mainRow);
    
    // Quick Add Chips
    const quickAddContainer = document.createElement('div');
    quickAddContainer.className = 'quick-add-chips';
    
    const renderChips = () => {
        quickAddContainer.innerHTML = '';
        
        userShortcuts.forEach((shortcut, index) => {
            const chip = document.createElement('div');
            chip.className = `quick-add-chip vertical-chip cat-border-${shortcut.cat}`;
            chip.innerHTML = `
                <div class="chip-content">
                    <span class="chip-cat-dot cat-dot-${shortcut.cat}"></span>
                    <span class="chip-text">${shortcut.name}</span>
                </div>
                <span class="chip-delete" title="Delete Shortcut">&times;</span>
            `;
            
            chip.addEventListener('click', (e) => {
                if (e.target.classList.contains('chip-delete')) {
                    e.stopPropagation();
                    userShortcuts.splice(index, 1);
                    saveShortcuts();
                    renderChips();
                    return;
                }
                input.value = shortcut.name;
                select.value = shortcut.cat;
                input.focus();
            });
            
            quickAddContainer.appendChild(chip);
        });

        // Add New Shortcut Button
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'add-shortcut-btn';
        addBtn.innerHTML = `<span>+ Add Current as Shortcut</span>`;
        addBtn.addEventListener('click', () => {
            const name = input.value.trim() || prompt("Enter shortcut name:");
            if (name) {
                userShortcuts.push({ name: name, cat: select.value });
                saveShortcuts();
                renderChips();
            } else {
                alert("Please enter a name for the shortcut.");
            }
        });
        quickAddContainer.appendChild(addBtn);
    };
    renderChips();

    // Properties Row (Amount + Category)
    const propertiesRow = document.createElement('div');
    propertiesRow.className = 'inline-properties-row';
    
    amountInput.className = 'inline-input inline-amount-input';
    propertiesRow.appendChild(amountInput);
    propertiesRow.appendChild(select);
    form.appendChild(propertiesRow);

    form.appendChild(quickAddContainer);

    // Actions Row (Save + Cancel)
    const actionsRow = document.createElement('div');
    actionsRow.className = 'inline-actions-row';
    
    saveBtn.className = 'inline-btn btn-save';
    cancelBtn.className = 'inline-btn btn-cancel';
    
    actionsRow.appendChild(saveBtn);
    actionsRow.appendChild(cancelBtn);
    form.appendChild(actionsRow);

    wrap.appendChild(form);

    container.appendChild(wrap);

    // Auto focus the input field when it appears
    setTimeout(() => input.focus(), 10);
}

function saveInlineTask(dateStr, period, hour, desc, category, amount = 0) {
    if (!workData[dateStr]) workData[dateStr] = { AM: {}, PM: {} };
    if (!workData[dateStr][period]) workData[dateStr][period] = {};
    if (!workData[dateStr][period][hour]) workData[dateStr][period][hour] = [];

    workData[dateStr][period][hour].push({
        desc,
        category,
        done: false,
        amount: amount,
        id: Date.now()
    });
    saveData();
    activeInlineInput = null;
    renderCurrentView();
}

function updateProgressRing() {
    const todayStr = getFormatDate(currentDate);
    const dayData = workData[todayStr] || { AM: {}, PM: {} };
    let total = 0, done = 0;

    let counts = {
        urgent: 0,
        routine: 0,
        work: 0,
        personal: 0,
        office: 0
    };

    ['AM', 'PM'].forEach(p => {
        if (dayData[p]) {
            Object.values(dayData[p]).forEach(arr => {
                arr.forEach(t => {
                    total++;
                    if (t.done) done++;
                    if (counts[t.category] !== undefined) {
                        counts[t.category]++;
                    }
                });
            });
        }
    });

    const undone = total - done;

    // Empty state logic
    const emptyStateEl = document.getElementById('empty-day-state');
    if (emptyStateEl) {
        emptyStateEl.style.display = (total === 0 && currentDayMode === 'schedule') ? 'block' : 'none';
    }

    // Center stats
    const totalEl = document.getElementById('chart-total-count');
    if (totalEl) totalEl.textContent = total;

    // Helper function to format percentages
    const formatPct = (val) => {
        if (total === 0 || val === 0) return '0%';
        let pct = (val / total) * 100;
        return Number.isInteger(pct) ? pct + '%' : pct.toFixed(2) + '%';
    };

    // Outside category stats - Display count and percentages
    const uEl = document.getElementById('chart-urgent');
    if (uEl) uEl.textContent = `${counts.urgent} (${formatPct(counts.urgent)})`;
    const wEl = document.getElementById('chart-work');
    if (wEl) wEl.textContent = `${counts.work} (${formatPct(counts.work)})`;
    const rEl = document.getElementById('chart-routine');
    if (rEl) rEl.textContent = `${counts.routine} (${formatPct(counts.routine)})`;
    const oEl = document.getElementById('chart-office');
    if (oEl) oEl.textContent = `${counts.office} (${formatPct(counts.office)})`;
    const pEl = document.getElementById('chart-personal');
    if (pEl) pEl.textContent = `${counts.personal} (${formatPct(counts.personal)})`;

    // Only show categories that have > 0%
    if (uEl) uEl.parentElement.style.display = counts.urgent > 0 ? 'flex' : 'none';
    if (wEl) wEl.parentElement.style.display = counts.work > 0 ? 'flex' : 'none';
    if (rEl) rEl.parentElement.style.display = counts.routine > 0 ? 'flex' : 'none';
    if (oEl) oEl.parentElement.style.display = counts.office > 0 ? 'flex' : 'none';
    if (pEl) pEl.parentElement.style.display = counts.personal > 0 ? 'flex' : 'none';
    
    // Total Work display
    const totalRow = document.getElementById('chart-total-row');
    if (totalRow) totalRow.style.display = total > 0 ? 'flex' : 'none';

    // Outside stats
    const doneEl = document.getElementById('chart-done-count');
    if (doneEl) doneEl.textContent = done;
    const undoneEl = document.getElementById('chart-undone-count');
    if (undoneEl) undoneEl.textContent = undone;

    // Expenses Total Cost
    const totalCostEl = document.getElementById('chart-total-cost');
    if (totalCostEl) {
        const todayStr = getFormatDate(currentDate);
        const dData = workData[todayStr] || {};
        
        // Manual expenses
        const manualTotal = (dData.expenses || []).reduce((sum, item) => sum + item.amount, 0);
        
        // Task-based expenses
        let taskTotal = 0;
        ['AM', 'PM'].forEach(p => {
            if (dData[p]) {
                Object.values(dData[p]).forEach(arr => {
                    arr.forEach(t => {
                        if (t.amount) taskTotal += t.amount;
                    });
                });
            }
        });

        const totalExposed = manualTotal + taskTotal;
        totalCostEl.textContent = totalExposed.toFixed(2);

        // Budget Comparison
        const dateStr = getFormatDate(currentDate);
        const globalBudget = parseFloat(localStorage.getItem('WorkflowBudget')) || 500;
        const dailyBudget = workData[dateStr]?.budget || globalBudget;
        
        const budgetValEl = document.getElementById('chart-budget-value');
        if (budgetValEl) budgetValEl.textContent = dailyBudget;

        const sidebarPanel = document.querySelector('.day-sidebar');
        if (sidebarPanel) {
            if (totalExposed > dailyBudget) {
                sidebarPanel.classList.add('over-budget');
            } else {
                sidebarPanel.classList.remove('over-budget');
            }
        }
    }

    const svgEl = document.querySelector('.progress-svg');
    const circleDone = document.getElementById('progress-value-circle'); // green
    const circleUndone = document.querySelector('.progress-undone');   // red
    const circleEmpty = document.querySelector('.progress-empty');     // white
    const pieChart = document.getElementById('category-pie-chart');    // center pie chart

    if (!svgEl || !circleDone || !circleUndone || !circleEmpty) return;

    // The SVG circles have r=80
    const circumference = 2 * Math.PI * 80; // approx 502.65
    circleDone.style.strokeDasharray = `${circumference} ${circumference}`;
    circleUndone.style.strokeDasharray = `${circumference} ${circumference}`;
    circleEmpty.style.strokeDasharray = `${circumference} ${circumference}`;

    if (total === 0) {
        // Show white ring
        circleEmpty.style.opacity = 1;
        circleDone.style.opacity = 0;
        circleUndone.style.opacity = 0;

        circleEmpty.style.strokeDashoffset = 0; // Full circle
        svgEl.classList.remove('spinning');

        if (pieChart) pieChart.style.background = 'transparent';
        return;
    }

    // Generate center pie chart gradient
    if (pieChart) {
        let gradientStops = [];
        let currentPct = 0;
        // Match CSS stroke colors and class names exactly
        const colors = { urgent: '#f43f5e', work: '#6366f1', routine: '#38bdf8', personal: '#10b981', office: '#f59e0b' };

        ['urgent', 'work', 'routine', 'personal', 'office'].forEach(cat => {
            if (counts[cat] > 0) {
                const slicePct = (counts[cat] / total) * 100;
                gradientStops.push(`${colors[cat]} ${currentPct}% ${currentPct + slicePct}%`);
                currentPct += slicePct;
            }
        });

        if (gradientStops.length > 0) {
            pieChart.style.background = `conic-gradient(${gradientStops.join(', ')})`;
        } else {
            pieChart.style.background = 'transparent';
        }
    }

    // Tasks > 0: Show colored rings
    circleEmpty.style.opacity = 0;
    circleDone.style.opacity = 1;
    circleUndone.style.opacity = 1;

    // Red ring is the full base
    circleUndone.style.strokeDashoffset = 0;

    // Green ring partially fills the base
    const pctDone = done / total;
    const offsetDone = circumference - (pctDone * circumference);
    circleDone.style.strokeDashoffset = offsetDone;

    // "give the moving ring like now" -> the user wants it to spin when there are tasks.
    svgEl.classList.add('spinning');
}

function updateCurrentTimeHighlight() {
    if (currentView !== 'day-view') return;
    document.querySelectorAll('.hour-row').forEach(row => row.classList.remove('current-time-slot'));

    const now = new Date();
    if (getFormatDate(now) !== getFormatDate(currentDate)) return; // Only highlight on actual today

    let hours24 = now.getHours();
    let displayHour12 = hours24 % 12 || 12;
    let currentPeriod = hours24 >= 12 ? 'PM' : 'AM';
    let mins = now.getMinutes();

    document.querySelectorAll('.hour-row').forEach(row => {
        const label = row.querySelector('.hour-label');
        if (!label) return;
        const text = label.textContent; // "10:00-10:59 AM"

        if (text.endsWith(currentPeriod)) {
            const hourPartStr = text.split(':')[0]; // "10"
            const hourPart = parseInt(hourPartStr, 10);

            if (hourPart === displayHour12) {
                row.classList.add('current-time-slot');
            }
        }
    });
}

// ---------------- MONTH VIEW ----------------
function renderMonthView() {
    document.getElementById('current-month-display').textContent = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

    const grid = document.getElementById('month-calendar-grid');
    grid.innerHTML = '';

    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    // Empty cells for prior days
    for (let i = 0; i < firstDay.getDay(); i++) {
        const empty = document.createElement('div');
        empty.className = 'day-cell other-month';
        grid.appendChild(empty);
    }

    // Days in current month
    const todayStr = getFormatDate(new Date());

    for (let i = 1; i <= lastDay.getDate(); i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';

        const loopDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), i);
        const loopDateStr = getFormatDate(loopDate);

        if (loopDateStr === todayStr) {
            cell.classList.add('today');
        }

        const num = document.createElement('div');
        num.className = 'day-number';
        num.textContent = i;
        cell.appendChild(num);

        // Check for tasks and completion to build heatmap
        let taskCount = 0;
        let doneCount = 0;
        if (workData[loopDateStr]) {
            ['AM', 'PM'].forEach(p => {
                if (workData[loopDateStr][p]) {
                    Object.values(workData[loopDateStr][p]).forEach(arr => {
                        arr.forEach(t => {
                            taskCount++;
                            if (t.done) doneCount++;
                        });
                    });
                }
            });
        }

        if (taskCount > 0) {
            const pct = doneCount / taskCount;
            if (pct === 1) cell.classList.add('heatmap-high');
            else if (pct >= 0.5) cell.classList.add('heatmap-medium');
            else cell.classList.add('heatmap-low');

            const ratio = document.createElement('span');
            ratio.textContent = `${doneCount}/${taskCount}`;
            ratio.style.fontSize = '11px';
            ratio.style.opacity = '0.9';
            ratio.style.marginTop = '4px';
            ratio.style.fontWeight = 'bold';
            cell.appendChild(ratio);
        }

        cell.addEventListener('click', () => {
            currentDate = new Date(loopDate);
            // Switch to Day view
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelector('[data-tab="day-view"]').classList.add('active');

            views.forEach(v => v.classList.remove('active'));
            document.getElementById('day-view').classList.add('active');
            currentView = 'day-view';
            renderDayView();
        });

        grid.appendChild(cell);
    }

    renderMonthExpenseChart();
}

function renderMonthExpenseChart() {
    const container = document.getElementById('month-expense-chart');
    if (!container) return;
    container.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const globalBudget = parseFloat(localStorage.getItem('WorkflowBudget')) || 500;
    
    const dayTotals = [];
    let absoluteMax = globalBudget * 1.2;

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = getFormatDate(new Date(year, month, i));
        const dayData = workData[dateStr] || {};
        const dayBudget = dayData.budget || globalBudget;
        
        let total = 0;
        total += (dayData.expenses || []).reduce((sum, item) => sum + item.amount, 0);
        ['AM', 'PM'].forEach(p => {
            if (dayData[p]) {
                Object.values(dayData[p]).forEach(arr => {
                    arr.forEach(t => { if (t.amount) total += t.amount; });
                });
            }
        });
        
        dayTotals.push({ day: i, amount: total, budget: dayBudget });
        if (total > absoluteMax) absoluteMax = total;
        if (dayBudget > absoluteMax) absoluteMax = dayBudget;
    }

    if (absoluteMax === 0) {
        container.innerHTML = '<div style="width: 100%; text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 2rem;">No expenses or budget recorded.</div>';
        return;
    }

    dayTotals.forEach(data => {
        const barGroup = document.createElement('div');
        barGroup.className = 'bar-group';
        
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = data.day;
        
        const track = document.createElement('div');
        track.className = 'bar-track';
        
        const segmentContainer = document.createElement('div');
        segmentContainer.className = 'bar-segment-container';
        
        if (data.amount > data.budget) {
            // Over budget: show budget line and red segment
            const budgetPos = (data.budget / absoluteMax) * 100;
            const bLine = document.createElement('div');
            bLine.className = 'budget-line';
            bLine.style.left = `${budgetPos}%`;
            track.appendChild(bLine);

            const blueWidth = (data.budget / absoluteMax) * 100;
            const redWidth = ((data.amount - data.budget) / absoluteMax) * 100;

            const blueBar = document.createElement('div');
            blueBar.className = 'bar-horizontal';
            const redBar = document.createElement('div');
            redBar.className = 'bar-excess';

            setTimeout(() => {
                blueBar.style.width = `${blueWidth}%`;
                redBar.style.width = `${redWidth}%`;
            }, 100);
            
            segmentContainer.appendChild(blueBar);
            segmentContainer.appendChild(redBar);
        } else {
            // Under budget: show only blue bar, no marker
            const width = (data.amount / absoluteMax) * 100;
            const blueBar = document.createElement('div');
            blueBar.className = 'bar-horizontal';
            setTimeout(() => {
                blueBar.style.width = `${width}%`;
            }, 100);
            segmentContainer.appendChild(blueBar);
        }

        track.appendChild(segmentContainer);
        
        const amountMsg = document.createElement('div');
        amountMsg.className = 'bar-amount';
        amountMsg.textContent = data.amount > 0 ? `৳${Math.round(data.amount)}` : '৳0';
        
        barGroup.appendChild(label);
        barGroup.appendChild(track);
        barGroup.appendChild(amountMsg);
        container.appendChild(barGroup);
    });
}

// ---------------- YEAR VIEW ----------------
function renderYearView() {
    document.getElementById('current-year-display').textContent = currentDate.getFullYear();

    const grid = document.getElementById('year-months-grid');
    grid.innerHTML = '';

    MONTH_NAMES.forEach((month, index) => {
        const card = document.createElement('div');
        card.className = 'month-card';

        const h3 = document.createElement('h3');
        h3.textContent = month;
        card.appendChild(h3);

        // Calculate tasks in month for heatmap summary
        let monthTaskCount = 0;
        let monthDoneCount = 0;
        for (let i = 1; i <= 31; i++) {
            const checkDateStr = getFormatDate(new Date(currentDate.getFullYear(), index, i));
            if (workData[checkDateStr]) {
                ['AM', 'PM'].forEach(p => {
                    if (workData[checkDateStr][p]) {
                        Object.values(workData[checkDateStr][p]).forEach(arr => {
                            arr.forEach(t => {
                                monthTaskCount++;
                                if (t.done) monthDoneCount++;
                            });
                        });
                    }
                });
            }
        }

        if (monthTaskCount > 0) {
            const pct = monthDoneCount / monthTaskCount;
            if (pct >= 0.8) card.classList.add('heatmap-high');
            else if (pct >= 0.4) card.classList.add('heatmap-medium');
            else card.classList.add('heatmap-low');
        }

        const p = document.createElement('p');
        p.textContent = monthTaskCount > 0 ? `${monthDoneCount}/${monthTaskCount} task(s)` : 'No tasks';
        card.appendChild(p);

        card.addEventListener('click', () => {
            currentDate.setMonth(index);
            // Switch to Month view
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelector('[data-tab="month-view"]').classList.add('active');

            views.forEach(v => v.classList.remove('active'));
            document.getElementById('month-view').classList.add('active');
            currentView = 'month-view';
            renderMonthView();
        });

        grid.appendChild(card);
    });

    renderYearExpenseChart();
}

function renderYearExpenseChart() {
    const container = document.getElementById('year-expense-chart');
    if (!container) return;
    container.innerHTML = '';

    const year = currentDate.getFullYear();
    const dailyBudget = parseFloat(localStorage.getItem('WorkflowBudget')) || 500;
    const monthlyMax = dailyBudget * 31; // Conservative reference
    
    let maxAmount = 100; // Min scale
    const monthTotals = [];

    for (let m = 0; m < 12; m++) {
        let monthTotal = 0;
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = getFormatDate(new Date(year, m, i));
            const dayData = workData[dateStr] || {};
            monthTotal += (dayData.expenses || []).reduce((sum, item) => sum + item.amount, 0);
            ['AM', 'PM'].forEach(p => {
                if (dayData[p]) {
                    Object.values(dayData[p]).forEach(arr => {
                        arr.forEach(t => { if (t.amount) monthTotal += t.amount; });
                    });
                }
            });
        }
        monthTotals.push({ month: MONTH_NAMES[m].substring(0, 3), amount: monthTotal });
        if (monthTotal > maxAmount) maxAmount = monthTotal;
    }

    if (maxAmount === 0) {
        container.innerHTML = '<div style="width: 100%; text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 2rem;">No expenses recorded this year.</div>';
        return;
    }

    monthTotals.forEach(data => {
        const barGroup = document.createElement('div');
        barGroup.className = 'bar-group';
        
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = data.month;
        
        const track = document.createElement('div');
        track.className = 'bar-track';
        
        const segmentContainer = document.createElement('div');
        segmentContainer.className = 'bar-segment-container';
        
        const width = (data.amount / maxAmount) * 100;

        const blueBar = document.createElement('div');
        blueBar.className = 'bar-horizontal';
        
        setTimeout(() => {
            blueBar.style.width = `${width}%`;
        }, 100);
        
        segmentContainer.appendChild(blueBar);
        track.appendChild(segmentContainer);
        
        const amountMsg = document.createElement('div');
        amountMsg.className = 'bar-amount';
        amountMsg.textContent = data.amount > 0 ? `৳${Math.round(data.amount)}` : '৳0';
        
        barGroup.appendChild(label);
        barGroup.appendChild(track);
        barGroup.appendChild(amountMsg);
        container.appendChild(barGroup);
    });
}

// ---------------- THEME TOGGLE ----------------
const themeToggles = document.querySelectorAll('.theme-toggle');
const sunIcons = document.querySelectorAll('.sun-icon');
const moonIcons = document.querySelectorAll('.moon-icon');

let currentTheme = localStorage.getItem('WorkflowTheme') || 'dark';
document.documentElement.setAttribute('data-theme', currentTheme);
updateThemeIcon();

themeToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
        currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        localStorage.setItem('WorkflowTheme', currentTheme);
        updateThemeIcon();
    });
});

function updateThemeIcon() {
    if (currentTheme === 'light') {
        sunIcons.forEach(i => i.style.display = 'block');
        moonIcons.forEach(i => i.style.display = 'none');
    } else {
        sunIcons.forEach(i => i.style.display = 'none');
        moonIcons.forEach(i => i.style.display = 'block');
    }
}

// ---------------- BACKGROUND ANIMATION ----------------
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let cw = canvas.width = window.innerWidth;
let ch = canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    cw = canvas.width = window.innerWidth;
    ch = canvas.height = window.innerHeight;
});

// Particles for Day
const particles = [];
const numParticles = 70;
for (let i = 0; i < numParticles; i++) {
    particles.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 2 + 1
    });
}

// Stars for Night
const stars = [];
const numStars = 150;
for (let i = 0; i < numStars; i++) {
    stars.push({
        x: Math.random() * cw,
        y: Math.random() * ch,
        radius: Math.random() * 1.5 + 0.5,
        alpha: Math.random()
    });
}
let shootingStar = null;

function animateBg() {
    // Clear canvas
    ctx.clearRect(0, 0, cw, ch);

    if (currentTheme === 'light') {
        // --- DAY MODE: Moving Particles Network ---
        ctx.lineWidth = 1.2;

        // Update & draw connection lines first so they are behind dots
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 140) {
                    ctx.strokeStyle = `rgba(79, 70, 229, ${0.5 * (1 - dist / 140)})`; // primary-color based
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }

        // Draw dots
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            // Bounce off edges
            if (p.x < 0 || p.x > cw) p.vx *= -1;
            if (p.y < 0 || p.y > ch) p.vy *= -1;

            ctx.fillStyle = 'rgba(79, 70, 229, 0.7)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * 1.5, 0, Math.PI * 2);
            ctx.fill();
        });

    } else {
        // --- NIGHT MODE: Stars & Shooting Stars ---
        stars.forEach(s => {
            s.y -= 0.1; // slow drift up

            // Wrap around
            if (s.y < 0) {
                s.y = ch;
                s.x = Math.random() * cw;
            }

            // Twinkle effect
            s.alpha += (Math.random() - 0.5) * 0.05;
            if (s.alpha < 0.2) s.alpha = 0.2;
            if (s.alpha > 1) s.alpha = 1;

            ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // Handle Shooting Star
        if (!shootingStar) {
            // Random chance to spawn a new shooting star
            if (Math.random() < 0.005) {
                shootingStar = {
                    x: Math.random() * cw,
                    y: 0,
                    length: Math.random() * 80 + 40, // tail length
                    speed: Math.random() * 5 + 10,
                    opacity: 1
                };
            }
        } else {
            // Draw and update shooting star
            ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.opacity})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(shootingStar.x, shootingStar.y);
            // Draw a diagonal line up & left
            ctx.lineTo(shootingStar.x - shootingStar.length, shootingStar.y + shootingStar.length);
            ctx.stroke();

            // Move it down and right
            shootingStar.x -= shootingStar.speed;
            shootingStar.y += shootingStar.speed;
            shootingStar.opacity -= 0.02; // fade out

            // Reset when invisible
            if (shootingStar.opacity <= 0) {
                shootingStar = null;
            }
        }
    }

    // Loop
    requestAnimationFrame(animateBg);
}

// Start animation loop
animateBg();
