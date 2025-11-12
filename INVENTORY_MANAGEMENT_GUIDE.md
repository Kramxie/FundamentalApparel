# Inventory Management System Guide

## Overview
The unified inventory management system combines fabrics/materials and products into one comprehensive dashboard, allowing administrators to track stock levels, manage suppliers, and receive low-stock alerts.

## Features

### Core Features
- **Unified Dashboard**: Single interface for both fabric/material and product inventory
- **Real-time Status Tracking**: Automatic status calculation (In Stock, Low Stock, Out of Stock)
- **Advanced Filtering**: Filter by type (fabric/product) and status
- **Search Functionality**: Search by item name, supplier, or SKU
- **Column Sorting**: Click column headers to sort by name, quantity, or price
- **CRUD Operations**: Create, Read, Update, and Delete inventory items
- **Pagination**: Navigate through large inventories (10 items per page)
- **Low-Stock Alerts**: Visual banner showing items needing attention
- **Visual Indicators**: Color-coded rows for low-stock and out-of-stock items

### Status Auto-Calculation
The system automatically calculates inventory status based on quantity:
- **Out of Stock** (Red): Quantity = 0
- **Low Stock** (Yellow): 0 < Quantity ≤ Low Stock Threshold
- **In Stock** (Green): Quantity > Low Stock Threshold

## Backend Architecture

### 1. Database Model (`server/models/Inventory.js`)

**Schema Fields**:
- `name` (String, required): Item name
- `type` (String, required): 'fabric' or 'product'
- `quantity` (Number, required): Current stock quantity
- `unit` (String, required): Unit of measurement (e.g., meters, pieces)
- `price` (Number, required): Unit price
- `status` (String, auto): 'in_stock', 'low_stock', or 'out_of_stock'
- `lowStockThreshold` (Number, default: 10): Alert threshold
- `supplier` (String, optional): Supplier name
- `description` (String, optional): Item description
- `sku` (String, unique, optional): Stock Keeping Unit
- `lastRestocked` (Date): Last restock date

**Indexes**:
- Compound: `{name: 1, type: 1}` - For name + type queries
- Single: `{status: 1}` - For status filtering
- Compound: `{type: 1, status: 1}` - For combined filtering

**Middleware**:
- Pre-save hook automatically calculates `status` based on `quantity` and `lowStockThreshold`

### 2. Controller (`server/controllers/inventoryController.js`)

**Functions**:

1. **getAllInventory**
   - Query parameters: `type`, `status`, `search`, `page`, `limit`, `sortBy`, `sortOrder`
   - Returns: Items array, pagination metadata, alert counts

2. **getInventoryItem**
   - Get single item by ID
   - Returns: Full item details

3. **createInventoryItem**
   - Validates required fields
   - Checks SKU uniqueness
   - Auto-calculates status on save

4. **updateInventoryItem**
   - Partial updates supported
   - Checks SKU conflicts
   - Auto-updates `lastRestocked` if quantity increases

5. **deleteInventoryItem**
   - Removes item from database
   - Returns success message

6. **bulkUpdateQuantities**
   - Updates multiple items' quantities in one request
   - Body: `[{id, quantity}, {id, quantity}, ...]`

7. **getInventoryStats**
   - Returns: Total items, counts by type/status, total inventory value

### 3. Routes (`server/routes/inventoryRoutes.js`)

All routes are protected with JWT authentication and admin authorization.

**Endpoints**:
```
GET    /api/admin/inventory           - List all items (with filters/pagination)
GET    /api/admin/inventory/stats     - Get inventory statistics
POST   /api/admin/inventory           - Create new item
GET    /api/admin/inventory/:id       - Get single item
PATCH  /api/admin/inventory/:id       - Update item
DELETE /api/admin/inventory/:id       - Delete item
POST   /api/admin/inventory/bulk-update - Bulk quantity update
```

## Frontend Interface (`client/admin/inventory.html`)

### Layout Components

1. **Header**
   - Page title: "Inventory Management"
   - Logout button

2. **Alert Banner**
   - Shows count of low-stock and out-of-stock items
   - Yellow background for visibility
   - Auto-hides when no alerts

