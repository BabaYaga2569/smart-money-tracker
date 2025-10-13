# 💳 Subscriptions Feature - Visual Guide

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  💳 Subscriptions                              [+ Add Subscription]     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │  Monthly Burn   │  │  Annual Cost    │  │     Active      │        │
│  │   $127.43       │  │   $1,529.16     │  │   8 subs        │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  🔔 Upcoming Renewals (Next 7 Days)                                    │
│  • Netflix - $15.49 on Oct 15 (SoFi)                                   │
│  • Spotify - $10.99 on Oct 22 (Chase)                                  │
│  • Disney+ - $13.99 on Oct 28 (AmEx)                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  [All] [Monthly] [Annual] [Essential Only]  [Category ▼]  [Sort ▼]    │
│  🔍 Search subscriptions...                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  🎬 Netflix                                      $15.49/mo        │ │
│  │  Entertainment • SoFi • Renews Oct 15 • 🔄 Auto                  │ │
│  │  Shared family 4K plan                                            │ │
│  │  [✏️ Edit] [🗑️ Delete] [❌ Cancel Sub]                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  🎵 Spotify Premium                              $10.99/mo  ⭐    │ │
│  │  Entertainment • Chase • Renews Oct 22 • 🔄 Auto                 │ │
│  │  [✏️ Edit] [🗑️ Delete] [❌ Cancel Sub]                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  ☁️ Dropbox Plus                                $119.88/yr  ⭐    │ │
│  │  Storage • AmEx • Renews Jan 5 • 🔄 Auto                         │ │
│  │  ($9.99/mo equivalent)                                            │ │
│  │  [✏️ Edit] [🗑️ Delete] [❌ Cancel Sub]                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  💪 LA Fitness                                   $90.00/qtr       │ │
│  │  Fitness • Chase • Renews Oct 20 • 🔄 Auto                       │ │
│  │  ($30.00/mo equivalent)                                           │ │
│  │  [✏️ Edit] [🗑️ Delete] [❌ Cancel Sub]                            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Legend:
⭐ = Essential subscription
🔄 = Auto-renew enabled
```

## Dashboard Widget

```
┌─────────────────────────────────────┐
│  💳 Subscriptions                   │
│  ─────────────────────────────────  │
│                                     │
│  3 active                           │
│  $127.43/mo                         │
│                                     │
│  [View All →]                       │
└─────────────────────────────────────┘
```

## Add/Edit Subscription Form

```
┌─────────────────────────────────────────────────┐
│  Add New Subscription                      [×]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Name *                                         │
│  [Netflix                              ]        │
│                                                 │
│  Category                                       │
│  [Entertainment                        ▼]       │
│                                                 │
│  Cost *              Billing Cycle              │
│  [15.49    ]         [Monthly          ▼]       │
│                                                 │
│  Payment Method                                 │
│  [SoFi Checking (...1234)              ▼]       │
│                                                 │
│  Next Renewal Date *                            │
│  [2025-10-15                           ]        │
│                                                 │
│  [✓] Auto-Renew      [✓] Essential ⭐          │
│                                                 │
│  Notes                                          │
│  ┌──────────────────────────────────────────┐  │
│  │ Shared family 4K plan                    │  │
│  │                                           │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  [Cancel]          [Add Subscription]          │
└─────────────────────────────────────────────────┘
```

## Color Scheme

### Subscription Status
- **Active**: Green border on hover (`#00ff88`)
- **Cancelled**: Red border, strikethrough text (`#ff6b6b`)
- **Paused**: Yellow border (`#ff9800`)

### Special Indicators
- **Essential (⭐)**: Gold color (`#ffd700`)
- **Auto-renew (🔄)**: Blue color (`#4a90e2`)
- **Upcoming renewal**: Orange background (`#ff9800`)

### Category Icons
| Category       | Icon |
|---------------|------|
| Entertainment | 🎬   |
| Utilities     | 🏠   |
| Software      | 💻   |
| Fitness       | 💪   |
| Food          | 🍔   |
| Shopping      | 🛍️   |
| Storage       | ☁️   |
| Other         | 📦   |

## Responsive Design

### Desktop (1200px+)
- Full 3-column summary cards
- Wide search and filter bar
- Subscription cards with all details

### Tablet (768px - 1200px)
- 2-column summary cards
- Stacked filters
- Compact subscription cards

### Mobile (< 768px)
- Single column layout
- Stacked summary cards
- Full-width filter buttons
- Simplified subscription cards
- Bottom-sheet style form modal

## User Interactions

### Hover Effects
- **Subscription Card**: Green border glow
- **Filter Button**: Background lightens
- **Action Buttons**: Border color changes to action color

### Click Actions
- **Subscription Card**: Expands to show full details (future)
- **Edit Button**: Opens form modal with pre-filled data
- **Delete Button**: Shows confirmation dialog
- **Cancel Sub**: Updates status to cancelled
- **Add Subscription**: Opens empty form modal

### Real-time Updates
- **New subscription**: Instantly appears in list
- **Edit subscription**: Live update without refresh
- **Delete subscription**: Immediately removed from list
- **Summary cards**: Auto-recalculate on any change

## Filter & Sort Behavior

### Filters (AND logic)
1. **Billing Cycle**: All, Monthly, Annual
2. **Essential Status**: All, Essential Only, Non-essential
3. **Category**: All Categories, Entertainment, Utilities, etc.
4. **Search**: Searches name, category, notes

### Sort Options
1. **Next Renewal**: Earliest first (default)
2. **Cost**: Highest first
3. **Name**: Alphabetical A-Z

### Active Filter Indicator
- Selected filters have green background (`#00ff88`)
- Unselected have gray background (`#333`)

## Empty States

### No Subscriptions Yet
```
┌─────────────────────────────────────┐
│                                     │
│         No subscriptions found      │
│                                     │
│  Add your first subscription to     │
│  start tracking your recurring      │
│  expenses!                          │
│                                     │
│     [+ Add Subscription]            │
│                                     │
└─────────────────────────────────────┘
```

### No Results After Filter
```
┌─────────────────────────────────────┐
│                                     │
│      No subscriptions match         │
│         your filters                │
│                                     │
│  Try adjusting your filters or      │
│  search term.                       │
│                                     │
└─────────────────────────────────────┘
```

## Notification Toasts

### Success
```
┌────────────────────────────────┐
│  ✓ Subscription added          │
│     successfully               │
└────────────────────────────────┘
```

### Error
```
┌────────────────────────────────┐
│  ✗ Error saving subscription   │
└────────────────────────────────┘
```

## Accessibility

- ✅ Keyboard navigation support
- ✅ ARIA labels on all interactive elements
- ✅ Focus indicators on form fields
- ✅ Screen reader friendly
- ✅ High contrast colors
- ✅ Touch-friendly button sizes (44px minimum)

## Animation & Transitions

- **Card hover**: 0.3s ease transition
- **Filter toggle**: 0.2s background color change
- **Modal open**: Fade in + scale up
- **Notification**: Slide in from right
- **List updates**: Smooth fade in/out

---

**Note**: All colors and spacing follow the existing Smart Money Tracker design system for consistency.
