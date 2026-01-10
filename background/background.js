/**
 * Background script for Webtime Tracker
 * Handles time tracking, tab switching, and data storage.
 */

// State
let currentDomain = null;
let startTime = Date.now();
const IDLE_DETECTION_INTERVAL = 60; // seconds

/**
 * Get domain from URL.
 * Aggregates subdomains/paths as per requirements (e.g. leetcode.com/problems -> leetcode.com)
 * actually, URL.hostname usually handles www.leetcode.com -> leetcode.com if we parse it right.
 * We'll strip www.
 */
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    if (!['http:', 'https:'].includes(urlObj.protocol)) return null;
    let hostname = urlObj.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Update storage with accumulated time.
 */
// Keep-Alive Logic
// When a timer is running, content scripts will connect to keep this SW alive.
// Keep-Alive Logic
browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    // Cycle the port every ~4.5 mins to reset SW idle timer (290s workaround)
    // 270s = 4m 30s
    setTimeout(() => {
      try {
        port.disconnect();
      } catch (e) { }
    }, 270000);

    port.onDisconnect.addListener(() => { });
  }
});

/**
 * Update storage with accumulated time.
 * Protected by a promise chain to prevent race conditions (get -> set).
 */
let updateChain = Promise.resolve();

function updateTime() {
  updateChain = updateChain.then(async () => {
    const now = Date.now();
    if (currentDomain && currentDomain !== 'null' && currentDomain !== 'undefined') {
      const duration = (now - startTime) / 1000; // in seconds
      if (duration > 0) {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const storageKey = `stats_${today}`;

        const data = await browser.storage.local.get(storageKey);
        const dailyStats = data[storageKey] || {};

        if (!dailyStats[currentDomain]) {
          dailyStats[currentDomain] = 0;
        }
        dailyStats[currentDomain] += duration;

        await browser.storage.local.set({ [storageKey]: dailyStats });
      }
    }
    startTime = now;
    // Persist state for SW restarts
    await browser.storage.local.set({
      trackingState: { currentDomain, startTime }
    });
  }).catch(err => console.error("Update failed", err));

  return updateChain;
}

/**
 * Handle active tab change.
 */
async function handleActiveTabChange(activeInfo) {
  await updateTime();
  const tab = await browser.tabs.get(activeInfo.tabId);
  currentDomain = getDomain(tab.url);
}

/**
 * Handle URL update in active tab.
 */
async function handleTabUpdate(tabId, changeInfo, tab) {
  // Only check if URL changed and it is the active tab
  if (changeInfo.url) {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].id === tabId) {
      await updateTime();
      currentDomain = getDomain(changeInfo.url);
    }
  }
}

/**
 * Handle window focus change.
 */
async function handleWindowFocusChanged(windowId) {
  await updateTime();
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    currentDomain = null; // Browser lost focus
  } else {
    // Regain focus, find active tab
    startTime = Date.now();
    const tabs = await browser.tabs.query({ active: true, windowId });
    if (tabs.length > 0) {
      currentDomain = getDomain(tabs[0].url);
    } else {
      currentDomain = null;
    }
  }
}

/**
 * Handle idle state.
 */
function handleIdleStateChange(newState) {
  if (newState === 'active') {
    // User is back, restart timer.
    // We don't automatically know WHAT they are looking at until we query, 
    // but usually the previous state is valid if they just woke up. 
    // Safest to re-query active tab.
    startTime = Date.now();
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs.length > 0) currentDomain = getDomain(tabs[0].url);
    });
  } else {
    // User went idle/locked. Stop tracking.
    updateTime();
    currentDomain = null;
  }
}


// Listeners
browser.tabs.onActivated.addListener(handleActiveTabChange);
browser.tabs.onUpdated.addListener(handleTabUpdate);
browser.windows.onFocusChanged.addListener(handleWindowFocusChanged);
browser.idle.onStateChanged.addListener(handleIdleStateChange);
browser.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL);

// Timer State - Now supports multiple timers
let timers = [];

// Timer Functions
function generateTimerId() {
  return 'timer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function saveTimers() {
  await browser.storage.local.set({ timers });
}

async function loadTimers() {
  const data = await browser.storage.local.get('timers');
  timers = data.timers || [];
  // Clean up expired timers
  const now = Date.now();
  timers = timers.filter(t => {
    if (t.status === 'running' && t.endTime <= now) {
      return false; // Remove expired
    }
    return true;
  });
  await saveTimers();
}

function getNextEndingTimer() {
  const running = timers.filter(t => t.status === 'running');
  if (running.length === 0) return null;
  return running.reduce((a, b) => a.endTime < b.endTime ? a : b);
}

