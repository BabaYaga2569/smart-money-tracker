// NotificationManager.js - Enhanced notification system for bill payment feedback
export class NotificationManager {
    static notifications = [];
    static listeners = [];

    /**
     * Show a notification with optional actions
     * @param {Object} notificationData - Notification configuration
     * @returns {string} Notification ID
     */
    static showNotification({
        type = 'info',
        title,
        message,
        duration = 5000,
        actions = [],
        autoClose = true
    }) {
        const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const notification = {
            id,
            type,
            title,
            message,
            duration,
            actions,
            autoClose,
            timestamp: Date.now()
        };

        this.notifications.push(notification);
        this.notifyListeners();

        // Auto-remove notification after duration
        if (autoClose && duration > 0) {
            setTimeout(() => {
                this.removeNotification(id);
            }, duration);
        }

        return id;
    }

    /**
     * Remove a notification by ID
     * @param {string} id - Notification ID
     */
    static removeNotification(id) {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.notifyListeners();
    }

    /**
     * Clear all notifications
     */
    static clearAll() {
        this.notifications = [];
        this.notifyListeners();
    }

    /**
     * Subscribe to notification changes
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    static subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        };
    }

    /**
     * Get all current notifications
     * @returns {Array} Current notifications
     */
    static getNotifications() {
        return [...this.notifications];
    }

    /**
     * Notify all listeners of changes
     */
    static notifyListeners() {
        this.listeners.forEach(listener => {
            try {
                listener(this.getNotifications());
            } catch (error) {
                console.error('Error in notification listener:', error);
            }
        });
    }

    /**
     * Show payment success notification
     * @param {Object} bill - Bill object
     * @param {Object} paymentData - Payment data
     */
    static showPaymentSuccess(bill, paymentData = {}) {
        return this.showNotification({
            type: 'success',
            title: 'Payment Automatically Processed',
            message: `${bill.name} (${this.formatCurrency(bill.amount)}) marked as paid`,
            duration: 5000,
            actions: [
                {
                    label: 'View Bill',
                    action: () => this.navigateToBill?.(bill.id)
                },
                {
                    label: 'Undo',
                    action: () => this.undoPayment?.(bill.id)
                }
            ]
        });
    }

    /**
     * Show Plaid auto-payment detection notification
     * @param {Object} bill - Bill object
     * @param {Object} transaction - Transaction data
     */
    static showAutoPaymentDetected(bill, transaction) {
        return this.showNotification({
            type: 'success',
            title: 'Auto-Payment Detected',
            message: `${bill.name} ($${Math.abs(transaction.amount)}) automatically marked as paid from bank transaction`,
            duration: 8000,
            actions: [
                {
                    label: 'View Transaction',
                    action: () => this.viewTransaction?.(transaction.transaction_id)
                },
                {
                    label: 'Undo Auto-Payment',
                    action: () => this.undoAutoPayment?.(bill.id)
                }
            ]
        });
    }

    /**
     * Show error notification
     * @param {string} message - Error message
     * @param {Error|string} error - Error object or error string
     */
    static showError(message, error = null) {
        console.error('Error:', message, error);
        
        // Extract error message if it's an Error object or string
        const errorDetails = typeof error === 'string' ? error : (error?.message || error);
        const fullMessage = errorDetails ? `${message}: ${errorDetails}` : message;
        
        return this.showNotification({
            type: 'error', 
            title: 'Error',
            message: fullMessage,
            duration: 10000, // Increase to 10 seconds for errors
            actions: error ? [
                {
                    label: 'View Details',
                    action: () => console.log('Error details:', error)
                }
            ] : []
        });
    }

    /**
     * Show success notification
     * @param {string} message - Success message
     * @param {number} duration - How long to show notification (ms)
     */
    static showSuccess(message, duration = 5000) {
        return this.showNotification({
            type: 'success',
            title: 'Success',
            message,
            duration
        });
    }

    /**
     * Show warning notification
     * @param {string} title - Warning title
     * @param {string} message - Warning message
     */
    static showWarning(title, message = null) {
        return this.showNotification({
            type: 'warning',
            title: title,
            message: message || title,
            duration: 7000
        });
    }

    /**
     * Show info notification
     * @param {string} message - Info message
     */
    static showInfo(message) {
        return this.showNotification({
            type: 'info',
            title: 'Information',
            message,
            duration: 5000
        });
    }

    /**
     * Show loading notification for async operations
     * @param {string} message - Loading message
     * @returns {string} Notification ID
     */
    static showLoading(message = 'Processing...') {
        return this.showNotification({
            type: 'loading',
            title: 'Processing',
            message,
            duration: 0, // Don't auto-close loading notifications
            autoClose: false
        });
    }

    /**
     * Helper method to format currency
     * @param {number} amount - Amount to format
     * @returns {string} Formatted currency
     */
    static formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(Math.abs(amount));
    }
}

// Set up global handlers for navigation and undo actions
// These can be overridden by the application
NotificationManager.navigateToBill = null;
NotificationManager.viewTransaction = null;
NotificationManager.undoPayment = null;
NotificationManager.undoAutoPayment = null;