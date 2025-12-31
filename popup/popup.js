/**
 * Webtime Tracker - Popup Script
 * 
 * This is the main UI logic for the Webtime Tracker browser extension.
 * 
 * Features:
 * - Website time tracking with daily/weekly views
 * - Multiple countdown timers with pause/resume
 * - Notes with archiving and markdown support
 * - Daily schedule planner with editable time blocks
 * - Calendar heatmap of browsing activity
 * - Stock watchlist with real-time prices
 * - Portfolio tracker with holdings value calculation
 * 
 * @version 1.0.0
 */

const formatTime = (seconds) => {
    const s = Math.floor(seconds % 60);
    const m = Math.floor((seconds % 3600) / 60);
    const h = Math.floor(seconds / 3600);

    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
};

// Colors for the chart
const COLORS = [
    '#f38ba8', // Red
    '#fab387', // Orange
    '#f9e2af', // Yellow
    '#a6e3a1', // Green
    '#89b4fa', // Blue
    '#cba6f7', // Purple
];

let currentView = 'today'; // 'today' | 'week' | 'all-time'
let dayOffset = 0;  // 0 = today, 1 = yesterday, etc.
let weekOffset = 0; // 0 = this week, 1 = last week, etc.

document.addEventListener('DOMContentLoaded', async () => {
    // Buttons
    const btnToday = document.getElementById('btn-today');
    const btnAllTime = document.getElementById('btn-all-time');
    const dateLabel = document.getElementById('current-date');

    // Timer Elements
    const timerSection = document.getElementById('timer-section');
    const timerDisplay = document.getElementById('timer-display-compact');
    const timerControls = document.getElementById('timer-controls');

    const timerInput = document.getElementById('timer-input');
    const btnStartTimer = document.getElementById('btn-start-timer');
    const btnStopTimer = document.getElementById('btn-stop-timer');
    const timerCountdown = document.getElementById('timer-countdown');
    const chips = document.querySelectorAll('.chip');

    let timerInterval = null;

    btnToday.addEventListener('click', () => {
        if (currentView === 'today') return;
        currentView = 'today';
        updateView();
    });

    const btnWeek = document.getElementById('btn-week');
    btnWeek.addEventListener('click', () => {
        if (currentView === 'week') return;
        currentView = 'week';
        updateView();
    });

    btnAllTime.addEventListener('click', () => {
        if (currentView === 'all-time') return;
        currentView = 'all-time';
        updateView();
    });

    // Timer Logic
    function parseDuration(input) {
        let totalSeconds = 0;
        const hourMatch = input.match(/(\d+)\s*h/);
        const minMatch = input.match(/(\d+)\s*m/);
        const secMatch = input.match(/(\d+)\s*s/);

        // If just a number, treat as minutes
        if (!hourMatch && !minMatch && !secMatch && /^\d+$/.test(input.trim())) {
            return parseInt(input.trim()) * 60;
        }

        if (hourMatch) totalSeconds += parseInt(hourMatch[1]) * 3600;
        if (minMatch) totalSeconds += parseInt(minMatch[1]) * 60;
        if (secMatch) totalSeconds += parseInt(secMatch[1]);

        return totalSeconds;
    }

    function formatCountdown(seconds) {
        if (seconds <= 0) return "00:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        const mStr = m.toString().padStart(2, '0');
        const sStr = s.toString().padStart(2, '0');

        if (h > 0) return `${h}:${mStr}:${sStr}`;
        return `${mStr}:${sStr}`;
    }

    const timerListEl = document.getElementById('timer-list');
    let timerIntervals = {};

    async function syncTimerUI() {
        // Clear all existing intervals
        Object.values(timerIntervals).forEach(id => clearInterval(id));
        timerIntervals = {};

        const timers = await browser.runtime.sendMessage({ action: 'getTimers' });

        if (!timerListEl) return;
        timerListEl.innerHTML = '';

        if (!timers || timers.length === 0) {
            return;
        }

        for (const timer of timers) {
            const el = document.createElement('div');
            el.className = 'timer-item' + (timer.status === 'paused' ? ' paused' : '');
            el.dataset.timerId = timer.id;

            const timeSpan = document.createElement('span');
            timeSpan.className = 'timer-item-time';

            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'timer-item-controls';

            // Pause/Resume button
            const pauseBtn = document.createElement('button');
            pauseBtn.className = 'timer-item-btn';
            pauseBtn.innerHTML = timer.status === 'running' ? '⏸' : '▶';
            pauseBtn.title = timer.status === 'running' ? 'Pause' : 'Resume';
            pauseBtn.addEventListener('click', async () => {
                if (timer.status === 'running') {
                    await browser.runtime.sendMessage({ action: 'pauseTimer', timerId: timer.id });
                } else {
                    await browser.runtime.sendMessage({ action: 'resumeTimer', timerId: timer.id });
                }
                syncTimerUI();
            });

            // Stop button
            const stopBtn = document.createElement('button');
            stopBtn.className = 'timer-item-btn stop';
            stopBtn.innerHTML = '■';
            stopBtn.title = 'Stop';
            stopBtn.addEventListener('click', async () => {
                await browser.runtime.sendMessage({ action: 'stopTimer', timerId: timer.id });
                syncTimerUI();
            });

            controlsDiv.appendChild(pauseBtn);
            controlsDiv.appendChild(stopBtn);
            el.appendChild(timeSpan);
            el.appendChild(controlsDiv);
            timerListEl.appendChild(el);

            // Update time display
            const updateTime = () => {
                let remaining;
                if (timer.status === 'running') {
                    remaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
                    if (remaining <= 0) {
                        syncTimerUI();
                        return;
                    }
                } else {
                    remaining = Math.ceil((timer.remainingOnPause || 0) / 1000);
                }
                timeSpan.textContent = formatCountdown(remaining);
            };

            updateTime();
            if (timer.status === 'running') {
                timerIntervals[timer.id] = setInterval(updateTime, 1000);
            }
        }
    }

    btnStartTimer.addEventListener('click', async () => {
        const val = timerInput.value;
        if (!val) return;
        const seconds = parseDuration(val);
        if (seconds > 0) {
            await browser.runtime.sendMessage({ action: 'startTimer', duration: seconds });
            syncTimerUI();
            timerInput.value = '';
        }
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const val = chip.dataset.time;
            const seconds = parseDuration(val);
            browser.runtime.sendMessage({ action: 'startTimer', duration: seconds }).then(syncTimerUI);
        });
    });

    async function updateView() {
        // Toggle Active Class
        btnToday.classList.remove('active');
        btnWeek.classList.remove('active');
        btnAllTime.classList.remove('active');

        const navPrevBtn = document.getElementById('nav-prev');
        const navNextBtn = document.getElementById('nav-next');

        if (currentView === 'today') {
            btnToday.classList.add('active');
            // Update date label based on offset
            if (dayOffset === 0) {
                dateLabel.textContent = "Today";
            } else if (dayOffset === 1) {
                dateLabel.textContent = "Yesterday";
            } else {
                const d = new Date();
                d.setDate(d.getDate() - dayOffset);
                dateLabel.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            navNextBtn.disabled = (dayOffset === 0);
            navPrevBtn.style.visibility = 'visible';
            navNextBtn.style.visibility = 'visible';
            await renderDailyStats(dayOffset);
        } else if (currentView === 'week') {
            btnWeek.classList.add('active');
            if (weekOffset === 0) {
                dateLabel.textContent = "This Week";
            } else if (weekOffset === 1) {
                dateLabel.textContent = "Last Week";
            } else {
                dateLabel.textContent = `${weekOffset} Weeks Ago`;
            }
            navNextBtn.disabled = (weekOffset === 0);
            navPrevBtn.style.visibility = 'visible';
            navNextBtn.style.visibility = 'visible';
            await renderWeeklyStats(weekOffset);
        } else {
            btnAllTime.classList.add('active');
            dateLabel.textContent = "All Time";
            // Hide nav arrows for All Time view
            navPrevBtn.style.visibility = 'hidden';
            navNextBtn.style.visibility = 'hidden';
            await renderAllTimeStats();
        }
    }

    // Tab Switching Logic
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    // Function to switch to a specific tab
    function switchToTab(tabName) {
        const tab = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (!tab || tab.style.display === 'none') return false;

        // Remove active
        tabs.forEach(t => t.classList.remove('active'));
        contents.forEach(c => c.style.display = 'none');
        contents.forEach(c => c.classList.remove('active'));

        // Set active
        tab.classList.add('active');
        const targetId = `tab-${tabName}`;
        const target = document.getElementById(targetId);
        if (target) {
            target.style.display = 'block';
            target.classList.add('active');
        }
        return true;
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            const tabName = tab.dataset.tab;

            // Remove active
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.style.display = 'none');
            contents.forEach(c => c.classList.remove('active'));

            // Set active
            tab.classList.add('active');
            const targetId = `tab-${tabName}`;
            const target = document.getElementById(targetId);
            if (target) {
                target.style.display = 'block';
                target.classList.add('active');
            }

            // Save last active tab
            await browser.storage.local.set({ lastActiveTab: tabName });
        });
    });

    // Restore last active tab on init
    const lastTabData = await browser.storage.local.get('lastActiveTab');

    // Initialize Notes FIRST (before tab restoration)
    initNotes();

    // Initialize Saved Notes
    initSavedNotes();

    // Initialize Calendar
    initCalendar();

    // Initialize Stocks
    initStocks();

    // Initialize Portfolio
    initPortfolio();

    // NOW restore last active tab (after all content is initialized)
    if (lastTabData.lastActiveTab) {
        switchToTab(lastTabData.lastActiveTab);

        // Trigger render for tabs that need it
        if (lastTabData.lastActiveTab === 'schedule') {
            setTimeout(renderSchedule, 100);
        } else if (lastTabData.lastActiveTab === 'calendar') {
            setTimeout(renderCalendar, 100);
        }
    }

    // Navigation Arrows
    const navPrev = document.getElementById('nav-prev');
    const navNext = document.getElementById('nav-next');

    navPrev.addEventListener('click', () => {
        if (currentView === 'today') {
            dayOffset++;
        } else if (currentView === 'week') {
            weekOffset++;
        }
        updateView();
    });

    navNext.addEventListener('click', () => {
        if (currentView === 'today' && dayOffset > 0) {
            dayOffset--;
        } else if (currentView === 'week' && weekOffset > 0) {
            weekOffset--;
        }
        updateView();
    });

    // Settings functionality
    const settingsBtn = document.getElementById('btn-settings');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const settingsCheckboxes = settingsPanel.querySelectorAll('input[type="checkbox"]');

    settingsBtn.addEventListener('click', () => {
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.style.display = 'none';
    });

    // Load tab settings from storage
    async function loadTabSettings() {
        const data = await browser.storage.local.get('tabSettings');
        const settings = data.tabSettings || {
            tracker: true,
            notes: true,
            calendar: true,
            stocks: true,
            portfolio: true
        };
        return settings;
    }

    // Apply settings to show/hide tabs
    function applyTabSettings(settings) {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            const tabName = btn.dataset.tab;
            if (settings[tabName] === false) {
                btn.style.display = 'none';
            } else {
                btn.style.display = '';
            }
        });

        // Update checkboxes to match
        settingsCheckboxes.forEach(cb => {
            const tabName = cb.dataset.tab;
            cb.checked = settings[tabName] !== false;
        });
    }

    // Save settings when checkbox changes
    settingsCheckboxes.forEach(cb => {
        cb.addEventListener('change', async () => {
            const settings = await loadTabSettings();
            settings[cb.dataset.tab] = cb.checked;
            await browser.storage.local.set({ tabSettings: settings });
            applyTabSettings(settings);

            // If current active tab is now hidden, switch to first visible
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.style.display === 'none') {
                const firstVisible = document.querySelector('.tab-btn:not([style*="display: none"])');
                if (firstVisible) firstVisible.click();
            }
        });
    });

    // Load and apply settings on init
    const tabSettings = await loadTabSettings();
    applyTabSettings(tabSettings);

    // Initialize View
    updateView();
    syncTimerUI();
});

