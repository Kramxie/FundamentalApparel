# Product Catalog Feature - Testing Guide

## Quick Test Steps

### 1. Start the Server
```powershell
cd server
npm start
```

### 2. Open the Customizer
Navigate to: `http://localhost:3000/customize-jersey-new.html`

### 3. Test Product Catalog Modal

#### Step 1: Open Modal
- Look for the blue "Change Product" button in the left panel
- Click the button
- **Expected**: Full-screen modal appears with product catalog

#### Step 2: Verify Default View
- Modal should show "All Products" filter active (blue background)
- Should display all 16 products in a grid
- Each product card should show:
  - Product image (placeholder if not uploaded yet)
  - Product name
  - Product code (e.g., PS-01, CT-02)
  - Price (₱)
  - Description (2 lines max)
  - Blue "Select" button

#### Step 3: Test Category Filters
Click each category button in the left sidebar:

**All Products** (Default)
- Should show all 16 products

**Shirts**
- Should show 9 products total
- Includes: Polo, Cotton T-Shirt, Active Wear products

**Polo Shirt**
- Should show 3 products:
  - Classic Polo Shirt (PS-01) - ₱680
  - Performance Polo Shirt (PS-02) - ₱780
  - 2 Tone Polo Shirt (PS-03) - ₱750

**Cotton T-Shirt**
- Should show 3 products:
  - V-Neck Cotton T-Shirt (CT-01) - ₱530
  - Round Neck Cotton T-Shirt (CT-02) - ₱630
  - Long Sleeve Cotton Shirt (CT-03) - ₱680

**Active Wear**
- Should show 3 products:
  - Dri-Fit V-Neck Shirt (DF-01) - ₱700
  - Dri-Fit Crew Neck Shirt (DF-02) - ₱720
  - Raglan Active Shirt (RA-01) - ₱750

**2 Tone Polo**
- Should show 1 product:
  - 2 Tone Polo Shirt (PS-03) - ₱750

**Pull-Up Jacket**
- Should show 1 product:
  - Pull-Up Jacket (JK-01) - ₱950

**Zipper Jacket**
- Should show 1 product:
  - Zipper Jacket (JK-02) - ₱1050

**Dri-Fit Short**
- Should show 1 product:
  - Dri-Fit Athletic Shorts (SH-01) - ₱550

**Jogging Pants**
- Should show 1 product:
  - Jogging Pants (JP-01) - ₱650

**Scrub Suit**
- Should show 1 product:
  - Medical Scrub Suit (WW-01) - ₱850

**Fabric Banner**
- Should show 1 product:
  - Fabric Banner (BN-01) - ₱450

#### Step 4: Test Product Selection
1. Click "Select" button on any product
2. **Expected**:
   - Modal closes
   - Left panel updates with selected product info
   - Product name appears
   - Product image appears (or placeholder)
   - Product description appears
   - Right panel "Placement Location" buttons update based on product type
   - Center preview area may show placeholder (actual preview needs images)

#### Step 5: Test Close Button
- Reopen modal by clicking "Change Product"
- Click the "×" close button in top-right corner
- **Expected**: Modal closes without changing selection

#### Step 6: Test Multiple Selections
1. Select a Cotton T-Shirt
2. Note the location options (Front, Back, Left Sleeve, Right Sleeve)
3. Reopen modal
4. Select Jogging Pants
5. **Expected**: Location options change to (Front, Back)
6. Reopen modal
7. Select Scrub Suit
8. **Expected**: Location options change to (Top Front, Top Back, Pants Front, Pants Back)
9. Reopen modal
10. Select Fabric Banner
11. **Expected**: Location option changes to (Full Design)

### 4. Test Backend Integration

#### Test Custom Order Submission
1. Select a product (e.g., Dri-Fit V-Neck)
2. Select fabric type (Cotton/Dry Fit/Polyester)
3. Select printing type
4. Add some design elements (text/image)
5. Fill in team details if needed
6. Click "Add to Cart" or submit order
7. **Expected**: 
   - No console errors
   - Order submitted successfully
   - Admin panel receives order with correct garmentType

#### Check Admin Panel
1. Navigate to admin panel: `http://localhost:3000/admin/orders.html`
2. Find the submitted order
3. **Expected**:
   - Order displays with correct product name
   - garmentType field contains correct value (drifit, polo, etc.)
   - fabricType field shows selection
   - All other fields populated correctly

### 5. Browser Console Checks

