// PayCycleCalculator.js - Dynamic pay cycle calculations
import { getPacificTime, getDaysUntilDateInPacific } from './DateUtils.js';

export class PayCycleCalculator {
    
    /**
     * Calculate the next payday from either your bi-weekly or spouse's bi-monthly schedule
     * @param {Date|string} lastPayDate - Your last payday
     * @param {number} wifePayAmount - Wife's pay amount  
     * @returns {Date} Next payday date
     */
    static getNextPayday(lastPayDate, wifePayAmount = 0) {
        // Calculate your next bi-weekly payday
        const lastPay = new Date(lastPayDate);
        const yourNextPay = new Date(lastPay);
        yourNextPay.setDate(lastPay.getDate() + 14);
        
        // Calculate wife's next payday (15th or 30th)
        const wifeNextPay = this.getWifeNextPayday();
        
        // Return whichever comes first
        if (wifePayAmount > 0 && wifeNextPay < yourNextPay) {
            return wifeNextPay;
        }
        return yourNextPay;
    }

    /**
     * Calculate next payday with detailed info (for Settings component)
     * @param {Object} yoursSchedule - Your pay schedule object
     * @param {Object} spouseSchedule - Spouse pay schedule object
     * @returns {Object} Detailed payday info
     */
    static calculateNextPayday(yoursSchedule, spouseSchedule) {
        try {
            const today = getPacificTime();
            today.setHours(0, 0, 0, 0); // Start of day for comparison
            
            console.log('📅 PayCycleCalculator: Calculating next payday...', {
                today: today.toISOString(),
                yoursSchedule,
                spouseSchedule
            });
            
            // Calculate your next bi-weekly payday
            let yourNextPay = null;
            let yourAmount = 0;
            
            if (yoursSchedule.lastPaydate && yoursSchedule.amount) {
                const lastPay = new Date(yoursSchedule.lastPaydate);
                
                // Calculate next payday from last pay date
                yourNextPay = new Date(lastPay);
                yourNextPay.setDate(lastPay.getDate() + 14);
                
                // If the calculated next payday has already passed, keep adding 14 days until we find a future date
                while (yourNextPay < today) {
                    yourNextPay.setDate(yourNextPay.getDate() + 14);
                }
                
                yourAmount = parseFloat(yoursSchedule.amount) || 0;
                
                console.log('📅 Your next payday:', {
                    date: yourNextPay.toISOString(),
                    amount: yourAmount,
                    daysUntil: getDaysUntilDateInPacific(yourNextPay.toISOString().split('T')[0])
                });
            }
            
            // Calculate spouse's next payday (15th or 30th)
            let spouseNextPay = null;
            let spouseAmount = 0;
            
            // Calculate spouse payday if spouse schedule exists AND has a valid amount
            // Only consider spouse schedule if amount is actually set and greater than 0
            if (spouseSchedule && spouseSchedule.amount && parseFloat(spouseSchedule.amount) > 0) {
                spouseNextPay = this.getWifeNextPayday();
                spouseAmount = parseFloat(spouseSchedule.amount);
                
                console.log('📅 Spouse next payday:', {
                    date: spouseNextPay.toISOString(),
                    amount: spouseAmount,
                    daysUntil: getDaysUntilDateInPacific(spouseNextPay.toISOString().split('T')[0])
                });
            }
            
            // Determine which comes first
            let nextPayday, source, amount;
            
            if (yourNextPay && spouseNextPay) {
                // ✅ FIX: Ensure we're comparing Date objects properly
                const yourTime = yourNextPay.getTime();
                const spouseTime = spouseNextPay.getTime();
                
                console.log('📅 Comparing paydays:', {
                    yourDate: yourNextPay.toISOString().split('T')[0],
                    spouseDate: spouseNextPay.toISOString().split('T')[0],
                    yourTime,
                    spouseTime,
                    spouseIsEarlier: spouseTime < yourTime
                });
                
                if (spouseTime < yourTime) {
                    nextPayday = spouseNextPay;
                    source = "spouse";
                    amount = spouseAmount;
                    console.log('✅ Chose SPOUSE payday (earlier)');
                } else {
                    nextPayday = yourNextPay;
                    source = "yours";
                    amount = yourAmount;
                    console.log('✅ Chose YOUR payday (earlier or same)');
                }
            } else if (yourNextPay) {
                nextPayday = yourNextPay;
                source = "yours";
                amount = yourAmount;
                console.log('✅ Only YOUR payday available');
            } else if (spouseNextPay) {
                nextPayday = spouseNextPay;
                source = "spouse";
                amount = spouseAmount;
                console.log('✅ Only SPOUSE payday available');
            } else {
                throw new Error("No payday information available");
            }
            
            // Format date to YYYY-MM-DD string before calculating days until
            const paydayDateStr = nextPayday.toISOString().split('T')[0];
            
            // Calculate days until payday using Pacific Time
            const daysUntil = getDaysUntilDateInPacific(paydayDateStr);
            
            console.log('📅 Final payday result:', {
                date: paydayDateStr,
                daysUntil,
                source,
                amount
            });
            
            return {
                date: paydayDateStr,
                daysUntil: daysUntil,
                source: source,
                amount: amount
            };
            
        } catch (error) {
            console.error('❌ PayCycleCalculator error:', error);
            return {
                date: new Date().toISOString().split('T')[0],
                daysUntil: 0,
                source: "error",
                amount: 0
            };
        }
    }
    