// GLOBAL STATE
// Fixed to Today for simplicity in this revert
const todayStr = new Date().toLocaleDateString('en-CA');

async function renderDailyStats(offset = 0) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - offset);
    const storageKey = `stats_${targetDate.toLocaleDateString('en-CA')}`;
    const data = await browser.storage.local.get(storageKey);
    const dailyStats = data[storageKey] || {};
    renderChart(dailyStats);
}

async function renderAllTimeStats() {
    const data = await browser.storage.local.get(null); // Get everything
    const aggregated = {};

    Object.keys(data).forEach(key => {
        if (key.startsWith('stats_')) {
            const dayStats = data[key];
            Object.entries(dayStats).forEach(([domain, seconds]) => {
                aggregated[domain] = (aggregated[domain] || 0) + seconds;
            });
        }
    });

    renderChart(aggregated);
}

async function renderWeeklyStats(offset = 0) {
    const data = await browser.storage.local.get(null);
    const aggregated = {};

    // Get date keys for 7 days of the target week
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (offset * 7));

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() - i);
        weekDates.push(d.toLocaleDateString('en-CA')); // YYYY-MM-DD
    }

    Object.keys(data).forEach(key => {
        if (key.startsWith('stats_')) {
            const dateStr = key.replace('stats_', '');
            if (weekDates.includes(dateStr)) {
                const dayStats = data[key];
                Object.entries(dayStats).forEach(([domain, seconds]) => {
                    aggregated[domain] = (aggregated[domain] || 0) + seconds;
                });
            }
        }
    });

    renderChart(aggregated);
}


