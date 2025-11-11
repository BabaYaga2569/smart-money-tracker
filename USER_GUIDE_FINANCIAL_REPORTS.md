# Financial Reporting System - User Guide

## Overview

The Financial Reporting System provides comprehensive tracking of your bill payments, spending analysis, and financial insights. This guide will help you understand and use all the features effectively.

## Features

### 1. Enhanced Payment Recording

When you pay a bill, the system now automatically records:
- **Enhanced Metadata**: Year, quarter, payment month, category, and tags
- **Historical Archive**: Bills are archived for your records
- **Smart Categorization**: Automatic categorization for better analytics

**How it works:**
- Mark a bill as paid on the Bills page
- The system records the payment with full metadata
- The bill is archived to the `paidBills` collection
- For recurring bills, the next occurrence is automatically generated

### 2. Paid Bills Archive

View all your historical paid bills directly on the Bills page.

**How to use:**
1. Go to the **Bills** page
2. Scroll down to the **"📦 Paid Bills Archive"** section
3. Click **"▶ Show"** to expand and view your archived bills
4. See bill details including:
   - Bill name and amount
   - Payment date and method
   - Original due date
   - Category

**Features:**
- View complete payment history
- See payment methods used
- Track when bills were paid vs. when they were due
- All bills preserved for tax and record-keeping purposes

### 3. Payment History Page

Access detailed payment history with powerful filtering and export capabilities.

**Location:** Navigate to **💳 Payment History** in the sidebar

**Features:**

#### Stats Cards
- **Total Spent**: Sum of all filtered payments
- **Payment Count**: Number of payments made
- **Average Payment**: Average amount per payment

#### Filters
- **Search**: Find bills by name
- **Date Range**: Filter by payment date (From/To)
- **Category**: Filter by expense category
- **Amount Range**: Filter by minimum/maximum amount

#### Payment Table
View all payments with:
- Bill name and amount
- Category with icon
- Paid date and due date
- Payment method
- Status (on-time or overdue with days late)

#### Export to CSV
Click **"📊 Export to CSV"** to download your payment history including:
- All payment details
- Payment dates and methods
- Overdue information
- Use for tax purposes or external analysis

### 4. Reports Dashboard

Comprehensive financial analytics with beautiful charts and insights.

**Location:** Navigate to **📊 Reports** in the sidebar

**Features:**

#### Year Selector
- Choose between 2023, 2024, and 2025
- View complete annual analysis

#### Overview Statistics
- **Total Spent**: Your total spending for the year
- **Monthly Average**: Average spending per month
- **Most Expensive Month**: Highest spending month with amount
- **Least Expensive Month**: Lowest spending month with amount

#### Monthly Spending Trend Chart
- **Line chart** showing spending across all 12 months
- Visualize spending patterns and trends
- Identify peak spending periods

#### Category Breakdown Pie Chart
- **Pie chart** showing spending by category
- See percentage breakdown
- Identify top spending categories

#### Category Spending Table
Detailed breakdown including:
- Category name
- Total amount spent
- Percentage of total
- Payment count
- Average payment per category

#### Top 10 Expenses
- Ranked list of your biggest expenses
- Shows bill name, category, date, and amount
- Helps identify major spending items

#### Smart Insights
AI-powered financial analysis including:
- **Month-over-Month Comparison**: Spending changes between months
- **Biggest Expense**: Your single largest payment
- **Top Spending Category**: Where most money goes
- **Spending Trends**: 3-month trend analysis (increasing/decreasing)
- **Late Payment Alerts**: Notifications about overdue payments
- **Frequent Bills**: Identification of recurring payments

#### Export Year Report
Click **"📊 Export Report"** to download a comprehensive CSV including:
- Year summary statistics
- Monthly breakdown
- Category analysis
- All individual payments

## Navigation

### Desktop
- Access features from the left sidebar:
  - **Bills** → View and pay bills
  - **💳 Payment History** → Complete payment records
  - **📊 Reports** → Financial analytics dashboard

### Mobile/Tablet
- Tap the hamburger menu (☰) to open navigation
- Select the desired page from the menu

## Best Practices

### For Accurate Reports
1. **Categorize Bills Properly**: Ensure bills have correct categories
2. **Pay Bills Regularly**: Keep your payment history up-to-date
3. **Use Payment Methods**: Record payment methods for better tracking
4. **Review Monthly**: Check your reports monthly to track spending

### For Tax Preparation
1. Use the **Payment History** page to filter by date range
2. Export to CSV at year-end
3. Filter by category (e.g., "Utilities", "Insurance")
4. Save exports for tax records

### For Budget Planning
1. Review **Monthly Spending Trend** in Reports
2. Check **Smart Insights** for spending patterns
3. Compare **Month-over-Month** changes
4. Identify **Top Spending Categories** to reduce costs

## Data Security

- All financial data is stored securely in Firebase
- Payment records are encrypted
- Access requires authentication
- Data is backed up automatically

## Troubleshooting

### No payments showing in Payment History
- **Solution**: Pay at least one bill to start tracking
- Payments appear immediately after marking a bill as paid

### Reports showing "No Data Available"
- **Solution**: Ensure you've paid bills in the selected year
- Switch to a different year if needed

### CSV export not working
- **Solution**: Ensure you have payments to export
- Try clearing browser cache
- Check browser's download settings

### Charts not displaying
- **Solution**: Ensure you have multiple months of data
- Try refreshing the page
- Check that you selected a year with payment data

## FAQs

**Q: How far back does my payment history go?**
A: Payment history includes all payments since you started using the enhanced system. Historical bills may need to be manually entered.

**Q: Can I edit or delete archived paid bills?**
A: Archived bills are for historical reference only. Contact support if you need to make corrections.

**Q: Are recurring bills tracked separately?**
A: Yes, recurring bills are identified with tags and tracked in the payment history.

**Q: Can I export data for multiple years?**
A: Yes, use the Payment History page without date filters and export to CSV for all-time data.

**Q: How are categories determined?**
A: Categories are assigned when creating bills. You can edit bill categories before paying.

**Q: What happens when I pay a recurring bill?**
A: The system:
1. Records the payment with full metadata
2. Archives the paid bill
3. Automatically generates the next occurrence
4. Updates the recurring template

## Support

For additional help or to report issues:
- Check the in-app Help section on the Bills page
- Review the Smart Money Tracker documentation
- Contact support through the Settings page

## Version Information

**Financial Reporting System v1.0**
- Released: 2025
- Compatible with: Smart Money Tracker v2.0+
- Dependencies: Chart.js v4.5+, React v19+

---

*Last Updated: January 2025*