3. **Filters Section**
   - **Search**: Text input for name/supplier/SKU search (500ms debounce)
   - **Type Filter**: Dropdown (All Types, Fabric/Material, Product)
   - **Status Filter**: Dropdown (All Status, In Stock, Low Stock, Out of Stock)
   - **Add New Button**: Opens modal for creating items

4. **Inventory Table**
   - **Columns**: Item Name, Type, Quantity, Unit, Price, Status, Supplier, Actions
   - **Sortable Headers**: Name, Type, Quantity, Price (click to sort)
   - **Conditional Row Styling**:
     - Low Stock: Red background (#fee2e2)
     - Out of Stock: Darker red background (#fecaca)
   - **Status Badges**: Color-coded (green/yellow/red)
   - **Type Badges**: Purple for Fabric, Blue for Product
   - **Action Buttons**: Edit (indigo), Delete (red)

5. **Pagination Controls**
   - Shows: "Showing X to Y of Z items"
   - Page indicator: "Page X of Y"
   - Previous/Next buttons (disabled at boundaries)
   - Mobile-responsive design

### Modals

**Add/Edit Modal**:
- Fields:
  - Item Name* (text, required)
  - Type* (select: fabric/product, required)
  - Unit* (text, required)
  - Quantity* (number, min 0, required)
  - Price* (₱, number, min 0, required)
  - Low Stock Threshold (number, default 10)
  - Supplier (text)
  - SKU (text)
  - Description (textarea)
- Buttons: Cancel, Save Item
- Form validation on submit

**Delete Confirmation Modal**:
- Shows item name
- Warning message: "This action cannot be undone"
- Buttons: Cancel, Delete

## Usage Guide

### For Administrators

#### Adding New Inventory Items

1. Click "Add New Item" button in filters section
2. Fill in required fields (marked with red asterisk):
   - Item Name
   - Type (Fabric/Material or Product)
   - Quantity
   - Unit (e.g., meters, pieces, kg)
   - Price
3. Optionally set:
   - Low Stock Threshold (default: 10)
   - Supplier name
   - SKU code
   - Description
4. Click "Save Item"
5. Item appears in table with auto-calculated status

#### Editing Inventory Items

1. Click edit icon (pencil) in Actions column
2. Modal opens with current data pre-filled
3. Modify any fields
4. Click "Save Item"
5. Status auto-updates if quantity changed

#### Deleting Inventory Items

1. Click delete icon (trash) in Actions column
2. Confirmation modal appears with item name
3. Click "Delete" to confirm or "Cancel" to abort
4. Item removed from database

#### Filtering Inventory

**By Type**:
- Select "All Types", "Fabric/Material", or "Product" from Type dropdown
- Table updates immediately

**By Status**:
- Select "All Status", "In Stock", "Low Stock", or "Out of Stock"
- Table updates immediately

**By Search**:
- Type in search box (searches name, supplier, SKU)
- Results appear after 500ms (debounced)
- Clear search to show all items

#### Sorting Inventory

- Click any sortable column header (Name, Type, Quantity, Price)
- First click: Ascending order
- Second click: Descending order
- Sort indicator (arrow) shows current direction

#### Pagination

- Use Previous/Next buttons to navigate pages
- See current page and total pages in center
- View item range at left ("Showing X to Y of Z items")
- Buttons disable at first/last page

#### Monitoring Stock Levels

**Low-Stock Alert Banner**:
- Appears at top when items need attention
- Shows counts: "X item(s) running low on stock, Y item(s) out of stock"
- Click status filter to view affected items

**Visual Indicators**:
- **Red Row Background**: Item is low on stock (quantity ≤ threshold)
- **Darker Red Row**: Item is out of stock (quantity = 0)
- **Status Badges**: 
  - Green = In Stock
  - Yellow = Low Stock
  - Red = Out of Stock

### API Usage Examples

#### Get All Inventory with Filters
```javascript
fetch('/api/admin/inventory?type=fabric&status=low_stock&page=1&limit=10&sortBy=quantity&sortOrder=asc', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

#### Create New Item
```javascript
fetch('/api/admin/inventory', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    name: 'Cotton Fabric',
    type: 'fabric',
    quantity: 150,
    unit: 'meters',
    price: 250,
    lowStockThreshold: 20,
    supplier: 'ABC Textiles',
    sku: 'FAB-001'
  })
})
```

#### Update Item
```javascript
fetch('/api/admin/inventory/60d21b4667d0d8992e610c85', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    quantity: 200  // Partial update
  })
})
```

#### Bulk Update Quantities
```javascript
fetch('/api/admin/inventory/bulk-update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    updates: [
      { id: '60d21b4667d0d8992e610c85', quantity: 100 },
      { id: '60d21b4667d0d8992e610c86', quantity: 50 }
    ]
  })
})
```

## Security

### Authentication & Authorization
- All API endpoints require valid JWT token
- Only users with 'admin' role can access
- Token checked via `protect` and `authorize('admin')` middleware
- Frontend checks localStorage for `adminToken`
- Redirects to login if token missing or invalid

### Data Validation
- Required fields enforced in controller
- Number constraints: quantity/price must be ≥ 0
- SKU uniqueness checked before create/update
- Input sanitization via Mongoose schema validators

## Best Practices

### Stock Management
1. Set realistic low-stock thresholds based on item usage
2. Use SKU codes for better tracking (especially for similar items)
3. Update supplier information for quick reordering
4. Review low-stock alerts daily
5. Use bulk update for restocking multiple items

### Data Organization
1. Use consistent naming conventions
2. Include descriptive information in Description field
3. Specify accurate units (meters, pieces, kg, liters, etc.)
4. Categorize items properly (fabric vs product)

### Performance
1. Use filters to reduce large result sets
2. Leverage sorting for prioritizing restocks
3. Pagination keeps page loads fast
4. Search is debounced to reduce API calls

## Troubleshooting

### Issue: Items not appearing in table
**Solution**: 
- Check if filters are too restrictive (try "All Types" and "All Status")
- Clear search box
- Verify items exist in database
- Check browser console for API errors

### Issue: Status not updating after quantity change
**Solution**:
- Status auto-calculates on save - this is normal behavior
- Refresh page if status appears stale
- Check lowStockThreshold is set correctly

### Issue: Cannot delete item
**Solution**:
- Verify you have admin permissions
- Check if item is referenced elsewhere in system
- Check browser console for error messages

### Issue: SKU uniqueness error
**Solution**:
- SKU must be unique across all inventory items
- Leave SKU blank if not using codes
- Check for typos in existing SKUs

### Issue: Pagination stuck on empty page
**Solution**:
- Click "Previous" to go back
- Adjust filters/search to show more results
- Reset to page 1 when changing filters

## Database Schema Diagram

```
Inventory Collection
├── _id: ObjectId
├── name: String*
├── type: enum('fabric', 'product')*
├── quantity: Number*
├── unit: String*
├── price: Number*
├── status: enum('in_stock', 'low_stock', 'out_of_stock')
├── lowStockThreshold: Number (default: 10)
├── supplier: String
├── description: String
├── sku: String (unique, sparse)
├── lastRestocked: Date
├── createdAt: Date (auto)
└── updatedAt: Date (auto)

