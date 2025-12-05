// Helper function for logging
function log(message, type = 'info') {
    const logOutput = document.getElementById('logOutput');
    // Check if the user is at the bottom before adding new content
    const isScrolledToBottom = logOutput.scrollHeight - logOutput.scrollTop <= logOutput.clientHeight + 1; // +1 for a small buffer

    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (type === 'error') {
        p.className = 'text-red-400';
    } else if (type === 'success') {
        p.className = 'text-green-400';
    } else if (type === 'warn') {
        p.className = 'text-yellow-400';
    } else {
        p.className = 'text-blue-400';
    }
    logOutput.append(p); // Add to bottom

    // If user was at the bottom, scroll to the new bottom to see the new message
    if (isScrolledToBottom) {
        logOutput.scrollTop = logOutput.scrollHeight; // Scroll to the very bottom
    }
}

// UI Element References
const deviceNameInput = document.getElementById('deviceName');
const serviceUuidInput = document.getElementById('serviceUuid');
const testIntervalInput = document.getElementById('testInterval');
const connectionDurationInput = document.getElementById('connectionDuration');
const connectionTimeoutInput = document.getElementById('connectionTimeout');
const testRoundsInput = document.getElementById('testRounds');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const restoreDefaultsButton = document.getElementById('restoreDefaultsButton');
const summaryTotalRounds = document.getElementById('summaryTotalRounds');
const summarySuccesses = document.getElementById('summarySuccesses');
const summaryFailures = document.getElementById('summaryFailures');
const summaryStatus = document.getElementById('summaryStatus');
const circularProgressBarContainer = document.getElementById('circularProgressBarContainer');
const failedProgressBarCircle = document.getElementById('failedProgressBarCircle');
const successfulProgressBarCircle = document.getElementById('successfulProgressBarCircle');
const progressPercentage = document.getElementById('progressPercentage');

// Array of all customization input elements
const customizationInputs = [
    deviceNameInput,
    serviceUuidInput,
    testIntervalInput,
    connectionDurationInput,
    connectionTimeoutInput,
    testRoundsInput
];

// Function to enable/disable customization panel
function setCustomizationPanelState(disabled) {
    customizationInputs.forEach(input => {
        input.disabled = disabled;
    });
    if (disabled) {
        startButton.classList.add('hidden');
        restoreDefaultsButton.classList.add('hidden'); // Hide Restore Defaults button
        stopButton.classList.remove('hidden');
    } else {
        startButton.classList.remove('hidden');
        restoreDefaultsButton.classList.remove('hidden'); // Show Restore Defaults button
        stopButton.classList.add('hidden');
    }
    startButton.disabled = disabled; // Keep disabled property for consistency if needed for focus/accessibility
    stopButton.disabled = !disabled;
}

// Function to save settings to localStorage
function saveSettings() {
    const settings = {
        deviceName: deviceNameInput.value,
        serviceUuid: serviceUuidInput.value,
        testInterval: testIntervalInput.value,
        connectionDuration: connectionDurationInput.value,
        connectionTimeout: connectionTimeoutInput.value,
        testRounds: testRoundsInput.value
    };
    localStorage.setItem('bleTestSettings', JSON.stringify(settings));
    log('Settings saved.', 'info');
}

// Function to load settings from localStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('bleTestSettings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        customizationInputs.forEach(input => {
            // Use the input's id to look up the corresponding key in the settings object
            input.value = settings[input.id] !== undefined ? settings[input.id] : input.dataset.default;
        });
        log('Settings loaded.', 'info');
    } else {
        // If no settings are saved, load default values
        restoreDefaultSettings(true);
    }
}

// Function to restore default settings
function restoreDefaultSettings(suppressLog = false) {
    localStorage.removeItem('bleTestSettings'); // Clear saved settings
    customizationInputs.forEach(input => {
        input.value = input.dataset.default;
    });
    updateSummary(); // Update summary to reflect default values if necessary
    if (!suppressLog) {
        log('Default settings restored.', 'info');
    }
}