    /**
     * Calculate wife's next payday (15th or 30th with Friday rule)
     * @returns {Date} Next payday for wife
     */
    static getWifeNextPayday() {
        const now = getPacificTime();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0); // Start of day for comparison
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        
        // Check 15th of current month
        const fifteenth = new Date(currentYear, currentMonth, 15);
        const adjustedFifteenth = this.adjustForWeekend(fifteenth);
        
        // Check 30th of current month (or last day if shorter month)
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const monthEnd = new Date(currentYear, currentMonth, Math.min(30, lastDayOfMonth));
        const adjustedMonthEnd = this.adjustForWeekend(monthEnd);
        
        // If both dates this month are in the future, return the earlier one
        if (adjustedFifteenth >= today && adjustedMonthEnd >= today) {
            return adjustedFifteenth < adjustedMonthEnd ? adjustedFifteenth : adjustedMonthEnd;
        }
        
        // If only 30th is in the future this month
        if (adjustedMonthEnd >= today) {
            return adjustedMonthEnd;
        }
        
        // Both dates have passed, calculate for next month
        const nextMonth = currentMonth + 1;
        const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
        const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;
        
        const nextFifteenth = new Date(nextYear, adjustedMonth, 15);
        return this.adjustForWeekend(nextFifteenth);
    }
    
    /**
     * Adjust payday to Friday if it falls on weekend
     * @param {Date} date - Original payday
     * @returns {Date} Adjusted payday (only if weekend)
     */
    static adjustForWeekend(date) {
        const dayOfWeek = date.getDay();
        
        // Sunday - move to Friday (subtract 2 days)
        if (dayOfWeek === 0) {
            const adjustedDate = new Date(date);
            adjustedDate.setDate(date.getDate() - 2);
            console.log(`📅 Adjusted payday from Sunday ${date.toISOString().split('T')[0]} to Friday ${adjustedDate.toISOString().split('T')[0]}`);
            return adjustedDate;
        } 
        
        // Saturday - move to Friday (subtract 1 day)
        if (dayOfWeek === 6) {
            const adjustedDate = new Date(date);
            adjustedDate.setDate(date.getDate() - 1);
            console.log(`📅 Adjusted payday from Saturday ${date.toISOString().split('T')[0]} to Friday ${adjustedDate.toISOString().split('T')[0]}`);
            return adjustedDate;
        }
        
        // Weekday (Monday-Friday) - return original date unchanged
        console.log(`📅 No adjustment needed - ${date.toISOString().split('T')[0]} is a weekday`);
        return date;
    }
}