Indexes:
- {name: 1, type: 1}
- {status: 1}
- {type: 1, status: 1}
- {sku: 1} (unique, sparse)
```

## Integration with Existing Systems

The inventory system is designed to integrate with:
- **Product Management**: Track product stock separately from raw materials
- **Order Processing**: Deduct inventory when orders are fulfilled
- **Supplier Management**: Link suppliers to inventory items
- **Reports/Analytics**: Use stats endpoint for dashboard metrics

## Future Enhancements (Recommended)

1. **Automatic Reordering**: Send alerts to suppliers when stock is low
2. **Inventory History**: Track all quantity changes with timestamps
3. **Barcode Integration**: Scan barcodes to update inventory
4. **Multi-Location Support**: Track inventory across warehouses
5. **CSV Import/Export**: Bulk import items or export reports
6. **Inventory Forecasting**: Predict stock needs based on historical data
7. **Photo Uploads**: Add images to inventory items
8. **Batch/Lot Tracking**: Track items by production batch
9. **Expiration Dates**: Alert on expiring materials
10. **Inventory Reservations**: Reserve stock for pending orders

## Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Review browser console for error messages
3. Verify admin token is valid
4. Check server logs for API errors
5. Contact system administrator

## Version History

- **v1.0** (Current): Initial release with unified fabric/product inventory, filtering, sorting, CRUD operations, and low-stock alerts
