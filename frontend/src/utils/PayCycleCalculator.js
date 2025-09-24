// PayCycleCalculator.js - Dynamic pay cycle calculations

export class PayCycleCalculator {
  
  // Calculate next bi-weekly payday from a reference date
  static calculateNextBiWeeklyPayday(lastPaydateStr) {
    if (!lastPaydateStr) return null;
    
    const lastPaydate = new Date(lastPaydateStr);
    const today = new Date();
    
    // Find the next bi-weekly occurrence
    let nextPayday = new Date(lastPaydate);
    
    while (nextPayday <= today) {
      nextPayday.setDate(nextPayday.getDate() + 14);
    }
    
    return {
      date: this.formatDateString(nextPayday),
      daysUntil: this.calculateDaysUntil(nextPayday)
    };
  }
  
  // Calculate next 15th/30th payday with Friday rule
  static calculateNextBiMonthlyPayday() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();
    
    // Calculate potential 15th and 30th dates for this month
    let next15th = new Date(currentYear, currentMonth, 15);
    let next30th = new Date(currentYear, currentMonth + 1, 0); // Last day of current month
    
    // If 15th already passed, use next month
    if (next15th <= today) {
      next15th = new Date(currentYear, currentMonth + 1, 15);
    }
    
    // If 30th already passed, use next month
    if (next30th <= today) {
      next30th = new Date(currentYear, currentMonth + 2, 0);
    }
    
    // Apply Friday rule for weekends
    next15th = this.adjustForWeekend(next15th);
    next30th = this.adjustForWeekend(next30th);
    
    // Return whichever comes first
    const nextPayday = next15th <= next30th ? next15th : next30th;
    
    return {
      date: this.formatDateString(nextPayday),
      daysUntil: this.calculateDaysUntil(nextPayday),
      type: next15th <= next30th ? '15th' : '30th'
    };
  }
  
  // Apply Friday rule - if weekend, move to Friday before
  static adjustForWeekend(date) {
    const dayOfWeek = date.getDay();
    const adjustedDate = new Date(date);
    
    if (dayOfWeek === 6) { // Saturday
      adjustedDate.setDate(date.getDate() - 1); // Move to Friday
    } else if (dayOfWeek === 0) { // Sunday
      adjustedDate.setDate(date.getDate() - 2); // Move to Friday
    }
    
    return adjustedDate;
  }
  
  // Calculate the next combined payday (yours vs spouse)
  static calculateNextPayday(yourPaySchedule, spousePaySchedule) {
    const yourNext = yourPaySchedule.lastPaydate ? 
      this.calculateNextBiWeeklyPayday(yourPaySchedule.lastPaydate) : null;
    const spouseNext = this.calculateNextBiMonthlyPayday();
    
    // Compare and return the earlier payday
    if (!yourNext) {
      return {
        ...spouseNext,
        source: 'spouse',
        amount: parseFloat(spousePaySchedule.amount) || 0
      };
    }
    
    const yourDate = new Date(yourNext.date);
    const spouseDate = new Date(spouseNext.date);
    
    if (yourDate <= spouseDate) {
      return {
        ...yourNext,
        source: 'yours',
        amount: parseFloat(yourPaySchedule.amount) || 0
      };
    } else {
      return {
        ...spouseNext,
        source: 'spouse',
        amount: parseFloat(spousePaySchedule.amount) || 0
      };
    }
  }
  
  // Helper function to format date as YYYY-MM-DD
  static formatDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Helper function to calculate days until a date
  static calculateDaysUntil(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }
  
  // Calculate all future paydays for a given period (useful for planning)
  static calculatePaydaySchedule(yourPaySchedule, spousePaySchedule, monthsAhead = 3) {
    const schedule = [];
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsAhead);
    
    // Generate your paydays
    if (yourPaySchedule.lastPaydate) {
      let currentPayday = new Date(yourPaySchedule.lastPaydate);
      while (currentPayday <= endDate) {
        if (currentPayday > startDate) {
          schedule.push({
            date: this.formatDateString(currentPayday),
            source: 'yours',
            amount: parseFloat(yourPaySchedule.amount) || 0,
            type: 'bi-weekly'
          });
        }
        currentPayday.setDate(currentPayday.getDate() + 14);
      }
    }
    
    // Generate spouse paydays (15th and 30th)
    let currentMonth = startDate.getMonth();
    let currentYear = startDate.getFullYear();
    
    while (currentYear < endDate.getFullYear() || 
           (currentYear === endDate.getFullYear() && currentMonth <= endDate.getMonth())) {
      
      // Add 15th
      const fifteenth = this.adjustForWeekend(new Date(currentYear, currentMonth, 15));
      if (fifteenth > startDate && fifteenth <= endDate) {
        schedule.push({
          date: this.formatDateString(fifteenth),
          source: 'spouse',
          amount: parseFloat(spousePaySchedule.amount) || 0,
          type: '15th'
        });
      }
      
      // Add 30th (last day of month)
      const lastDay = this.adjustForWeekend(new Date(currentYear, currentMonth + 1, 0));
      if (lastDay > startDate && lastDay <= endDate) {
        schedule.push({
          date: this.formatDateString(lastDay),
          source: 'spouse',
          amount: parseFloat(spousePaySchedule.amount) || 0,
          type: '30th'
        });
      }
      
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }
    
    // Sort by date
    schedule.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    return schedule;
  }
}