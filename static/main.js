const socket = io();

// DOM Elements
const elements = {
    qrInput: document.getElementById('qrInput'),
    scanBtn: document.getElementById('scanBtn'),
    filterBtn: document.getElementById('filterBtn'),
    dateFilter: document.getElementById('dateFilter'),
    exportBtn: document.getElementById('exportBtn'),
    undoBtn: document.getElementById('undoBtn'),
    themeBtn: document.getElementById('themeBtn'),
    themeIcon: document.getElementById('themeIcon'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    scanTableBody: document.getElementById('scanTableBody'),
    exportModal: document.getElementById('exportModal'),
    undoModal: document.getElementById('undoModal'),
    exportForm: document.getElementById('exportForm'),
    notification: document.getElementById('notification'),
    monthlyScans: document.getElementById('monthlyScans'),
    todayTotal: document.getElementById('todayTotal'),
    todayPassed: document.getElementById('todayPassed'),
    todayFailed: document.getElementById('todayFailed'),
    failureCodeModal: document.getElementById('failureCodeModal'),
    powerInput: document.getElementById('powerInput'),
    powerFactorInput: document.getElementById('powerFactorInput'),
    failureCodeInput: document.getElementById('failureCodeInput'),
    cancelFailureCodeBtn: document.getElementById('cancelFailureCodeBtn'),
    submitFailureCodeBtn: document.getElementById('submitFailureCodeBtn')
};

let darkMode = localStorage.getItem('darkMode') === 'true';
let pendingScanData = null;
let currentScanId = null;

// Initialize dark mode
if (darkMode) {
    document.body.classList.add('dark-mode');
    elements.themeIcon.textContent = '☀️';
}

// Socket Connection
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showNotification('Connection error', 'error');
});

socket.on('new_scan', handleNewScan);

let scannerJustScanned = false;

elements.qrInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement === elements.qrInput) {
        e.preventDefault();

        if (!scannerJustScanned) {
            // First Enter (probably from scanner)
            scannerJustScanned = true;
            showNotification('Press Enter again to confirm submission', 'info');
            return;
        }

        // Second Enter (manual)
        scannerJustScanned = false;
        submitScan();
    }
});

// Reset flag if user types anything manually
elements.qrInput.addEventListener('input', () => {
    scannerJustScanned = false;
});



elements.scanBtn.addEventListener('click', () => submitScan());
elements.filterBtn.addEventListener('click', handleFilter);
elements.exportBtn.addEventListener('click', showExportModal);
elements.undoBtn.addEventListener('click', showUndoModal);
elements.themeBtn.addEventListener('click', toggleTheme);

elements.exportForm.addEventListener('submit', handleExport);
document.getElementById('cancelExportBtn').addEventListener('click', () => hideModal('exportModal'));
document.getElementById('cancelUndoBtn').addEventListener('click', () => hideModal('undoModal'));
document.getElementById('confirmUndoBtn').addEventListener('click', handleUndo);
document.getElementById('cancelFailureCodeBtn').addEventListener('click', () => hideModal('failureCodeModal'));
document.getElementById('submitFailureCodeBtn').addEventListener('click', async () => {
    const code = elements.failureCodeInput.value.trim();
    if (!code) {
        showNotification('Enter a failure code', 'error');
        return;
    }
    if (pendingScanData) {
        // Send update to the new endpoint
        try {
            const response = await fetch('/update_failure_code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `qr_code=${encodeURIComponent(pendingScanData.qrCode)}&failure_code=${encodeURIComponent(code)}`
            });
            const data = await response.json();
            if (data.success) {
                showNotification('✅ Failure code updated', 'success');
                // Optionally, reload the page or fetch updated data
                window.location.reload();
            } else {
                showNotification(data.error || 'Failed to update failure code', 'error');
            }
        } catch (error) {
            showNotification('Failed to update failure code', 'error');
        }
        hideModal('failureCodeModal');
        pendingScanData = null;
        elements.failureCodeInput.value = '';
    }
});

// Modal outside click handling
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
});

// Functions
async function submitScan(failureCode = 'NA') {
    const qrCode = elements.qrInput.value.trim();

    if (!qrCode) {
        showNotification('Please enter the QR code', 'error');
        return;
    }

    try {
        const response = await fetch('/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `qr_code=${encodeURIComponent(qrCode)}&failure_code=${failureCode}`
        });

        const data = await response.json();

        if (data.error) {
            showNotification(`⚠️ ${data.error}`, 'error');
        } else if (data.success) {
            elements.qrInput.value = '';
            elements.qrInput.focus();

            if (data.data.status === 'FAIL' && data.data.failure_code === '') {
                // Show modal for failure code
                pendingScanData = { qrCode };
                showModal('failureCodeModal');
            } else {
                showNotification(
                    data.data.status === 'PASS' ? '✅ Scan added - PASS' : '⚠️ Scan added - FAIL',
                    data.data.status === 'PASS' ? 'success' : 'error'
                );
            }
        }
    } catch (error) {
        console.error('Scan error:', error);
        showNotification('⚠️ Failed to submit scan', 'error');
    }
}

function handleFilter() {
    const date = elements.dateFilter.value;
    if (date) {
        window.location.href = `/?date=${date}`;
    }
}

