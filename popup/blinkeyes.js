/**
 * Blink Eyes Tab Logic
 * Handles eye strain reminders with countdown timer and visual feedback
 */


// ---------------------------------------------------------
// EYEBLINK TAB LOGIC
// ---------------------------------------------------------

async function initEyeBlink() {
    const toggleBtn = document.getElementById('btn-eyeblink-toggle');
    const intervalSlider = document.getElementById('eyeblink-interval');
    const intervalValue = document.getElementById('eyeblink-interval-value');

    // Load saved settings
    const data = await browser.storage.local.get(['eyeblink_settings', 'eyeblink_active']);

    if (data.eyeblink_settings) {
        intervalSlider.value = data.eyeblink_settings.interval || 20;
    }

    // Update slider display
    if (intervalSlider && intervalValue) {
        intervalValue.textContent = intervalSlider.value + ' min';

        intervalSlider.addEventListener('input', () => {
            intervalValue.textContent = intervalSlider.value + ' min';
        });
    }

    updateEyeBlinkUI(data.eyeblink_active);

    // Toggle reminders
    if (toggleBtn) {
        toggleBtn.addEventListener('click', async () => {
            const currentData = await browser.storage.local.get('eyeblink_active');
            const isActive = !currentData.eyeblink_active;

            // Save settings
            const intervalMinutes = parseInt(intervalSlider.value);
            const settings = {
                interval: intervalMinutes
            };
            await browser.storage.local.set({
                eyeblink_settings: settings,
                eyeblink_active: isActive
            });

            if (isActive) {
                // Create recurring alarm
                await browser.alarms.create('eyeblinkReminder', {
                    delayInMinutes: intervalMinutes,
                    periodInMinutes: intervalMinutes
                });
                // Start countdown display
                startEyeBlinkCountdown();
            } else {
                await browser.alarms.clear('eyeblinkReminder');
                // Hide countdown display
                stopEyeBlinkCountdown();
            }

            updateEyeBlinkUI(isActive);
        });
    }

    // Start countdown if already active
    if (data.eyeblink_active) {
        startEyeBlinkCountdown();
    }

    // Test notification button
    const testBtn = document.getElementById('btn-eyeblink-test');
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            testBtn.textContent = '⏳';

            // Send message to background for system notification
            browser.runtime.sendMessage({ type: 'testEyeBlinkNotification' });

            // Show visual toast inside popup
            showEyeBlinkToast();

            // Show success feedback on button
            testBtn.textContent = '✓ Sent!';
            setTimeout(() => testBtn.textContent = '🔔 Test', 2000);
        });
    }
}