// State Variables
let isTesting = false;
let testRound = 0;
let successfulConnections = 0;
let failedConnections = 0;
let currentDevice = null;
let testTimer = null; // To hold the setTimeout reference

// Update Summary Function
function updateSummary() {
    summaryTotalRounds.textContent = testRound;
    summarySuccesses.textContent = successfulConnections;
    summaryFailures.textContent = failedConnections;
    summaryStatus.textContent = isTesting ? 'Running' : 'Idle';
}

// Start Test Function
async function startTest() {
    saveSettings(); // Save current settings when test starts
    if (!navigator.bluetooth) {
        log('WebBluetooth is not available in this browser. Please use a Chrome-based browser.', 'error');
        return;
    }

    setCustomizationPanelState(true); // Disable customization when test starts
    log('Test started. Requesting Bluetooth device...', 'info');

    const deviceName = deviceNameInput.value.trim();
    const serviceUuid = serviceUuidInput.value.trim();

    const filters = [];
    if (deviceName) {
        filters.push({ namePrefix: deviceName });
    }
    if (serviceUuid) {
        filters.push({ services: [serviceUuid.startsWith('0x') ? parseInt(serviceUuid, 16) : serviceUuid] });
    }

    try {
        currentDevice = await navigator.bluetooth.requestDevice({
            filters: filters.length > 0 ? filters : undefined,
            optionalServices: filters.length > 0 && serviceUuid ? [serviceUuid.startsWith('0x') ? parseInt(serviceUuid, 16) : serviceUuid] : undefined,
            acceptAllDevices: filters.length === 0, // Accept all if no filters
        });
        currentDevice.addEventListener('gattserverdisconnected', (event) => {
            log(`Device ${event.target.name || event.target.id} disconnected unexpectedly.`, 'error');
            // Optionally, handle reconnection or stop the test here
        });
        log(`Found device: ${currentDevice.name || currentDevice.id}`, 'success');

        isTesting = true;
        testRound = 0;
        successfulConnections = 0;
        failedConnections = 0;
        updateSummary();

        const maxRounds = parseInt(testRoundsInput.value, 10);
        if (maxRounds !== 0) {
            circularProgressBarContainer.classList.remove('hidden');
            failedProgressBarCircle.style.strokeDasharray = `${0} 251.2`;
            successfulProgressBarCircle.style.strokeDasharray = `${0} 251.2`;
            progressPercentage.textContent = '0%';
        } else {
            circularProgressBarContainer.classList.add('hidden');
        }

        runTestLoop();
    } catch (error) {
        log(`Device request failed or cancelled: ${error.message}`, 'error');
        setCustomizationPanelState(false); // Re-enable customization if device request fails
        isTesting = false; // Ensure testing state is reset
        updateSummary();
    }
}

// Stop Test Function
function stopTest() {
    isTesting = false;
    clearTimeout(testTimer);
    setCustomizationPanelState(false); // Re-enable customization and show Start button
    log('Stopping test...', 'info');
    log('Test stopped.', 'info');
    updateSummary();
}

// Run Test Loop
async function runTestLoop() {
    if (!isTesting) {
        log('Test loop terminated.', 'info');
        setCustomizationPanelState(false); // Re-enable customization and show Start button here
        return;
    }

    const maxRounds = parseInt(testRoundsInput.value, 10);
    if (maxRounds !== 0 && testRound >= maxRounds) {
        log('All planned test rounds completed.', 'success');
        stopTest();
        return;
    }

    testRound++;
    log(`Starting round ${testRound}/${maxRounds === 0 ? 'infinite' : maxRounds}...`, 'info');
    updateSummary();

    await connectAndDisconnect();

    if (maxRounds !== 0) {
        const circumference = 2 * Math.PI * 40; // 2 * pi * radius (r=40 from SVG)

        // Update overall progress percentage
        const overallProgress = (testRound / maxRounds);
        progressPercentage.textContent = `${Math.round(overallProgress * 100)}%`;

        // Calculate lengths of segments
        const failedLength = (failedConnections / maxRounds) * circumference;
        const successfulLength = (successfulConnections / maxRounds) * circumference;

        // Draw Failed Progress (Red Segment)
        failedProgressBarCircle.style.strokeDasharray = `${failedLength} ${circumference}`;
        failedProgressBarCircle.style.strokeDashoffset = 0; // Start from top

        // Draw Successful Progress (Green Segment)
        // It starts after the failed segment.
        successfulProgressBarCircle.style.strokeDasharray = `${successfulLength} ${circumference}`;
        successfulProgressBarCircle.style.strokeDashoffset = -failedLength; // Offset clockwise by failedLength
    }

    const interval = parseInt(testIntervalInput.value, 10);
    testTimer = setTimeout(runTestLoop, interval);
}

