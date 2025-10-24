# 💳 Subscription Tracking & Management Feature

## Overview

This feature enables users to track and manage their recurring subscription expenses (Netflix, Spotify, gym memberships, etc.) to gain control over "subscription creep" - the silent budget killer.

## Features Implemented

### ✅ Phase 1: Core Functionality

1. **Subscription Management**
   - Add, edit, and delete subscriptions
   - Mark subscriptions as cancelled (soft delete with history)
   - Toggle essential/non-essential status
   - Real-time Firebase sync with onSnapshot

2. **Subscription Tracking**
   - Track name, cost, billing cycle (Monthly/Annual/Quarterly)
   - Link to payment method (Plaid accounts)
   - Set next renewal date and auto-renew status
   - Add custom notes

3. **Financial Calculations**
   - Monthly burn rate calculation
   - Annual projection
   - Upcoming renewals (next 7 days)
   - Active subscription count

4. **Filtering & Sorting**
   - Filter by: Billing cycle, Essential status, Category
   - Sort by: Next renewal, Cost, Name
   - Search by name, category, or notes

5. **Dashboard Integration**
   - Subscription widget showing active count and monthly burn
   - Quick navigation to subscription management

## Data Structure

### Firebase Path
```
users/{userId}/subscriptions/{subscriptionId}
```

### Subscription Object
```javascript
{
  "id": "sub001",
  "name": "Netflix",
  "category": "Entertainment",
  "cost": 15.49,
  "billingCycle": "Monthly", // "Monthly", "Annual", "Quarterly"
  "paymentMethod": "SoFi", // Display name
  "paymentMethodId": "acc_123", // Link to Plaid account ID
  "nextRenewal": "2025-10-15",
  "lastCharged": "2025-09-15", // Future enhancement
  "autoRenew": true,
  "essential": false,
  "status": "active", // "active", "cancelled", "paused"
  "cancelledDate": null,
  "notes": "Shared family 4K plan",
  "createdAt": "2025-09-01T00:00:00Z",
  "updatedAt": "2025-10-13T20:12:22Z",
  "linkedTransactionIds": [], // Future: Link to Plaid transactions
  "priceHistory": [
    { "date": "2025-09-01", "price": 15.49 }
  ]
}
```

## Files Created

### Backend
- `backend/server.js` - API endpoints for subscriptions
  - `GET /api/subscriptions` - Get all subscriptions
  - `POST /api/subscriptions` - Create subscription
  - `PUT /api/subscriptions/:id` - Update subscription
  - `DELETE /api/subscriptions/:id` - Delete subscription
  - `POST /api/subscriptions/:id/cancel` - Cancel subscription

### Frontend Components
- `frontend/src/pages/Subscriptions.jsx` - Main subscriptions page
- `frontend/src/pages/Subscriptions.css` - Styling
- `frontend/src/components/SubscriptionCard.jsx` - Individual subscription display
- `frontend/src/components/AddSubscriptionForm.jsx` - Add/Edit form modal

### Frontend Utils
- `frontend/src/utils/subscriptionCalculations.js` - Calculation utilities
- `frontend/src/utils/subscriptionCalculations.test.js` - Unit tests

### Frontend Integration
- `frontend/src/App.jsx` - Added `/subscriptions` route
- `frontend/src/components/Sidebar.jsx` - Added menu item
- `frontend/src/pages/Dashboard.jsx` - Added subscription widget
- `frontend/src/pages/Dashboard.css` - Added cyan color variant

## Usage

### Adding a Subscription

1. Navigate to **Subscriptions** in the sidebar
2. Click **+ Add Subscription** button
3. Fill in the form:
   - Name (required)
   - Category (Entertainment, Utilities, Software, etc.)
   - Cost (required)
   - Billing Cycle (Monthly/Annual/Quarterly)
   - Payment Method (select from Plaid accounts)
   - Next Renewal Date (required)
   - Auto-Renew toggle
   - Essential toggle
   - Notes (optional)
4. Click **Add Subscription**

### Managing Subscriptions

- **Edit**: Click the ✏️ Edit button on any subscription card
- **Delete**: Click the 🗑️ Delete button (permanent deletion)
- **Cancel**: Click the ❌ Cancel Sub button (soft delete, keeps history)