Open Developer Tools (F12) and check Console tab:

**Expected Messages (OK):**
```
Loading image: /images/...
Selected product: {id: "...", name: "...", ...}
```

**Error Messages (NOT OK - needs fixing):**
```
Failed to load resource: /images/products/...jpg (404)
TypeError: Cannot read property '...' of undefined
ReferenceError: openProductCatalog is not defined
```

### 6. Responsive Design Test

#### Desktop (1920x1080)
- Product grid shows 3 columns
- Modal takes 80% of screen width
- Category sidebar visible on left

#### Tablet (768x1024)
- Product grid shows 2 columns
- Modal takes 90% of screen width
- Category sidebar still visible

#### Mobile (375x667)
- Product grid shows 1 column
- Modal takes full screen width
- Category sidebar scrollable

### 7. Image Fallback Test

**Current State:** Product images don't exist yet

**Expected Behavior:**
- Placeholder images from placeholder.com appear
- Each placeholder shows product name as text
- "Select" button still works
- No broken image icons

**When You Add Images:**
- Create folder: `/images/products/polo/`
- Add file: `classic-polo.jpg`
- Refresh page and select Polo category
- Image should load instead of placeholder

## Common Issues & Fixes

### Issue 1: "openProductCatalog is not defined"
**Cause**: JavaScript function not loaded
**Fix**: Check browser console for syntax errors in HTML file

### Issue 2: Modal doesn't appear
**Cause**: Hidden class not removed or CSS issue
**Fix**: 
- Check element in DevTools
- Verify `classList.remove('hidden')` executes
- Check z-index CSS values

### Issue 3: Products don't filter
**Cause**: Category name mismatch
**Fix**: Verify category values in `productCatalog` array match filter buttons

### Issue 4: Product selection doesn't update UI
**Cause**: Element IDs don't match or elements don't exist
**Fix**: Check these elements exist:
- `selected-product-name`
- `selected-product-image`
- `selected-product-description`
- `selected-product-info`
- `summary-product`

### Issue 5: Backend rejects garmentType
**Cause**: Model enum not updated
**Fix**: Verify `server/models/CustomOrder.js` has new garmentType values

### Issue 6: Locations don't update
**Cause**: garmentType not in locations object
**Fix**: Check `locations` object includes the garmentType with fallback

## Performance Checks

### Load Time
- Initial page load: < 3 seconds
- Modal open: < 500ms
- Category filter: < 200ms
- Product selection: < 300ms

### Memory Usage
- Check browser Task Manager
- Should not increase significantly with multiple modal opens/closes
- No memory leaks after 10+ product selections

## Accessibility Checks

### Keyboard Navigation
- [ ] Tab key navigates through category buttons
- [ ] Enter key selects product
- [ ] Escape key closes modal

### Screen Reader
- [ ] Button labels are descriptive
- [ ] Product information is readable
- [ ] Modal has proper ARIA attributes

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Safari (if available)

## Success Criteria

✅ All 16 products display correctly
✅ All 15 category filters work
✅ Product selection updates state
✅ Location buttons update based on garment
✅ Modal opens and closes smoothly
✅ No JavaScript console errors
✅ Backend accepts new garmentType values
✅ Responsive on mobile/tablet/desktop
✅ Image fallbacks work correctly
✅ "Change Product" button visible and functional

## Next Steps After Testing

1. **Add Product Images**
   - Follow `PRODUCT_CATALOG_IMAGE_GUIDE.md`
   - Start with most popular products
   - Use 300x300px square images

2. **Customize Descriptions**
   - Edit descriptions in `productCatalog` array
   - Add more details based on actual products
   - Keep under 100 characters for card display

3. **Add Preview Images**
   - Create garment preview images for new types
   - Add to `/images/` with Front/Back/Sleeves views
   - Update `loadGarmentImage()` function if needed

4. **Test Order Flow**
   - Complete multiple orders with different products
   - Verify admin panel displays correctly
   - Check email notifications contain correct info

5. **User Feedback**
   - Show to actual users
   - Gather feedback on product selection flow
   - Adjust categories/filters based on usage patterns

## Test Report Template

```
Date: ___________
Tester: ___________
Browser: ___________

Product Catalog Modal:
[ ] Opens correctly
[ ] Displays all products
[ ] Category filters work
[ ] Product selection works
[ ] UI updates correctly
[ ] Backend accepts data

Issues Found:
1. ___________
2. ___________
3. ___________

Notes:
___________
```