function renderChart(statsMap) {
    // Convert to array and sort
    const items = Object.entries(statsMap)
        .map(([domain, seconds]) => ({ domain, seconds }))
        .filter(item => item.domain !== 'null' && item.domain !== 'undefined')
        .sort((a, b) => b.seconds - a.seconds);

    const totalSeconds = items.reduce((acc, item) => acc + item.seconds, 0);

    // Update Total Time
    const totalTimeEl = document.getElementById('total-time');
    if (totalTimeEl) totalTimeEl.textContent = formatTime(totalSeconds);

    const statsList = document.getElementById('stats-list');
    const svg = document.querySelector('.donut-chart');

    if (!statsList || !svg) return;

    // Clear previous
    statsList.innerHTML = '';
    // Remove existing segments (keep background ring)
    const existingSegments = svg.querySelectorAll('.donut-segment');
    existingSegments.forEach(el => el.remove());

    if (items.length === 0) {
        statsList.innerHTML = '<div style="text-align:center; color: #666; padding: 20px;">No data recorded.</div>';
        return;
    }

    let accumulatedPercent = 0;

    // Limit to top 10 for render
    const displayItems = items.slice(0, 10);

    displayItems.forEach((item, index) => {
        const percent = (item.seconds / totalSeconds) * 100;
        const color = COLORS[index % COLORS.length];

        // 1. Render Pie Segment
        if (totalSeconds > 0) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'donut-segment');
            circle.setAttribute('cx', '18');
            circle.setAttribute('cy', '18');
            circle.setAttribute('r', '15.9155');
            circle.setAttribute('stroke-dasharray', `${percent} ${100 - percent}`);
            circle.setAttribute('stroke-dashoffset', `${-accumulatedPercent}`);
            circle.setAttribute('stroke', color);
            svg.appendChild(circle);
            accumulatedPercent += percent;
        }

        // 2. Render List Item
        const li = document.createElement('div');
        li.className = 'stat-item';

        const faviconUrl = `https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`;

        li.innerHTML = `
            <img src="${faviconUrl}" class="favicon" alt="" onerror="this.style.display='none'">
            <div class="domain-info">
                <div style="display:flex; justify-content:space-between;">
                    <span class="domain-name">${item.domain}</span>
                    <span class="time-text">${formatTime(item.seconds)}</span>
                </div>
                <div class="domain-bar-bg">
                    <div class="domain-bar-fill" style="width: ${percent}%; background-color: ${color}"></div>
                </div>
            </div>
        `;
        statsList.appendChild(li);
    });
}

// ---------------------------------------------------------
// NOTES FEATURE LOGIC
// ---------------------------------------------------------

// Track currently loaded saved note (null = editing daily note)
let currentLoadedNoteId = null;