async function updateBadge() {
  const nextTimer = getNextEndingTimer();

  if (nextTimer) {
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((nextTimer.endTime - now) / 1000));

    if (remaining <= 0) {
      await stopTimer(nextTimer.id, true);
      return;
    }

    let text;
    if (remaining >= 3600) {
      text = Math.ceil(remaining / 3600) + 'h';
    } else if (remaining >= 60) {
      text = Math.ceil(remaining / 60) + 'm';
    } else {
      text = remaining + 's';
    }

    // Show count if multiple timers
    if (timers.length > 1) {
      text = timers.length + '·' + text;
    }

    browser.action.setBadgeText({ text });
    browser.action.setBadgeBackgroundColor({ color: '#f38ba8' });
  } else {
    // Check for paused timers
    const paused = timers.filter(t => t.status === 'paused');
    if (paused.length > 0) {
      browser.action.setBadgeText({ text: '⏸' + paused.length });
      browser.action.setBadgeBackgroundColor({ color: '#fab387' });
    } else {
      browser.action.setBadgeText({ text: '' });
    }
  }
}

async function startTimer(durationSeconds) {
  const now = Date.now();
  const newTimer = {
    id: generateTimerId(),
    status: 'running',
    endTime: now + (durationSeconds * 1000),
    duration: durationSeconds,
    originalDuration: durationSeconds
  };

  timers.push(newTimer);
  await saveTimers();
  updateBadge();

  // Create alarm for this specific timer
  browser.alarms.create(`timerEnd_${newTimer.id}`, { when: newTimer.endTime });

  // Ensure update alarm is running
  browser.alarms.create('timerUpdate', { periodInMinutes: 0.1 });

  return newTimer;
}

async function stopTimer(timerId, finished = false) {
  const timerIndex = timers.findIndex(t => t.id === timerId);
  if (timerIndex === -1) return;

  const timer = timers[timerIndex];
  timers.splice(timerIndex, 1);

  await saveTimers();
  browser.alarms.clear(`timerEnd_${timerId}`);

  // Clear update alarm if no more timers
  if (timers.length === 0) {
    browser.alarms.clear('timerUpdate');
  }

  updateBadge();

  if (finished) {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'Timer Done!',
      message: `Your ${formatDuration(timer.originalDuration)} timer is up.`
    });
    playAlarmSound();
  }
}

function formatDuration(seconds) {
  if (seconds >= 3600) return Math.round(seconds / 3600) + 'h';
  if (seconds >= 60) return Math.round(seconds / 60) + 'm';
  return seconds + 's';
}

async function pauseTimer(timerId) {
  const timer = timers.find(t => t.id === timerId);
  if (!timer || timer.status !== 'running') return timers;

  const now = Date.now();
  timer.remainingOnPause = Math.max(0, timer.endTime - now);
  timer.status = 'paused';
  timer.endTime = null;

  await saveTimers();
  browser.alarms.clear(`timerEnd_${timerId}`);
  updateBadge();

  return timers;
}

async function resumeTimer(timerId) {
  const timer = timers.find(t => t.id === timerId);
  if (!timer || timer.status !== 'paused') return timers;

  const now = Date.now();
  timer.status = 'running';
  timer.endTime = now + (timer.remainingOnPause || 0);
  timer.remainingOnPause = 0;

  await saveTimers();
  browser.alarms.create(`timerEnd_${timer.id}`, { when: timer.endTime });
  browser.alarms.create('timerUpdate', { periodInMinutes: 0.1 });
  updateBadge();

  return timers;
}

function playAlarmSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'square';
    oscillator.frequency.value = 880;

    gainNode.gain.setValueAtTime(0, now);

    for (let i = 0; i < 4; i++) {
      const start = now + (i * 1.2);
      gainNode.gain.setValueAtTime(0.3, start);
      gainNode.gain.setValueAtTime(0, start + 0.1);
      gainNode.gain.setValueAtTime(0.3, start + 0.2);
      gainNode.gain.setValueAtTime(0, start + 0.3);
      gainNode.gain.setValueAtTime(0.3, start + 0.4);
      gainNode.gain.setValueAtTime(0, start + 0.5);
    }

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(now);
    oscillator.stop(now + 5);

  } catch (e) {
    console.error("Audio play failed", e);
  }
}

// Listen for messages from popup
browser.runtime.onMessage.addListener(async (message) => {
  if (message.action === 'getTimers') {
    return timers;
  } else if (message.action === 'startTimer') {
    const newTimer = await startTimer(message.duration);
    return { timers, newTimer };
  } else if (message.action === 'stopTimer') {
    await stopTimer(message.timerId);
    return timers;
  } else if (message.action === 'pauseTimer') {
    await pauseTimer(message.timerId);
    return timers;
  } else if (message.action === 'resumeTimer') {
    await resumeTimer(message.timerId);
    return timers;
  }
  // Legacy support
  if (message.action === 'getTimer') {
    return timers.length > 0 ? timers[0] : { status: 'stopped' };
  }
});

