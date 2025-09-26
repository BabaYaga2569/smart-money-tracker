// BillMigrationManager.js - Handles migration of bills from Settings to Recurring page
import { formatDateForInput } from './DateUtils.js';

export class BillMigrationManager {
    
    /**
     * Convert Settings bills to Recurring items format
     * @param {Array} settingsBills - Bills from Settings page
     * @returns {Array} Converted recurring items
     */
    static convertSettingsBillsToRecurringItems(settingsBills) {
        if (!Array.isArray(settingsBills) || settingsBills.length === 0) {
            return [];
        }

        return settingsBills
            .filter(bill => bill.name && bill.amount) // Only include valid bills
            .map(bill => ({
                id: `migrated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: bill.name,
                type: 'expense',
                amount: parseFloat(bill.amount) || 0,
                category: this.inferCategoryFromName(bill.name),
                frequency: bill.recurrence || 'monthly',
                nextOccurrence: bill.dueDate || formatDateForInput(new Date()),
                linkedAccount: '', // Will need to be set by user
                autoPay: false,
                description: `Migrated from Settings page`,
                status: 'active',
                migratedFromSettings: true,
                migrationDate: new Date().toISOString()
            }));
    }

    /**
     * Detect if Settings page has bills that need migration
     * @param {Array} settingsBills - Bills from Settings page
     * @param {Array} recurringItems - Existing recurring items
     * @returns {Object} Migration analysis
     */
    static analyzeMigrationNeed(settingsBills, recurringItems) {
        const validSettingsBills = (settingsBills || []).filter(bill => bill.name && bill.amount);
        const migratedItems = (recurringItems || []).filter(item => item.migratedFromSettings);
        
        // Check for bills that haven't been migrated yet
        const unmigrated = validSettingsBills.filter(settingsBill => {
            return !migratedItems.some(recurringItem => 
                recurringItem.name.toLowerCase() === settingsBill.name.toLowerCase() &&
                Math.abs(parseFloat(recurringItem.amount) - parseFloat(settingsBill.amount)) < 0.01
            );
        });

        return {
            hasUnmigratedBills: unmigrated.length > 0,
            unmigratedCount: unmigrated.length,
            totalSettingsBills: validSettingsBills.length,
            alreadyMigratedCount: migratedItems.length,
            unmigratedBills: unmigrated
        };
    }

    /**
     * Infer category from bill name using common patterns
     * @param {string} billName - Name of the bill
     * @returns {string} Inferred category
     */
    static inferCategoryFromName(billName) {
        const name = billName.toLowerCase();
        
        // Utilities
        if (name.includes('electric') || name.includes('gas') || name.includes('water') || 
            name.includes('utility') || name.includes('power') || name.includes('energy')) {
            return 'Utilities & Bills';
        }
        
        // Subscriptions
        if (name.includes('netflix') || name.includes('spotify') || name.includes('hulu') ||
            name.includes('subscription') || name.includes('streaming') || name.includes('prime')) {
            return 'Subscriptions';
        }
        
        // Insurance
        if (name.includes('insurance') || name.includes('policy')) {
            return 'Insurance';
        }
        
        // Phone/Internet
        if (name.includes('phone') || name.includes('internet') || name.includes('mobile') ||
            name.includes('verizon') || name.includes('att') || name.includes('comcast')) {
            return 'Phone & Internet';
        }
        
        // Housing
        if (name.includes('rent') || name.includes('mortgage') || name.includes('hoa')) {
            return 'Housing';
        }
        
        // Transportation
        if (name.includes('car') || name.includes('loan') || name.includes('payment')) {
            return 'Transportation';
        }
        
        // Default
        return 'Utilities & Bills';
    }

    /**
     * Create migration preview data
     * @param {Array} settingsBills - Bills to migrate
     * @param {Array} existingRecurringItems - Current recurring items
     * @returns {Object} Preview data with conflicts detection
     */
    static createMigrationPreview(settingsBills, existingRecurringItems) {
        const convertedItems = this.convertSettingsBillsToRecurringItems(settingsBills);
        const conflicts = [];
        
        // Check for potential duplicates
        convertedItems.forEach(newItem => {
            const potentialDuplicates = existingRecurringItems.filter(existing => {
                const nameMatch = existing.name.toLowerCase().includes(newItem.name.toLowerCase()) ||
                                newItem.name.toLowerCase().includes(existing.name.toLowerCase());
                const amountMatch = Math.abs(parseFloat(existing.amount) - parseFloat(newItem.amount)) < 0.01;
                
                return nameMatch || amountMatch;
            });
            
            if (potentialDuplicates.length > 0) {
                conflicts.push({
                    incoming: newItem,
                    existing: potentialDuplicates[0],
                    resolution: 'keep_both' // Default resolution
                });
            }
        });
        
        return {
            itemsToMigrate: convertedItems,
            conflicts: conflicts,
            hasConflicts: conflicts.length > 0,
            safeToMigrate: conflicts.length === 0
        };
    }
}