function initNotes() {
    // Always start with Today's note (reset any previously loaded saved note)
    currentLoadedNoteId = null;
    showNoteButtons(false);

    const editor = document.getElementById('note-editor');
    const archiveList = document.getElementById('notes-archive-list');

    // Tools
    document.querySelectorAll('.tool-btn[data-format]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.execCommand(btn.dataset.format, false, null);
        });
    });

    const fontSelect = document.getElementById('font-select');
    if (fontSelect) {
        fontSelect.addEventListener('change', () => {
            editor.style.fontFamily = fontSelect.value;
        });
    }

    const exportBtn = document.getElementById('btn-export-notes');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            // For export, we might want plain text or HTML. 
            // Let's export InnerText for readability in .txt, 
            // or maybe we should switch to .html?
            // User asked for "notes", usually implies text. 
            // innerText gives line breaks properly.
            const blob = new Blob([editor.innerText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `notes-${todayStr}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    // Auto-Save needs to save to selectedDate (but NOT when a saved note is loaded)
    let debounceTimer;
    editor.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Only auto-save to daily note if we're NOT editing a saved note
            if (!currentLoadedNoteId) {
                saveNote(editor.innerHTML);
            }
        }, 1000);
    });

    loadNotes(editor, archiveList);
}

async function loadNotes(editor, archiveList) {
    const data = await browser.storage.local.get('notes_storage');
    const notesStorage = data.notes_storage || {};

    // Load Today
    if (notesStorage[todayStr]) {
        editor.innerHTML = notesStorage[todayStr];
    } else {
        editor.innerHTML = '';
    }

    // Load Archives
    const dates = Object.keys(notesStorage)
        .filter(d => d !== todayStr)
        .sort((a, b) => new Date(b) - new Date(a));

    if (archiveList) {
        archiveList.innerHTML = '';
        if (dates.length === 0) {
            archiveList.innerHTML = '<div style="text-align:center; color:#666; padding:10px;">No other notes.</div>';
        } else {
            dates.forEach(date => {
                const content = notesStorage[date];
                if (!content.trim()) return;
                const item = document.createElement('div');
                item.className = 'archive-item';
                item.innerHTML = `
                    <div class="archive-header">
                        <span>${date}</span>
                        <button class="icon-btn" style="width:auto; height:auto; padding:0 4px; font-size:10px;" onclick="navigator.clipboard.writeText(this.dataset.copy)">Copy</button>
                    </div>
                    <div class="archive-preview">${content.substring(0, 150)}...</div>
                 `;
                const btn = item.querySelector('button');
                btn.dataset.copy = content;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(content);
                    btn.textContent = "Copied!";
                    setTimeout(() => btn.textContent = "Copy", 2000);
                });
                archiveList.appendChild(item);
            });
        }
    }
}

async function saveNote(content) {
    const data = await browser.storage.local.get('notes_storage');
    const notesStorage = data.notes_storage || {};

    notesStorage[todayStr] = content;

    await browser.storage.local.set({ notes_storage: notesStorage });
}

// ---------------------------------------------------------
// SAVED/PINNED NOTES FEATURE
// ---------------------------------------------------------

async function getSavedNotes() {
    const data = await browser.storage.local.get('saved_notes');
    return data.saved_notes || [];
}

async function saveSavedNotes(notes) {
    await browser.storage.local.set({ saved_notes: notes });
}

async function saveNoteAs(name, content) {
    const notes = await getSavedNotes();
    const newNote = {
        id: Date.now(),
        name: name,
        content: content,
        pinned: false,
        created: new Date().toLocaleDateString('en-CA')
    };
    notes.unshift(newNote); // Add to beginning
    await saveSavedNotes(notes);
    renderSavedNotes();
}

function showNoteButtons(show) {
    const updateBtn = document.getElementById('btn-update-note');
    const deleteBtn = document.getElementById('btn-delete-note');
    if (updateBtn) updateBtn.classList.toggle('hidden', !show);
    if (deleteBtn) deleteBtn.classList.toggle('hidden', !show);
}

async function loadSavedNote(id) {
    const notes = await getSavedNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
        const editor = document.getElementById('note-editor');
        if (editor) {
            editor.innerHTML = note.content;
        }
        currentLoadedNoteId = id;
        showNoteButtons(true);
    }
}

async function updateCurrentNote() {
    if (!currentLoadedNoteId) return;

    const editor = document.getElementById('note-editor');
    const content = editor ? editor.innerHTML : '';

    const notes = await getSavedNotes();
    const note = notes.find(n => n.id === currentLoadedNoteId);
    if (note) {
        note.content = content;
        await saveSavedNotes(notes);
        alert('Note updated!');
    }
}

async function deleteCurrentNote() {
    if (!currentLoadedNoteId) return;

    if (confirm('Delete this saved note?')) {
        await deleteSavedNote(currentLoadedNoteId);
        currentLoadedNoteId = null;
        showNoteButtons(false);
        document.getElementById('note-editor').innerHTML = '';
    }
}

async function deleteSavedNote(id) {
    let notes = await getSavedNotes();
    notes = notes.filter(n => n.id !== id);
    await saveSavedNotes(notes);
    renderSavedNotes();
}

async function togglePinNote(id) {
    const notes = await getSavedNotes();
    const note = notes.find(n => n.id === id);
    if (note) {
        note.pinned = !note.pinned;
        // Sort: pinned first, then by id (newest first)
        notes.sort((a, b) => {
            if (a.pinned !== b.pinned) return b.pinned - a.pinned;
            return b.id - a.id;
        });
        await saveSavedNotes(notes);
        renderSavedNotes();
    }
}

async function renderSavedNotes() {
    const select = document.getElementById('saved-notes-select');
    if (!select) return;

    const notes = await getSavedNotes();

    // Clear and rebuild options
    select.innerHTML = '<option value="">📌 Saved Notes</option>';

    // Add "Today" option to go back to daily note
    const todayOption = document.createElement('option');
    todayOption.value = 'today';
    todayOption.textContent = '📅 Today\'s Note';
    select.appendChild(todayOption);

    // Add separator if there are saved notes
    if (notes.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        select.appendChild(separator);
    }

    notes.forEach(note => {
        const option = document.createElement('option');
        option.value = note.id;
        option.textContent = (note.pinned ? '📌 ' : '') + note.name;
        select.appendChild(option);
    });
}

// Initialize saved notes UI
function initSavedNotes() {
    const saveAsBtn = document.getElementById('btn-save-note-as');
    const updateBtn = document.getElementById('btn-update-note');
    const deleteBtn = document.getElementById('btn-delete-note');
    const select = document.getElementById('saved-notes-select');

    // Save As Action
    if (saveAsBtn) {
        saveAsBtn.addEventListener('click', async () => {
            const editor = document.getElementById('note-editor');
            const content = editor ? editor.innerHTML : '';

            if (!content.trim()) {
                alert('Note is empty!');
                return;
            }

            const name = prompt('Enter a name for this note:');
            if (name && name.trim()) {
                await saveNoteAs(name.trim(), content);
            }
        });
    }

    // Update current note
    if (updateBtn) {
        updateBtn.addEventListener('click', updateCurrentNote);
    }

    // Delete current note
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteCurrentNote);
    }

    // Load note when selected from dropdown
    if (select) {
        select.addEventListener('change', async () => {
            const value = select.value;

            if (!value) return;

            // Check if editor has content and confirm before replacing
            const editor = document.getElementById('note-editor');
            if (editor && editor.innerHTML.trim()) {
                if (!confirm('This will replace the current editor content. Continue?')) {
                    select.value = ''; // Reset
                    return;
                }
            }

            if (value === 'today') {
                // Load today's daily note
                const todayStr = new Date().toLocaleDateString('en-CA');
                const data = await browser.storage.local.get('notes');
                const notesStorage = data.notes || {};
                if (editor) {
                    editor.innerHTML = notesStorage[todayStr] || '';
                }
                currentLoadedNoteId = null;
                showNoteButtons(false);
            } else {
                const id = parseInt(value);
                if (id) {
                    await loadSavedNote(id);
                }
            }

            select.value = ''; // Reset to placeholder
        });
    }

    // Initial render
    renderSavedNotes();
}

// ---------------------------------------------------------
// CALENDAR FEATURE LOGIC
// ---------------------------------------------------------

let selectedDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
let calendarViewDate = new Date();

function initCalendar() {
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    const calendarTabBtn = document.querySelector('.tab-btn[data-tab="calendar"]');

    // Render when tab is clicked
    if (calendarTabBtn) {
        calendarTabBtn.addEventListener('click', () => {
            renderCalendar();
        });
    }

    // Navigation
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
            renderCalendar();
        });
    }
}

async function renderCalendar() {
    const monthLabel = document.getElementById('cal-month-year');
    const grid = document.getElementById('calendar-grid');

    if (!grid) return;

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    // Update header
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    if (monthLabel) monthLabel.textContent = `${monthNames[month]} ${year}`;

    // Get Data Presence (for dots)
    const storageKeys = await browser.storage.local.get(null);
    const presentDates = new Set();
    Object.keys(storageKeys).forEach(k => {
        if (k.startsWith('stats_')) presentDates.add(k.replace('stats_', ''));
    });
    const notesData = (storageKeys.notes_storage || {});
    Object.keys(notesData).forEach(d => presentDates.add(d));

    grid.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty slots for alignment
    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-day empty';
        grid.appendChild(div);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const dateStr = d.toLocaleDateString('en-CA'); // YYYY-MM-DD

        const el = document.createElement('div');
        el.className = 'calendar-day';
        el.textContent = day;

        if (dateStr === selectedDate) el.classList.add('active');
        if (presentDates.has(dateStr)) el.classList.add('has-data');

        el.addEventListener('click', () => {
            selectDate(dateStr);
        });

        grid.appendChild(el);
    }
}

function selectDate(dateStr) {
    selectedDate = dateStr;

    // Update header label
    const dateLabel = document.getElementById('current-date');
    const today = new Date().toLocaleDateString('en-CA');

    if (dateStr === today) {
        if (dateLabel) dateLabel.textContent = "Today";
    } else {
        const dateObj = new Date(dateStr + "T00:00:00");
        const visual = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        if (dateLabel) dateLabel.textContent = visual;
    }

    // Switch to Tracker Tab to show stats
    const trackerBtn = document.querySelector('.tab-btn[data-tab="tracker"]');
    if (trackerBtn) trackerBtn.click();

    // Reload stats for selected date
    renderStatsForDate(dateStr);

    // Reload notes for selected date
    reloadNotesForDate(dateStr);
}

async function renderStatsForDate(dateStr) {
    const storageKey = `stats_${dateStr}`;
    const data = await browser.storage.local.get(storageKey);
    const dailyStats = data[storageKey] || {};
    renderChart(dailyStats);
}

async function reloadNotesForDate(dateStr) {
    const editor = document.getElementById('note-editor');
    const archiveList = document.getElementById('notes-archive-list');

    const data = await browser.storage.local.get('notes_storage');
    const notesStorage = data.notes_storage || {};

    // Load note for selected date
    if (notesStorage[dateStr]) {
        editor.innerHTML = notesStorage[dateStr];
    } else {
        editor.innerHTML = '';
    }

    // Load Archives (excluding selected date)
    const dates = Object.keys(notesStorage)
        .filter(d => d !== dateStr)
        .sort((a, b) => new Date(b) - new Date(a));

    if (archiveList) {
        archiveList.innerHTML = '';
        if (dates.length === 0) {
            archiveList.innerHTML = '<div style="text-align:center; color:#666; padding:10px;">No other notes.</div>';
        } else {
            dates.forEach(date => {
                const content = notesStorage[date];
                if (!content.trim()) return;
                const item = document.createElement('div');
                item.className = 'archive-item';
                item.innerHTML = `
                    <div class="archive-header">
                        <span>${date}</span>
                        <button class="icon-btn" style="width:auto; height:auto; padding:0 4px; font-size:10px;">Copy</button>
                    </div>
                    <div class="archive-preview">${content.substring(0, 150)}...</div>
                 `;
                const btn = item.querySelector('button');
                btn.dataset.copy = content;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(content);
                    btn.textContent = "Copied!";
                    setTimeout(() => btn.textContent = "Copy", 2000);
                });
                item.addEventListener('click', () => {
                    selectDate(date);
                });
                archiveList.appendChild(item);
            });
        }
    }
}


// ---------------------------------------------------------
// STOCKS FEATURE LOGIC
// ---------------------------------------------------------

async function initStocks() {
    const addBtn = document.getElementById('btn-add-stock');
    const input = document.getElementById('stock-input');

    if (addBtn && input) {
        addBtn.addEventListener('click', () => addStock(input.value));
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addStock(input.value);
        });
    }

    // Initial render
    renderStocks();
}

async function getSavedStocks() {
    const data = await browser.storage.local.get('stocks_list');
    return data.stocks_list || [];
}

async function addStock(symbol) {
    const input = document.getElementById('stock-input');
    const errorMsg = document.getElementById('stock-error');
    symbol = symbol.toUpperCase().trim();

    if (!symbol) return;

    // Check duplicate
    const current = await getSavedStocks();
    if (current.includes(symbol)) {
        input.value = '';
        return;
    }

    addBtnLoading(true);
    if (errorMsg) errorMsg.style.display = 'none';

    try {
        const data = await fetchStockData(symbol);
        if (data) {
            const newList = [...current, symbol];
            await browser.storage.local.set({ stocks_list: newList });
            input.value = '';
            renderStocks();
        } else {
            throw new Error("Invalid Symbol");
        }
    } catch (e) {
        if (errorMsg) {
            errorMsg.textContent = "Invalid symbol";
            errorMsg.style.display = 'block';
            setTimeout(() => errorMsg.style.display = 'none', 3000);
        }
    } finally {
        addBtnLoading(false);
    }
}

async function removeStock(symbol) {
    const current = await getSavedStocks();
    const newList = current.filter(s => s !== symbol);
    await browser.storage.local.set({ stocks_list: newList });
    renderStocks();
}

function addBtnLoading(isLoading) {
    const btn = document.getElementById('btn-add-stock');
    if (btn) {
        btn.textContent = isLoading ? "..." : "Add";
        btn.disabled = isLoading;
    }
}

// Refresh handlers
document.getElementById('btn-refresh-stocks')?.addEventListener('click', async function () {
    this.classList.add('spinning');
    await renderStocks();
    this.classList.remove('spinning');
});

document.getElementById('btn-refresh-portfolio')?.addEventListener('click', async function () {
    this.classList.add('spinning');
    await renderPortfolio();
    this.classList.remove('spinning');
});

async function fetchStockData(symbol) {
    try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
        if (!response.ok) return null;

        const json = await response.json();
        if (!json.chart || !json.chart.result) return null;

        const result = json.chart.result[0];
        const meta = result.meta;

        return {
            symbol: meta.symbol,
            price: meta.regularMarketPrice,
            change: meta.regularMarketPrice - meta.chartPreviousClose,
            changePercent: (meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose * 100
        };
    } catch (e) {
        console.error("Stock fetch error", e);
        return null;
    }
}

async function renderStocks() {
    const list = document.getElementById('stock-list');
    if (!list) return;

    list.innerHTML = '';
    const symbols = await getSavedStocks();

    if (symbols.length === 0) {
        // Span grid to full width if empty message
        list.style.display = 'block';
        list.innerHTML = '<div style="text-align:center; color:#666; font-size:11px; margin-top:10px;">No stocks tracked.</div>';
        return;
    }
    list.style.display = 'grid'; // Restore grid

    for (const sym of symbols) {
        const data = await fetchStockData(sym);
        if (!data) {
            const el = document.createElement('div');
            el.className = 'stock-item';
            el.innerHTML = `
                <div class="stock-header">
                    <span class="stock-symbol">${sym}</span>
                </div>
                <div class="stock-price" style="color:var(--red); font-size:12px;">Error</div>
                <button class="stock-delete-btn">×</button>
            `;
            el.querySelector('.stock-delete-btn').addEventListener('click', () => removeStock(sym));
            list.appendChild(el);
            continue;
        }

        const isUp = data.change >= 0;
        const colorClass = isUp ? 'stock-up' : 'stock-down';
        const sign = isUp ? '+' : '';

        const el = document.createElement('div');
        el.className = 'stock-item';
        el.innerHTML = `
            <div class="stock-header">
                <span class="stock-symbol">${data.symbol}</span>
            </div>
            <div class="stock-price">${data.price.toFixed(2)}</div>
            <div class="stock-change ${colorClass}">
                ${sign}${data.changePercent.toFixed(2)}%
            </div>
            <button class="stock-delete-btn">×</button>
        `;

        el.querySelector('.stock-delete-btn').addEventListener('click', () => removeStock(sym));
        list.appendChild(el);
    }
}


// ---------------------------------------------------------
// PORTFOLIO FEATURE LOGIC
// ---------------------------------------------------------

async function initPortfolio() {
    const addBtn = document.getElementById('btn-add-holding');
    const symbolInput = document.getElementById('portfolio-symbol');
    const qtyInput = document.getElementById('portfolio-quantity');
    const cashBtn = document.getElementById('btn-set-cash');
    const cashInput = document.getElementById('portfolio-cash');

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const symbol = symbolInput.value.toUpperCase().trim();
            const qty = parseFloat(qtyInput.value);
            if (symbol && qty > 0) {
                await addHolding(symbol, qty);
                symbolInput.value = '';
                qtyInput.value = '';
            }
        });
    }

    if (cashBtn) {
        cashBtn.addEventListener('click', async () => {
            const cash = parseFloat(cashInput.value) || 0;
            await browser.storage.local.set({ portfolio_cash: cash });
            cashInput.value = '';
            renderPortfolio();
        });
    }

    // Initial render
    renderPortfolio();
}

async function getPortfolioHoldings() {
    const data = await browser.storage.local.get('portfolio_holdings');
    return data.portfolio_holdings || [];
}

async function getPortfolioCash() {
    const data = await browser.storage.local.get('portfolio_cash');
    return data.portfolio_cash || 0;
}

async function addHolding(symbol, quantity) {
    const errorMsg = document.getElementById('portfolio-error');
    if (errorMsg) errorMsg.style.display = 'none';

    // Validate symbol
    const stockData = await fetchStockData(symbol);
    if (!stockData) {
        if (errorMsg) {
            errorMsg.textContent = 'Invalid symbol';
            errorMsg.style.display = 'block';
            setTimeout(() => errorMsg.style.display = 'none', 3000);
        }
        return;
    }

    const holdings = await getPortfolioHoldings();

    // Check if already exists - update quantity instead
    const existing = holdings.find(h => h.symbol === symbol);
    if (existing) {
        existing.quantity += quantity;
    } else {
        holdings.push({ symbol, quantity });
    }

    await browser.storage.local.set({ portfolio_holdings: holdings });
    renderPortfolio();
}

async function removeHolding(symbol) {
    const holdings = await getPortfolioHoldings();
    const newHoldings = holdings.filter(h => h.symbol !== symbol);
    await browser.storage.local.set({ portfolio_holdings: newHoldings });
    renderPortfolio();
}

async function reorderPortfolio(fromIndex, toIndex) {
    const holdings = await getPortfolioHoldings();
    const [moved] = holdings.splice(fromIndex, 1);
    holdings.splice(toIndex, 0, moved);
    await browser.storage.local.set({ portfolio_holdings: holdings });
    renderPortfolio();
}

async function renderPortfolio() {
    const list = document.getElementById('portfolio-list');
    const totalEl = document.getElementById('portfolio-total-value');
    if (!list || !totalEl) return;

    list.innerHTML = '<div style="text-align:center; color:#666; font-size:11px;">Loading...</div>';

    const holdings = await getPortfolioHoldings();
    const cash = await getPortfolioCash();

    list.innerHTML = '';
    let totalValue = 0;

    // Render holdings
    for (let i = 0; i < holdings.length; i++) {
        const holding = holdings[i];
        const stockData = await fetchStockData(holding.symbol);
        const price = stockData ? stockData.price : 0;
        const value = price * holding.quantity;
        totalValue += value;

        const el = document.createElement('div');
        el.className = 'portfolio-item';
        el.draggable = true;
        el.dataset.index = i;
        el.innerHTML = `
            <span class="drag-handle">⠿</span>
            <span class="symbol">${holding.symbol}</span>
            <span class="quantity">× ${holding.quantity}</span>
            <span class="value"${!stockData ? ' style="color:var(--red)"' : ''}>$${value.toFixed(2)}</span>
            <button class="delete-btn">×</button>
        `;
        el.querySelector('.delete-btn').addEventListener('click', () => removeHolding(holding.symbol));

        // Drag events
        el.addEventListener('dragstart', (e) => {
            el.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', i.toString());
        });

        el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
        });

        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        el.addEventListener('drop', async (e) => {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = i;
            if (fromIndex !== toIndex) {
                await reorderPortfolio(fromIndex, toIndex);
            }
        });

        list.appendChild(el);
    }

    // Render cash if > 0
    if (cash > 0) {
        totalValue += cash;
        const cashEl = document.createElement('div');
        cashEl.className = 'portfolio-item portfolio-cash-item';
        cashEl.innerHTML = `
            <span class="symbol">💵 Cash</span>
            <span class="quantity"></span>
            <span class="value">$${cash.toFixed(2)}</span>
            <button class="delete-btn" title="Clear cash">×</button>
        `;
        cashEl.querySelector('.delete-btn').addEventListener('click', async () => {
            await browser.storage.local.set({ portfolio_cash: 0 });
            renderPortfolio();
        });
        list.appendChild(cashEl);
    }

    // Show empty message if nothing
    if (holdings.length === 0 && cash <= 0) {
        list.innerHTML = '<div style="text-align:center; color:#666; font-size:11px; padding:10px;">No holdings. Add stocks or cash above.</div>';
    }

    // Update total
    totalEl.textContent = `$${totalValue.toFixed(2)}`;
}

// ---------------------------------------------------------
// SCHEDULE TAB LOGIC
// ---------------------------------------------------------

const SCHEDULE_COLORS = ['#f38ba8', '#fab387', '#a6e3a1', '#89b4fa', '#cba6f7', '#f9e2af'];
let scheduleColorIndex = 0;
const activityColorCache = {}; // Cache normalized name -> color

// Normalize activity name for smart color matching
// "Leetcode", "leetcode", "leet code", "leet-code" all become "leetcode"
function normalizeActivityName(name) {
    return name.toLowerCase().replace(/[\s\-_]+/g, '');
}

// Get color for activity (cached by normalized name)
function getActivityColor(name) {
    const normalized = normalizeActivityName(name);
    if (!activityColorCache[normalized]) {
        activityColorCache[normalized] = SCHEDULE_COLORS[scheduleColorIndex % SCHEDULE_COLORS.length];
        scheduleColorIndex++;
    }
    return activityColorCache[normalized];
}

async function getScheduleActivities() {
    const data = await browser.storage.local.get('schedule_activities');
    return data.schedule_activities || [];
}

async function saveScheduleActivities(activities) {
    await browser.storage.local.set({ schedule_activities: activities });
}

function formatHour(hour) {
    if (hour === 0) return '12 AM';
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return '12 PM';
    return `${hour - 12} PM`;
}

function timeToHour(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
}

function hourToTimeStr(hour) {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
async function renderSchedule() {
    const grid = document.getElementById('schedule-grid');
    if (!grid) return;

    const activities = await getScheduleActivities();

    if (activities.length === 0) {
        grid.innerHTML = '<div class="schedule-empty">No activities scheduled. Add one above!</div>';
        // Clear summary too
        const summaryContainer = document.getElementById('schedule-summary');
        if (summaryContainer) summaryContainer.innerHTML = '';
        return;
    }

    // Rebuild color cache from existing activities (to ensure consistency)
    activities.forEach(activity => {
        const normalized = normalizeActivityName(activity.name);
        if (!activityColorCache[normalized] && activity.color) {
            activityColorCache[normalized] = activity.color;
        }
    });

    // Sort activities by start time
    activities.sort((a, b) => a.startHour - b.startHour);

    // Check for scheduled timers (array)
    const scheduledData = await browser.storage.local.get('scheduled_timers');
    const scheduledTimers = scheduledData.scheduled_timers || [];
    const scheduledActivityIds = scheduledTimers.map(t => t.activityId);

    // Build compact list of activities (no hour grid, just activity blocks)
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;

    let html = '';
    activities.forEach(activity => {
        const startStr = hourToTimeStr(activity.startHour);
        const endStr = hourToTimeStr(activity.endHour);
        const isScheduled = scheduledActivityIds.includes(activity.id);

        // Only show timer button for future activities (not passed or in progress)
        const isFuture = activity.startHour > currentHour;
        const showTimerBtn = isFuture || isScheduled;

        const timerIcon = isScheduled ? '✓' : '⏱';
        const timerStyle = isScheduled ? 'style="color:var(--green);"' : '';
        const timerTitle = isScheduled ? 'title="Scheduled"' : 'title="Schedule timer for this activity"';
        const timerBtnHtml = showTimerBtn
            ? `<button class="timer-btn" ${timerTitle} ${timerStyle}>${timerIcon}</button>`
            : '';

        html += `
            <div class="schedule-activity-row" data-id="${activity.id}" data-start="${activity.startHour}" data-end="${activity.endHour}">
                <div class="schedule-activity-time">${startStr} - ${endStr}</div>
                <div class="schedule-activity-block" style="background:${activity.color};">
                    <span class="activity-name">${activity.name}</span>
                    ${timerBtnHtml}
                    <button class="delete-btn">×</button>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;

    // Add delete, timer, and double-click edit handlers
    grid.querySelectorAll('.schedule-activity-row').forEach(row => {
        const id = parseInt(row.dataset.id);
        const startHour = parseFloat(row.dataset.start);
        const endHour = parseFloat(row.dataset.end);
        row.querySelector('.delete-btn').addEventListener('click', async () => {
            await deleteScheduleActivity(id);
        });

        // Timer button - schedule timer to start at activity's start time
        const timerBtn = row.querySelector('.timer-btn');
        if (timerBtn) {
            timerBtn.addEventListener('click', async (e) => {
                e.stopPropagation();

                // Calculate duration in minutes for the Tracker timer
                let durationHours = endHour - startHour;
                if (durationHours < 0) durationHours += 24; // Handle overnight
                const durationMinutes = Math.round(durationHours * 60);

                // Calculate delay until start time
                const now = new Date();
                const currentHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
                let delayHours = startHour - currentHour;

                // Handle overnight (if start time is tomorrow)
                if (delayHours < 0) delayHours += 24;

                const delayMs = Math.round(delayHours * 3600 * 1000);

                if (delayMs <= 0 || delayHours > 24) {
                    // Start time already passed or too far away, start now
                    // Switch to Tracker tab and set the timer
                    switchToTab('tracker');
                    const timerInput = document.getElementById('timer-input');
                    if (timerInput) {
                        timerInput.value = `${durationMinutes}m`;
                        // Trigger the timer start
                        document.querySelector('.action-btn')?.click();
                    }
                } else {
                    // Schedule to start at the activity's start time
                    const startTime = new Date(now.getTime() + delayMs);
                    const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    // Add to scheduled timers array (support multiple)
                    const data = await browser.storage.local.get('scheduled_timers');
                    const scheduledTimers = data.scheduled_timers || [];

                    // Remove existing schedule for this activity if any
                    const filtered = scheduledTimers.filter(t => t.activityId !== id);

                    // Add new schedule
                    filtered.push({
                        durationMinutes,
                        startTime: now.getTime() + delayMs,
                        activityName: row.querySelector('.activity-name')?.textContent || 'Activity',
                        activityId: id
                    });

                    await browser.storage.local.set({ scheduled_timers: filtered });

                    // Create alarm with unique name for this activity
                    browser.alarms.create(`scheduledTimer_${id}`, { when: now.getTime() + delayMs });

                    // Visual feedback - change icon to checkmark (persists)
                    timerBtn.textContent = '✓';
                    timerBtn.style.color = 'var(--green)';
                    timerBtn.title = `Scheduled for ${timeStr}`;
                }
            });
        }

        // Double-click to edit
        row.addEventListener('dblclick', async () => {
            const activity = activities.find(a => a.id === id);
            if (!activity) return;

            const startStr = hourToTimeStr(activity.startHour);
            const endStr = hourToTimeStr(activity.endHour);

            row.innerHTML = `
                <div class="schedule-edit-form">
                    <input type="text" class="edit-name" value="${activity.name}" />
                    <input type="time" class="edit-start" value="${startStr}" />
                    <span>to</span>
                    <input type="time" class="edit-end" value="${endStr}" />
                    <button class="save-btn">✓</button>
                    <button class="cancel-btn">✕</button>
                </div>
            `;

            const nameInput = row.querySelector('.edit-name');
            nameInput.focus();
            nameInput.select();

            row.querySelector('.save-btn').addEventListener('click', async () => {
                const newName = row.querySelector('.edit-name').value.trim();
                const newStart = row.querySelector('.edit-start').value;
                const newEnd = row.querySelector('.edit-end').value;

                if (!newName) return;
                // Note: We allow end time <= start time for overnight blocks (e.g., 22:00 to 02:00)

                await updateScheduleActivity(id, newName, newStart, newEnd);
            });

            row.querySelector('.cancel-btn').addEventListener('click', () => {
                renderSchedule();
            });

            // Save on Enter key
            row.querySelectorAll('input').forEach(input => {
                input.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        row.querySelector('.save-btn').click();
                    } else if (e.key === 'Escape') {
                        renderSchedule();
                    }
                });
            });
        });
    });

    // Build time summary
    const summaryContainer = document.getElementById('schedule-summary');
    if (summaryContainer) {
        const timeTotals = {};
        activities.forEach(activity => {
            const normalized = normalizeActivityName(activity.name);
            let duration = activity.endHour - activity.startHour;
            // Handle overnight activities
            if (duration < 0) duration += 24;

            if (!timeTotals[normalized]) {
                timeTotals[normalized] = {
                    name: activity.name, // Keep original name for display
                    color: getActivityColor(activity.name),
                    hours: 0
                };
            }
            timeTotals[normalized].hours += duration;
        });

        // Format time summary
        const summaryHtml = Object.values(timeTotals).map(item => {
            // Convert total hours to hours and minutes, properly handling rollover
            const totalMinutes = Math.round(item.hours * 60);
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            let timeStr = '';
            if (hours > 0) timeStr += `${hours}h `;
            if (mins > 0 || hours === 0) timeStr += `${mins}m`;

            return `<span class="summary-item" style="color:${item.color}; filter: brightness(1.2);">
                <span class="summary-dot" style="background:${item.color};"></span>
                <span>${item.name}:</span>
                <span style="opacity:0.9">${timeStr.trim()}</span>
            </span>`;
        }).join('');

        summaryContainer.innerHTML = summaryHtml || '<span class="summary-empty">No activities</span>';
    }
}