// Force Save on Suspend
browser.runtime.onSuspend.addListener(() => {
  // We can't await here reliably, but we can try to fire-and-forget
  // or rely on the sync updateTime if possible. 
  // updateTime is async. 
  // Best effort:
  const now = Date.now();
  if (currentDomain) {
    // Just save state synchronously-ish if possible or trigger async
    browser.storage.local.set({
      trackingState: { currentDomain, startTime: now }
    });
  }
});

// Initialize
(async () => {

  // 1. Restore Timers
  await loadTimers();

  // Set up alarms for running timers
  for (const timer of timers) {
    if (timer.status === 'running' && timer.endTime > Date.now()) {
      browser.alarms.create(`timerEnd_${timer.id}`, { when: timer.endTime });
    }
  }

  if (timers.some(t => t.status === 'running')) {
    browser.alarms.create('timerUpdate', { periodInMinutes: 0.1 });
    updateBadge();
  }

  // 2. Restore Tracking State
  const data = await browser.storage.local.get('trackingState');
  if (data.trackingState) {
    const restoredStartTime = data.trackingState.startTime;
    const now = Date.now();
    const MAX_STALE_MS = 5 * 60 * 1000;

    if (now - restoredStartTime > MAX_STALE_MS) {
      currentDomain = null;
      startTime = now;
    } else {
      currentDomain = data.trackingState.currentDomain;
      startTime = restoredStartTime;
    }
  }

  // 3. Re-verify active tab
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    const tab = tabs[0];
    const dom = getDomain(tab.url);
    if (dom !== currentDomain) {
      currentDomain = dom;
      startTime = Date.now();
    }
  } else {
    currentDomain = null;
  }

  // Create heartbeat alarm
  browser.alarms.create('heartbeat', { periodInMinutes: 0.25 });

  // Note: Schedule timer auto-start removed - user prefers manual control via UI
})();

// Handle alarms
browser.alarms.onAlarm.addListener(async (alarm) => {
  // Handle timer-specific end alarms
  if (alarm.name.startsWith('timerEnd_')) {
    const timerId = alarm.name.replace('timerEnd_', '');
    await stopTimer(timerId, true);
  } else if (alarm.name === 'timerUpdate') {
    updateBadge();
  } else if (alarm.name === 'heartbeat') {
    try {
      const focusedWindow = await browser.windows.getCurrent();
      if (!focusedWindow || !focusedWindow.focused) {
        await updateTime();
        currentDomain = null;
        return;
      }
    } catch (e) {
      return;
    }
    await updateTime();
  } else if (alarm.name.startsWith('scheduledTimer_')) {
    // Handle scheduled timer from Schedule tab
    const activityId = parseInt(alarm.name.replace('scheduledTimer_', ''));
    const data = await browser.storage.local.get('scheduled_timers');
    const scheduledTimers = data.scheduled_timers || [];

    const timer = scheduledTimers.find(t => t.activityId === activityId);
    if (timer) {
      const { durationMinutes, activityName } = timer;
      const durationSeconds = durationMinutes * 60;

      // Start the timer
      await startTimer(durationSeconds);

      // Notify user
      browser.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'Scheduled Timer Started',
        message: `Timer started for "${activityName}" (${durationMinutes}m)`
      });

      // Remove this timer from the array
      const remaining = scheduledTimers.filter(t => t.activityId !== activityId);
      await browser.storage.local.set({ scheduled_timers: remaining });
    }
  } else if (alarm.name === 'hydrateReminder') {
    // Handle hydrate reminder
    const data = await browser.storage.local.get(['hydrate_settings', 'hydrate_active']);

    if (!data.hydrate_active) return;

    const settings = data.hydrate_settings || {};
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Parse start and end times
    const [startH, startM] = (settings.start || '09:00').split(':').map(Number);
    const [endH, endM] = (settings.end || '18:00').split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Only notify if within time window
    if (currentTime >= startMinutes && currentTime <= endMinutes) {
      browser.notifications.create('hydrateNotification', {
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: '💧 Time to Hydrate!',
        message: 'Take a moment to drink some water. Stay healthy!'
      });
    }
  }
});

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'testHydrateNotification') {
    const iconUrl = browser.runtime.getURL('icons/icon-48.png');
    browser.notifications.create('hydrateTest_' + Date.now(), {
      type: 'basic',
      iconUrl: iconUrl,
      title: '💧 Time to Hydrate!',
      message: 'Take a moment to drink some water. Stay healthy!'
    }).then((notificationId) => {
      console.log('Notification created:', notificationId);
      sendResponse({ success: true, id: notificationId });
    }).catch((err) => {
      console.error('Notification error:', err);
      sendResponse({ success: false, error: String(err) });
    });
    return true; // Keep message channel open for async response
  }
});
