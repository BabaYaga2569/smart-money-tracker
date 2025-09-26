// BillAnimationManager.js - Smooth animations for bill movement and status changes
export class BillAnimationManager {
    
    /**
     * Animate bill movement when marked as paid
     * @param {string} billId - Bill ID or unique identifier
     * @param {Function} onAnimationComplete - Callback when animation completes
     */
    static async animateBillPayment(billId, onAnimationComplete = null) {
        const billElement = document.getElementById(`bill-${billId}`) || 
                           document.querySelector(`[data-bill-id="${billId}"]`);
        
        if (!billElement) {
            console.warn(`Bill element not found for ID: ${billId}`);
            onAnimationComplete?.();
            return;
        }

        try {
            // Phase 1: Payment success flash
            await this.flashPaymentSuccess(billElement);
            
            // Phase 2: Move to bottom with fade
            await this.moveToBottom(billElement);
            
            // Phase 3: Fade back in at new position
            await this.fadeInAtNewPosition(billElement);
            
            // Animation complete
            onAnimationComplete?.();
        } catch (error) {
            console.error('Error during bill animation:', error);
            onAnimationComplete?.();
        }
    }

    /**
     * Flash payment success effect
     * @param {HTMLElement} element - Bill element
     */
    static async flashPaymentSuccess(element) {
        return new Promise(resolve => {
            element.classList.add('payment-success-flash');
            
            setTimeout(() => {
                element.classList.remove('payment-success-flash');
                resolve();
            }, 1000);
        });
    }

    /**
     * Move bill to bottom of list with animation
     * @param {HTMLElement} element - Bill element
     */
    static async moveToBottom(element) {
        return new Promise(resolve => {
            element.classList.add('moving-to-bottom');
            
            setTimeout(() => {
                element.classList.remove('moving-to-bottom');
                resolve();
            }, 500);
        });
    }

    /**
     * Fade element back in at new position
     * @param {HTMLElement} element - Bill element
     */
    static async fadeInAtNewPosition(element) {
        return new Promise(resolve => {
            element.classList.add('fade-in-new-position');
            
            setTimeout(() => {
                element.classList.remove('fade-in-new-position');
                resolve();
            }, 300);
        });
    }

    /**
     * Animate bills list re-sorting
     * @param {string} containerId - Container element ID
     */
    static async animateListReSort(containerId = 'bills-list') {
        const container = document.getElementById(containerId) || 
                         document.querySelector('.bills-list');
        
        if (!container) return;

        return new Promise(resolve => {
            container.classList.add('resorting');
            
            setTimeout(() => {
                container.classList.remove('resorting');
                resolve();
            }, 300);
        });
    }

    /**
     * Animate bill status change
     * @param {string} billId - Bill ID
     * @param {string} newStatus - New status (paid, pending, overdue)
     */
    static async animateStatusChange(billId, newStatus) {
        const statusElement = document.querySelector(`[data-bill-id="${billId}"] .status-badge`) ||
                             document.querySelector(`#bill-${billId} .status-badge`);
        
        if (!statusElement) return;

        return new Promise(resolve => {
            statusElement.classList.add('status-changing');
            
            // Update status classes
            statusElement.className = statusElement.className.replace(/status-\w+/, `status-${newStatus}`);
            
            setTimeout(() => {
                statusElement.classList.remove('status-changing');
                resolve();
            }, 500);
        });
    }

    /**
     * Animate amount update (for auto-payment detection)
     * @param {string} billId - Bill ID
     * @param {number} oldAmount - Previous amount
     * @param {number} newAmount - New amount
     */
    static async animateAmountUpdate(billId, oldAmount, newAmount) {
        const amountElement = document.querySelector(`[data-bill-id="${billId}"] .bill-amount`) ||
                             document.querySelector(`#bill-${billId} .bill-amount`);
        
        if (!amountElement) return;

        return new Promise(resolve => {
            amountElement.classList.add('amount-updating');
            
            // Animate number change
            let currentAmount = oldAmount;
            const difference = newAmount - oldAmount;
            const steps = 20;
            const stepAmount = difference / steps;
            let step = 0;

            const animateNumber = () => {
                if (step < steps) {
                    currentAmount += stepAmount;
                    amountElement.textContent = this.formatCurrency(currentAmount);
                    step++;
                    requestAnimationFrame(animateNumber);
                } else {
                    amountElement.textContent = this.formatCurrency(newAmount);
                    amountElement.classList.remove('amount-updating');
                    resolve();
                }
            };

            animateNumber();
        });
    }

    /**
     * Animate new bill appearing (when added)
     * @param {string} billId - Bill ID
     */
    static async animateNewBillAppear(billId) {
        const billElement = document.getElementById(`bill-${billId}`) || 
                           document.querySelector(`[data-bill-id="${billId}"]`);
        
        if (!billElement) return;

        return new Promise(resolve => {
            billElement.classList.add('new-bill-appear');
            
            setTimeout(() => {
                billElement.classList.remove('new-bill-appear');
                resolve();
            }, 600);
        });
    }

    /**
     * Animate bill removal (when deleted)
     * @param {string} billId - Bill ID
     * @param {Function} onComplete - Callback when animation completes
     */
    static async animateBillRemoval(billId, onComplete = null) {
        const billElement = document.getElementById(`bill-${billId}`) || 
                           document.querySelector(`[data-bill-id="${billId}"]`);
        
        if (!billElement) {
            onComplete?.();
            return;
        }

        return new Promise(resolve => {
            billElement.classList.add('bill-removing');
            
            setTimeout(() => {
                onComplete?.();
                resolve();
            }, 400);
        });
    }

    /**
     * Add stagger animation to bill list
     * @param {string} containerId - Container element ID
     */
    static addStaggerAnimation(containerId = 'bills-list') {
        const container = document.getElementById(containerId) || 
                         document.querySelector('.bills-list');
        
        if (!container) return;

        const billElements = container.querySelectorAll('.bill-item, .bill-card');
        
        billElements.forEach((element, index) => {
            element.style.animationDelay = `${index * 0.1}s`;
            element.classList.add('stagger-in');
        });

        // Clean up animation classes after animation completes
        setTimeout(() => {
            billElements.forEach(element => {
                element.classList.remove('stagger-in');
                element.style.animationDelay = '';
            });
        }, billElements.length * 100 + 600);
    }

    /**
     * Helper method to format currency for animations
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