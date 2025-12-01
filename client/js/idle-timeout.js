// idle-timeout.js - Auto logout after 15 minutes of inactivity (user-side only)
(function() {
    'use strict';

    // Configuration
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes in milliseconds
    const WARNING_BEFORE_MS = 60 * 1000; // Show warning 1 minute before logout
    const CHECK_INTERVAL_MS = 1000; // Check every second

    let lastActivityTime = Date.now();
    let idleCheckInterval = null;
    let warningModal = null;
    let countdownInterval = null;

    // Events that reset the idle timer
    const activityEvents = [
        'mousedown',
        'mousemove',
        'keydown',
        'keypress',
        'scroll',
        'touchstart',
        'touchmove',
        'click',
        'wheel'
    ];

    // Check if user is logged in
    function isUserLoggedIn() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        return !!(token && user);
    }

    // Check if current page is admin page
    function isAdminPage() {
        return window.location.pathname.includes('/admin/');
    }

    // Reset the idle timer
    function resetIdleTimer() {
        lastActivityTime = Date.now();
        // If warning is showing, hide it
        if (warningModal && warningModal.style.display !== 'none') {
            hideWarning();
        }
    }

    // Create warning modal
    function createWarningModal() {
        if (warningModal) return;

        warningModal = document.createElement('div');
        warningModal.id = 'idle-timeout-warning';
        warningModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
        warningModal.style.display = 'none';
        
        warningModal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md mx-4 text-center transform transition-all">
                <div class="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-clock text-3xl text-yellow-600"></i>
                </div>
                <h2 class="text-xl font-bold text-gray-900 mb-2">Session Timeout Warning</h2>
                <p class="text-gray-600 mb-4">
                    You have been inactive for a while. Your session will expire in 
                    <span id="idle-countdown" class="font-bold text-red-600">60</span> seconds.
                </p>
                <p class="text-sm text-gray-500 mb-6">Move your mouse or press any key to stay logged in.</p>
                <div class="flex justify-center space-x-4">
                    <button id="idle-stay-btn" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium">
                        <i class="fas fa-check mr-2"></i>Stay Logged In
                    </button>
                    <button id="idle-logout-btn" class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium">
                        <i class="fas fa-sign-out-alt mr-2"></i>Logout Now
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(warningModal);

        // Event listeners for warning buttons
        document.getElementById('idle-stay-btn').addEventListener('click', function() {
            resetIdleTimer();
            hideWarning();
        });

        document.getElementById('idle-logout-btn').addEventListener('click', function() {
            performLogout();
        });
    }

    // Show warning modal
    function showWarning() {
        if (!warningModal) createWarningModal();
        
        warningModal.style.display = 'flex';
        let countdown = Math.floor(WARNING_BEFORE_MS / 1000);
        
        const countdownEl = document.getElementById('idle-countdown');
        if (countdownEl) countdownEl.textContent = countdown;

        // Clear any existing countdown
        if (countdownInterval) clearInterval(countdownInterval);

        // Start countdown
        countdownInterval = setInterval(function() {
            countdown--;
            if (countdownEl) countdownEl.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(countdownInterval);
                performLogout();
            }
        }, 1000);
    }

    // Hide warning modal
    function hideWarning() {
        if (warningModal) {
            warningModal.style.display = 'none';
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    // Perform logout
    function performLogout() {
        // Clear countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        // Clear idle check
        if (idleCheckInterval) {
            clearInterval(idleCheckInterval);
            idleCheckInterval = null;
        }

        // Clear local storage
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        // Show logout message briefly then redirect
        if (warningModal) {
            warningModal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl p-6 max-w-md mx-4 text-center">
                    <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                        <i class="fas fa-sign-out-alt text-3xl text-red-600"></i>
                    </div>
                    <h2 class="text-xl font-bold text-gray-900 mb-2">Session Expired</h2>
                    <p class="text-gray-600 mb-4">You have been logged out due to inactivity.</p>
                    <p class="text-sm text-gray-500">Redirecting to login page...</p>
                </div>
            `;
            warningModal.style.display = 'flex';
        }

        // Redirect after short delay
        setTimeout(function() {
            window.location.href = 'login.html';
        }, 2000);
    }

    // Check idle status
    function checkIdleStatus() {
        if (!isUserLoggedIn()) {
            // User not logged in, stop checking
            stopIdleCheck();
            return;
        }

        const now = Date.now();
        const idleTime = now - lastActivityTime;

        // Show warning when approaching timeout
        if (idleTime >= (IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) && idleTime < IDLE_TIMEOUT_MS) {
            if (warningModal && warningModal.style.display === 'none') {
                showWarning();
            }
        }
        
        // Timeout reached
        if (idleTime >= IDLE_TIMEOUT_MS) {
            performLogout();
        }
    }

    // Start idle check
    function startIdleCheck() {
        // Don't run on admin pages
        if (isAdminPage()) {
            console.log('[IdleTimeout] Skipping - Admin page detected');
            return;
        }

        // Only run if user is logged in
        if (!isUserLoggedIn()) {
            console.log('[IdleTimeout] Skipping - User not logged in');
            return;
        }

        console.log('[IdleTimeout] Starting idle timeout monitor (15 minutes)');

        // Create warning modal
        createWarningModal();

        // Set up activity listeners
        activityEvents.forEach(function(event) {
            document.addEventListener(event, resetIdleTimer, { passive: true });
        });

        // Start periodic check
        idleCheckInterval = setInterval(checkIdleStatus, CHECK_INTERVAL_MS);
    }

    // Stop idle check
    function stopIdleCheck() {
        if (idleCheckInterval) {
            clearInterval(idleCheckInterval);
            idleCheckInterval = null;
        }
        
        // Remove activity listeners
        activityEvents.forEach(function(event) {
            document.removeEventListener(event, resetIdleTimer);
        });

        hideWarning();
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startIdleCheck);
    } else {
        startIdleCheck();
    }

    // Also start check when user logs in (for SPA-like behavior)
    window.addEventListener('storage', function(e) {
        if (e.key === 'token') {
            if (e.newValue) {
                // User just logged in
                resetIdleTimer();
                startIdleCheck();
            } else {
                // User logged out
                stopIdleCheck();
            }
        }
    });

    // Expose for manual control if needed
    window.IdleTimeout = {
        reset: resetIdleTimer,
        start: startIdleCheck,
        stop: stopIdleCheck
    };

})();
