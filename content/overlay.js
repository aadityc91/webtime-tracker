let overlay = null;
let timerInterval = null;
let currentTimerId = null;

// Get the soonest ending running timer
function getSoonestTimer(timers) {
    if (!timers || timers.length === 0) return null;
    const running = timers.filter(t => t.status === 'running');
    if (running.length === 0) {
        // Check for paused timers
        const paused = timers.filter(t => t.status === 'paused');
        return paused.length > 0 ? paused[0] : null;
    }
    return running.reduce((a, b) => a.endTime < b.endTime ? a : b);
}

// Initialize
(async () => {
    const data = await browser.storage.local.get('timers');
    const timer = getSoonestTimer(data.timers);

    if (timer && timer.status === 'running') {
        currentTimerId = timer.id;
        createOverlay();
        startTicker(timer.endTime);
    } else if (timer && timer.status === 'paused') {
        currentTimerId = timer.id;
        createOverlay();
        showPausedState(timer.remainingOnPause);
    }
})();

// Global Keep-Alive
let globalPort;
function connectKeepAlive() {
    try {
        globalPort = browser.runtime.connect({ name: 'keepAlive' });
        globalPort.onDisconnect.addListener(connectKeepAlive);
        globalPort.onMessage.addListener((msg) => { });
    } catch (e) { }
}
connectKeepAlive();

// Listen for state changes
browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.timers) {
        const timers = changes.timers.newValue || [];
        const timer = getSoonestTimer(timers);

        if (timer && timer.status === 'running') {
            currentTimerId = timer.id;
            createOverlay();
            startTicker(timer.endTime);
        } else if (timer && timer.status === 'paused') {
            currentTimerId = timer.id;
            createOverlay();
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            showPausedState(timer.remainingOnPause);
        } else {
            removeOverlay();
        }
    }
});

function showPausedState(remainingMs) {
    const remaining = Math.ceil((remainingMs || 0) / 1000);
    if (overlay) {
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        const mStr = m.toString().padStart(2, '0');
        const sStr = s.toString().padStart(2, '0');
        if (h > 0) {
            overlay.textContent = `⏸ ${h}:${mStr}:${sStr}`;
        } else {
            overlay.textContent = `⏸ ${mStr}:${sStr}`;
        }
        overlay.style.color = '#fab387';
    }
}

function createOverlay() {
    if (document.getElementById('webtime-tracker-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'webtime-tracker-overlay';
    document.body.appendChild(overlay);
}

function removeOverlay() {
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    currentTimerId = null;
}

function startTicker(endTime) {
    if (timerInterval) clearInterval(timerInterval);

    const tick = () => {
        if (!overlay || !endTime) {
            clearInterval(timerInterval);
            return;
        }

        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));

        if (remaining <= 0) {
            overlay.textContent = "00:00";
            overlay.classList.add('urgent');
            return;
        }

        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;

        const mStr = m.toString().padStart(2, '0');
        const sStr = s.toString().padStart(2, '0');

        if (h > 0) {
            overlay.textContent = `${h}:${mStr}:${sStr}`;
        } else {
            overlay.textContent = `${mStr}:${sStr}`;
        }

        // Reset color for running state
        overlay.style.color = '#cdd6f4';

        if (remaining < 60) {
            overlay.style.color = '#fab387';
        }
        if (remaining < 10) {
            overlay.style.color = '#f38ba8';
        }
    };

    tick();
    timerInterval = setInterval(tick, 1000);
}