function handleNewScan(data) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${data.daily_number}</td>
        <td>${data.qr_code}</td>
        <td>${data.power}</td>
        <td>${data.rpm}</td>
        <td>${data.power_factor}</td>
        <td>${data.failure_code}</td>
        <td>
            <span class="status-badge ${data.status.toLowerCase()}">
                ${data.status}
            </span>
        </td>
        <td>${data.timestamp}</td>
        <td>${data.status === 'PASS' ? 'FP OK' : data.result || ''}</td>
        <td>${data.voice_recognition || 'NA'}</td>
    `;
    elements.scanTableBody.insertBefore(row, elements.scanTableBody.firstChild);
    updateStats(data.status === 'PASS');
    showNotification(
        data.status === 'PASS' ? '✅ Scan added - PASS' : '⚠️ Scan added - FAIL',
        data.status === 'PASS' ? 'success' : 'error'
    );
}

async function handleUndo() {
    hideModal('undoModal');
    
    try {
        const response = await fetch('/undo', {
            method: 'POST',
        });
        const data = await response.json();

        if (data.success) {
            if (elements.scanTableBody.firstElementChild) {
                elements.scanTableBody.firstElementChild.remove();
            }
            updateStats();
            showNotification('Last scan removed', 'success');
        } else {
            showNotification(data.error || 'Failed to remove scan', 'error');
        }
    } catch (error) {
        console.error('Undo error:', error);
        showNotification('Failed to remove scan', 'error');
    }
}

function handleExport(e) {
    e.preventDefault();
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const fileName = document.getElementById('fileName').value;
    
    window.location.href = `/export?start_date=${startDate}&end_date=${endDate}&file_name=${fileName}`;
    hideModal('exportModal');
}

function updateFailureCodeAndResult(failureCode, result) {
    const formData = new FormData();
    formData.append('failure_code', failureCode);
    formData.append('result', result);

    return fetch('/update_failure_code_and_result', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            location.reload(); // Refresh to show updated data
        } else {
            throw new Error(data.error || 'Update failed');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert(error.message);
    });
}


document.getElementById('submitFailureCodeBtn').onclick = function() {
    const failureCode = document.getElementById('failureCodeInput').value.trim();
    const result = document.getElementById('resultInput').value.trim() || failureCode;

    if (!failureCode) {
        alert('Please enter a failure code');
        return;
    }

    updateFailureCodeAndResult(failureCode, result);
};

document.getElementById('cancelFailureCodeBtn').onclick = function() {
    document.getElementById('failureCodeModal').style.display = 'none';
};

// Voice recognition function
function sendVoiceOption(option) {
    const formData = new FormData();
    formData.append('option', option);

    fetch('/voice_recognition', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('voiceModal').style.display = 'none';
            // No alert, just refresh to show updated settings
            location.reload();
        } else {
            throw new Error(data.error || 'Update failed');
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// Add event listeners for voice recognition buttons
document.getElementById('voiceOkBtn').onclick = () => sendVoiceOption('OK');
document.getElementById('voiceNaBtn').onclick = () => sendVoiceOption('NA');

// UI Functions
function showNotification(message, type = 'info') {
    elements.notification.textContent = message;
    elements.notification.className = `notification show ${type}`;
    setTimeout(() => elements.notification.classList.remove('show'), 3000);
}

function showExportModal() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('startDate').value = today;
    document.getElementById('endDate').value = today;
    document.getElementById('fileName').value = `scan_report_${today}`;
    showModal('exportModal');
}

function showUndoModal() {
    showModal('undoModal');
}

// Show the failure code modal
function showFailureCodeModal(scanId) {
    currentScanId = scanId;
    const modal = document.getElementById('failureCodeModal');
    const failureCodeInput = document.getElementById('failureCodeInput');
    const resultInput = document.getElementById('resultInput');
    
    // Clear previous values
    failureCodeInput.value = '';
    resultInput.value = '';
    
    modal.style.display = 'block';
    failureCodeInput.focus();
}

document.getElementById('submitFailureCodeBtn').addEventListener('click', function() {
    const failureCode = document.getElementById('failureCodeInput').value.trim();
    const result = document.getElementById('resultInput').value.trim() || failureCode;

    if (!failureCode) {
        alert('Please enter a failure code');
        return;
    }

    fetch('/update_failure_code_and_result', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `failure_code=${encodeURIComponent(failureCode)}&result=${encodeURIComponent(result)}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('failureCodeModal').style.display = 'none';
            // Refresh the page to show updated data
            window.location.reload();
        } else {
            alert('Error: ' + (data.error || 'Failed to update'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Failed to update failure code and result');
    });
});

document.getElementById('cancelFailureCodeBtn').addEventListener('click', function() {
    document.getElementById('failureCodeModal').style.display = 'none';
});

function showModal(id) {
    document.getElementById(id).classList.add('show');
}

function hideModal(id) {
    document.getElementById(id).classList.remove('show');
}

function toggleTheme() {
    darkMode = !darkMode;
    document.body.classList.toggle('dark-mode');
    elements.themeIcon.textContent = darkMode ? '☀️' : '🌙';
    localStorage.setItem('darkMode', darkMode);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function updateStats(isPassing) {
    // Update monthly scans
    const monthly = parseInt(elements.monthlyScans.textContent) || 0;
    elements.monthlyScans.textContent = monthly + 1;

    // Update today's total
    const total = parseInt(elements.todayTotal.textContent) || 0;
    elements.todayTotal.textContent = total + 1;

    // Update passed/failed with color classes
    if (isPassing) {
        const passed = parseInt(elements.todayPassed.textContent) || 0;
        elements.todayPassed.textContent = passed + 1;
        elements.todayPassed.classList.add('passed');
    } else {
        const failed = parseInt(elements.todayFailed.textContent) || 0;
        elements.todayFailed.textContent = failed + 1;
        elements.todayFailed.classList.add('failed');
    }
}