async function addScheduleActivity(name, startTime, endTime) {
    const activities = await getScheduleActivities();
    const newActivity = {
        id: Date.now(),
        name: name,
        startHour: timeToHour(startTime),
        endHour: timeToHour(endTime),
        color: getActivityColor(name) // Smart color matching
    };
    activities.push(newActivity);
    await saveScheduleActivities(activities);
    renderSchedule();
}

async function deleteScheduleActivity(id) {
    let activities = await getScheduleActivities();
    activities = activities.filter(a => a.id !== id);
    await saveScheduleActivities(activities);
    renderSchedule();
}

async function updateScheduleActivity(id, newName, newStart, newEnd) {
    const activities = await getScheduleActivities();
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    activity.name = newName;
    activity.startHour = timeToHour(newStart);
    activity.endHour = timeToHour(newEnd);

    await saveScheduleActivities(activities);

    // Update scheduled timer if this activity was scheduled
    const data = await browser.storage.local.get('scheduled_timers');
    const scheduledTimers = data.scheduled_timers || [];
    const scheduledIndex = scheduledTimers.findIndex(t => t.activityId === id);

    if (scheduledIndex >= 0) {
        // Cancel old alarm
        await browser.alarms.clear(`scheduledTimer_${id}`);

        // Recalculate new timing
        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        const newStartHour = timeToHour(newStart);
        const newEndHour = timeToHour(newEnd);

        let durationHours = newEndHour - newStartHour;
        if (durationHours < 0) durationHours += 24;
        const durationMinutes = Math.round(durationHours * 60);

        let delayHours = newStartHour - currentHour;
        if (delayHours < 0) delayHours += 24;

        if (delayHours > 0 && delayHours < 24) {
            // Update scheduled timer with new times
            scheduledTimers[scheduledIndex] = {
                ...scheduledTimers[scheduledIndex],
                durationMinutes,
                startTime: now.getTime() + (delayHours * 3600 * 1000),
                activityName: newName
            };
            await browser.storage.local.set({ scheduled_timers: scheduledTimers });

            // Create new alarm
            browser.alarms.create(`scheduledTimer_${id}`, { when: now.getTime() + (delayHours * 3600 * 1000) });
        } else {
            // Start time passed, remove scheduled timer
            const remaining = scheduledTimers.filter(t => t.activityId !== id);
            await browser.storage.local.set({ scheduled_timers: remaining });
        }
    }

    renderSchedule();
}

async function moveScheduleActivity(id, newStartHour) {
    const activities = await getScheduleActivities();
    const activity = activities.find(a => a.id === id);
    if (!activity) return;

    const duration = activity.endHour - activity.startHour;
    activity.startHour = newStartHour;
    activity.endHour = newStartHour + duration;

    await saveScheduleActivities(activities);
    renderSchedule();
}

// Initialize Schedule tab
document.getElementById('btn-add-activity')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('schedule-activity-name');
    const startInput = document.getElementById('schedule-start-time');
    const endInput = document.getElementById('schedule-end-time');

    const name = nameInput.value.trim();
    const startTime = startInput.value;
    const endTime = endInput.value;

    if (!name) {
        nameInput.focus();
        return;
    }

    // Note: We allow end time < start time for overnight activities (e.g., 11:45 PM to 12:15 AM)

    await addScheduleActivity(name, startTime, endTime);
    nameInput.value = '';
});

// Render schedule when tab is clicked
document.querySelector('.tab-btn[data-tab="schedule"]')?.addEventListener('click', () => {
    setTimeout(renderSchedule, 100);
});