// Connect and Disconnect Function
async function connectAndDisconnect() {
    if (!isTesting) {
        log('Test stopped during connection attempt.', 'info');
        return;
    }
    if (!currentDevice) {
        log('No device selected. Please start a new test to select a device.', 'error');
        failedConnections++;
        updateSummary();
        return;
    }
    const connectionDuration = parseInt(connectionDurationInput.value, 10);
    const connectionTimeout = parseInt(connectionTimeoutInput.value, 10);

    const connectionAttemptStartTime = Date.now();
    let connectionSuccessful = false;
    let connectionFailureReason = 'Connection timed out';
    let gattServer = null;

    while (Date.now() - connectionAttemptStartTime < connectionTimeout && !connectionSuccessful) {
        const timeElapsed = Date.now() - connectionAttemptStartTime;
        const remainingOverallTimeout = connectionTimeout - timeElapsed;
        log(`Attempting to connect (overall remaining: ${remainingOverallTimeout}ms)...`, 'info');

        try {
            // The actual connect call. Let it run naturally without a sub-timeout here.
            // It will resolve/reject based on OS/browser's internal timeout for a single connect attempt.
            gattServer = await currentDevice.gatt.connect();
            connectionSuccessful = true;
        } catch (error) {
            if (!isTesting) {
                break;
            }

            connectionFailureReason = error.message;
            log(`Connection sub-attempt failed: ${connectionFailureReason}`, 'info');

            // Calculate time to wait before the next retry, ensuring we don't exceed overall timeout.
            const timeAfterSubAttempt = Date.now();
            const totalTimeElapsed = timeAfterSubAttempt - connectionAttemptStartTime;
            const timeToFill = connectionTimeout - totalTimeElapsed;

            if (timeToFill > 0) {
                // Introduce a small delay between retries, e.g., 500ms, or less if timeout is running out.
                const retryDelay = Math.min(500, timeToFill);
                log(`Waiting for ${retryDelay}ms before next retry...`, 'info');
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                // No more time to fill, overall timeout has effectively expired.
                break;
            }
        }
    }

    if (!isTesting) {
        return;
    }

    // After the loop, report the final status
    const finalTimeTaken = Date.now() - connectionAttemptStartTime;
    if (connectionSuccessful) {
        log(`Connected to GATT server of ${currentDevice.name || currentDevice.id} (Took: ${finalTimeTaken}ms)`, 'success');
        successfulConnections++;

        log(`Maintaining connection for ${connectionDuration}ms...`, 'info');
        await new Promise(resolve => setTimeout(resolve, connectionDuration));

        log('Disconnecting from device...', 'info');
        currentDevice.gatt.disconnect();
        log('Disconnected.', 'success');

    } else {
        log(`Connection failed: ${connectionFailureReason} (Took: ${finalTimeTaken}ms total)`, 'error');
        failedConnections++;
        // If device was somehow connected briefly and then disconnected before final report, ensure disconnect.
        if (currentDevice && currentDevice.gatt && currentDevice.gatt.connected) {
            log('Attempting to disconnect after error...', 'info');
            currentDevice.gatt.disconnect();
        }
    }
    updateSummary();
}

loadSettings(); // Load settings when the application starts

// Event Listeners
startButton.addEventListener('click', startTest);
stopButton.addEventListener('click', stopTest);
restoreDefaultsButton.addEventListener('click', restoreDefaultSettings);

log('Application initialized. Ready to test.', 'info');