// Show a visual toast notification inside the popup
function showEyeBlinkToast() {
    // Remove existing toast if any
    const existingToast = document.querySelector('.eyeblink-toast');
    if (existingToast) existingToast.remove();

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'eyeblink-toast';
    toast.innerHTML = `
        <div class="toast-icon">👁️👁️</div>
        <div class="toast-content">
            <div class="toast-title">Time for an Eye Break!</div>
            <div class="toast-message">Look away for 20 seconds. Focus on something 20 feet away.</div>
        </div>
    `;

    // Add to body
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function updateEyeBlinkUI(isActive) {
    const toggleBtn = document.getElementById('btn-eyeblink-toggle');
    const message = document.getElementById('eyeblink-message');

    if (toggleBtn) {
        toggleBtn.textContent = isActive ? 'Stop Reminders' : 'Start Reminders';
        toggleBtn.classList.toggle('active', isActive);
    }

    if (message) {
        message.textContent = isActive ? 'Reminders Active! 👁️' : 'Rest Your Eyes! 👁️';
    }
}

// ---------------------------------------------------------
// BLINK EYES COUNTDOWN TIMER
// ---------------------------------------------------------

let eyeBlinkCountdownInterval = null;

async function startEyeBlinkCountdown() {
    const countdownDisplay = document.getElementById('eyeblink-next-reminder');
    const timeLeftEl = document.getElementById('eyeblink-time-left');

    if (!countdownDisplay || !timeLeftEl) return;

    // Show the countdown display
    countdownDisplay.style.display = 'flex';

    // Update function
    const updateCountdown = async () => {
        try {
            const alarm = await browser.alarms.get('eyeblinkReminder');
            if (alarm && alarm.scheduledTime) {
                const now = Date.now();
                const remaining = Math.max(0, Math.ceil((alarm.scheduledTime - now) / 1000));

                const minutes = Math.floor(remaining / 60);
                const seconds = remaining % 60;

                timeLeftEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                // Change countdown text color when less than 1 minute
                if (remaining < 60) {
                    timeLeftEl.style.color = '#fab387';
                } else {
                    timeLeftEl.style.color = '#a6e3a1';
                }

                // Calculate urgency level for eye color (0 = normal, 1 = maximum urgency)
                // Start turning red when less than 2 minutes remaining
                const urgencyThreshold = 120; // 2 minutes
                let urgencyLevel = 0;
                if (remaining < urgencyThreshold) {
                    urgencyLevel = 1 - (remaining / urgencyThreshold);
                }

                // Apply urgency to eye visual
                updateEyeUrgency(urgencyLevel);

            } else {
                // Alarm not found, hide display
                countdownDisplay.style.display = 'none';
                resetEyeColor();
                stopEyeBlinkCountdown();
            }
        } catch (e) {
            console.log('Error getting alarm:', e);
        }
    };

    // Initial update
    await updateCountdown();

    // Clear any existing interval
    if (eyeBlinkCountdownInterval) {
        clearInterval(eyeBlinkCountdownInterval);
    }

    // Update every second
    eyeBlinkCountdownInterval = setInterval(updateCountdown, 1000);
}

function stopEyeBlinkCountdown() {
    const countdownDisplay = document.getElementById('eyeblink-next-reminder');

    if (countdownDisplay) {
        countdownDisplay.style.display = 'none';
    }

    if (eyeBlinkCountdownInterval) {
        clearInterval(eyeBlinkCountdownInterval);
        eyeBlinkCountdownInterval = null;
    }

    // Reset eye to normal colors
    resetEyeColor();
}

// ---------------------------------------------------------
// EYE URGENCY VISUAL EFFECTS
// ---------------------------------------------------------

// Update eye visual color based on urgency level (0 = normal, 1 = maximum urgency/red)
function updateEyeUrgency(level) {
    const eyeball = document.querySelector('.eyeball');
    const iris = document.querySelector('.iris');
    const eyelidTop = document.querySelector('.eyelid-top');
    const eyelidBottom = document.querySelector('.eyelid-bottom');
    const eyeVisual = document.querySelector('.eye-visual');

    if (!eyeball || !iris) return;

    // Clamp level between 0 and 1
    level = Math.max(0, Math.min(1, level));

    // Interpolate colors
    // Normal iris: #74c7ec (cyan) -> Red: #f38ba8
    // Normal eyelid: #89b4fa (blue) / #a6e3a1 (green) -> Red: #f38ba8

    const normalIrisR = 116, normalIrisG = 199, normalIrisB = 236;
    const urgentR = 243, urgentG = 139, urgentB = 168;

    const irisR = Math.round(normalIrisR + (urgentR - normalIrisR) * level);
    const irisG = Math.round(normalIrisG + (urgentG - normalIrisG) * level);
    const irisB = Math.round(normalIrisB + (urgentB - normalIrisB) * level);

    // Apply color to iris
    iris.style.background = `linear-gradient(135deg, rgb(${irisR}, ${irisG}, ${irisB}) 0%, rgb(${irisR - 20}, ${irisG - 30}, ${irisB}) 50%, rgb(${irisR + 30}, ${irisG - 50}, ${irisB - 50}) 100%)`;

    // Apply urgency color to eyelids
    const normalEyelidR = 137, normalEyelidG = 180, normalEyelidB = 250;
    const eyelidR = Math.round(normalEyelidR + (urgentR - normalEyelidR) * level);
    const eyelidG = Math.round(normalEyelidG + (urgentG - normalEyelidG) * level);
    const eyelidB = Math.round(normalEyelidB + (urgentB - normalEyelidB) * level);

    if (eyelidTop) {
        eyelidTop.style.background = `linear-gradient(180deg, rgb(${eyelidR}, ${eyelidG}, ${eyelidB}) 0%, rgb(${eyelidR - 10}, ${eyelidG + 20}, ${eyelidB - 80}) 100%)`;
    }
    if (eyelidBottom) {
        eyelidBottom.style.background = `linear-gradient(180deg, rgb(${eyelidR}, ${eyelidG}, ${eyelidB}) 0%, rgb(${eyelidR - 10}, ${eyelidG + 20}, ${eyelidB - 80}) 100%)`;
    }

    // Add red glow to eyeball when urgent
    if (level > 0.5) {
        eyeball.style.boxShadow = `inset 0 0 15px rgba(0, 0, 0, 0.1), 0 4px 20px rgba(243, 139, 168, ${level * 0.5})`;
    } else {
        eyeball.style.boxShadow = '';
    }

    // Add pulsing effect at high urgency
    if (level > 0.8 && eyeVisual) {
        eyeVisual.classList.add('urgent-pulse');
    } else if (eyeVisual) {
        eyeVisual.classList.remove('urgent-pulse');
    }
}

// Reset eye to normal colors
function resetEyeColor() {
    const eyeball = document.querySelector('.eyeball');
    const iris = document.querySelector('.iris');
    const eyelidTop = document.querySelector('.eyelid-top');
    const eyelidBottom = document.querySelector('.eyelid-bottom');
    const eyeVisual = document.querySelector('.eye-visual');

    if (iris) {
        iris.style.background = '';
    }
    if (eyelidTop) {
        eyelidTop.style.background = '';
    }
    if (eyelidBottom) {
        eyelidBottom.style.background = '';
    }
    if (eyeball) {
        eyeball.style.boxShadow = '';
    }
    if (eyeVisual) {
        eyeVisual.classList.remove('urgent-pulse');
    }
}