### Filtering & Searching

- Use filter buttons: **All**, **Monthly**, **Annual**, **Essential Only**
- Select category from dropdown
- Change sort order: Next Renewal, Cost, Name
- Use search box to find subscriptions by name, category, or notes

## Calculation Logic

### Monthly Total
```javascript
Monthly subs: Sum of cost
Annual subs: Sum of (cost / 12)
Quarterly subs: Sum of (cost / 3)
```

### Annual Total
```javascript
Annual = Monthly Total × 12
```

### Upcoming Renewals
- Filters subscriptions with `nextRenewal` within next 7 days
- Sorted by renewal date (earliest first)

## UI Components

### Summary Cards
- **Monthly Burn**: Total monthly cost across all active subscriptions
- **Annual Cost**: Projected annual cost
- **Active Subscriptions**: Count of active subscriptions

### Upcoming Renewals Section
- Shows subscriptions renewing in next 7 days
- Orange border for visibility
- Displays: Name, Cost, Renewal Date, Payment Method

### Subscription Cards
- Large display with icon and name
- Cost with billing cycle
- Metadata: Category, Payment Method, Renewal Date, Auto-renew, Essential
- Monthly equivalent for annual/quarterly subscriptions
- Notes display
- Action buttons: Edit, Delete, Cancel

### Form Modal
- Clean modal design consistent with app theme
- Validation for required fields
- Dropdown for payment methods from Plaid accounts
- Date picker for renewal date
- Checkbox toggles for auto-renew and essential

## Styling

### Color Scheme
- Primary: `#00ff88` (green) - matches app theme
- Background: `#1a1a1a` (dark)
- Border: `#333` (gray)
- Essential badge: `#ffd700` (gold) with ⭐
- Auto-renew indicator: `#4a90e2` (blue) with 🔄
- Cancelled status: `#ff6b6b` (red)
- Upcoming renewal warning: `#ff9800` (orange)

### Icons
- 🎬 Entertainment
- 🏠 Utilities
- 💻 Software
- 💪 Fitness
- 🍔 Food
- 🛍️ Shopping
- ☁️ Storage
- 📦 Other

## API Integration

All API calls use Firebase Realtime Listeners (`onSnapshot`) for automatic updates:
- No manual refresh needed
- Multi-tab sync
- Real-time updates when data changes

## Future Enhancements (Phase 2)

- Link to Plaid transactions for automatic tracking
- Auto-detect recurring charges
- Price change alerts (compare to priceHistory)
- Usage tracking
- Advanced analytics with charts
- Category breakdown pie chart
- Export to CSV
- Renewal notifications (banner on Dashboard)
- Smart warnings for excessive non-essential spending

## Testing

### Manual Testing
1. ✅ Add subscription with all fields
2. ✅ Edit existing subscription
3. ✅ Delete subscription
4. ✅ Cancel subscription
5. ✅ Filter by billing cycle
6. ✅ Filter by essential status
7. ✅ Filter by category
8. ✅ Search subscriptions
9. ✅ Sort by different fields
10. ✅ View on Dashboard widget
11. ✅ Navigate from Dashboard to Subscriptions
12. ✅ Test responsive design on mobile

### Build Status
```bash
✓ Frontend build successful
✓ No new linting errors
✓ All imports correct
✓ Real-time listeners in place
```

## Mobile Responsive

- Stacked layout on small screens
- Full-width buttons and inputs
- Flexible grid for summary cards
- Touch-friendly action buttons

## Performance

- Real-time listeners: 1 read on attach + 1 read per change
- Efficient Firebase queries
- No polling or manual refresh
- Minimal re-renders with React hooks

## Success Metrics

Users can now:
- ✅ See all recurring subscriptions in one place
- ✅ Know their total monthly subscription burn
- ✅ Get alerted about upcoming renewals
- ✅ Identify non-essential subscriptions to cut
- ✅ Track subscription costs over time

---

**Implementation Date**: 2025-10-13  
**Status**: ✅ Complete - Phase 1  
**Build Status**: ✅ Passing
