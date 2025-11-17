# Product Naming and Description Guide

## How to Rename Products and Edit Descriptions

### Location of Product Data
All products are defined in: **`client/customize-jersey-new.html`**

Search for: `const productCatalog = [`  
Line: ~654

---

## Product Structure

Each product in the `productCatalog` array has this structure:

```javascript
{
    id: 'vneck-tshirt',                    // ❌ DO NOT CHANGE - used internally
    category: 'cotton-tshirt',             // ❌ DO NOT CHANGE - used for filtering
    categoryGroup: 'shirts',               // ❌ DO NOT CHANGE - used for filtering
    garmentType: 'vneck-tshirt',          // ❌ DO NOT CHANGE - used for image loading
    folderPath: '/images/products/...',    // ❌ DO NOT CHANGE - image location
    fabricType: 'Cotton',                  // ✅ CAN CHANGE - fabric material
    name: 'V-Neck T-Shirt',               // ✅ CAN CHANGE - displayed to customer
    code: 'CT-01',                         // ✅ CAN CHANGE - product code
    price: 530,                            // ✅ CAN CHANGE - product price
    availableColors: ['Black', 'Green'],   // ❌ DO NOT CHANGE - matches folder structure
    image: '/images/products/...',         // ❌ DO NOT CHANGE - thumbnail image
    description: 'Classic V-Neck...'       // ✅ CAN CHANGE - product description
}
```

---

## What You CAN Change

### 1. Product Name (`name`)
**Current:** `'V-Neck T-Shirt'`  
**Change to anything you want:**
```javascript
name: 'Premium V-Neck Cotton Shirt'
name: 'Classic V-Neck Tee'
name: 'Comfortable V-Neck T-Shirt'
```

### 2. Product Code (`code`)
**Current:** `'CT-01'`  
**Change to your own coding system:**
```javascript
code: 'VNECK-001'
code: 'T001'
code: 'FAC-VNECK-01'  // FundamentalApparel Clothing
```

### 3. Product Price (`price`)
**Current:** `530`  
**Change to any price:**
```javascript
price: 550
price: 499
price: 600
```

### 4. Product Description (`description`)
**Current:** `'Classic V-Neck cotton t-shirt. Comfortable and breathable.'`  
**Change to your own description:**
```javascript
description: 'Soft and breathable V-neck t-shirt perfect for everyday wear. Made from 100% premium cotton.'
description: 'Classic V-neck design with comfortable fit. Ideal for sports teams and casual wear.'
description: 'High-quality cotton V-neck shirt. Available in multiple colors. Perfect for custom printing.'
```

**Tips for descriptions:**
- Keep it under 100 characters for best display
- Highlight key features (fabric, fit, use case)
- Mention if it's good for printing/customization
- Be specific about what makes it special

### 5. Fabric Type (`fabricType`)
**Current options:** `'Cotton'`, `'Dry Fit'`, `'Polyester'`, `'Polycotton'`  
**Can add more in backend model if needed**

---

## What You CANNOT Change

### ❌ ID (`id`)
Used internally to track products. Changing this will break selection.

### ❌ Category (`category`, `categoryGroup`)
Used for filtering in the modal. Changing breaks filter buttons.

### ❌ Garment Type (`garmentType`)
Tied to image loading logic and locations. Changing breaks preview.

### ❌ Folder Path (`folderPath`)
Points to actual image files. Must match folder structure.

### ❌ Available Colors (`availableColors`)
Must match the actual color folders in `/images/products/`. 

**To add/remove colors:**
1. Add/remove color folder in `/images/products/...`
2. Then update `availableColors` array

### ❌ Image Path (`image`)
Points to the thumbnail image. Must match actual file.

---

## Step-by-Step: How to Rename a Product

### Example: Renaming "V-Neck T-Shirt" to "Premium V-Neck Tee"

1. **Open the file:**
   ```
   client/customize-jersey-new.html
   ```

2. **Find the product** (search for `'V-Neck T-Shirt'` or `'vneck-tshirt'`):
   ```javascript
   {
       id: 'vneck-tshirt',
       category: 'cotton-tshirt',
       categoryGroup: 'shirts',
       garmentType: 'vneck-tshirt',
       folderPath: '/images/products/All-Shirts/cotton/V_Neck_T-Shirt',
       fabricType: 'Cotton',
       name: 'V-Neck T-Shirt',  // ← Change this line
       code: 'CT-01',
       price: 530,
       availableColors: ['Black', 'Green', 'White'],
       image: '/images/products/All-Shirts/cotton/V_Neck_T-Shirt/Black/V-Front_T-shirt.jpg',
       description: 'Classic V-Neck cotton t-shirt. Comfortable and breathable.'
   },
   ```

3. **Change the `name` field:**
   ```javascript
   name: 'Premium V-Neck Tee',
   ```

4. **Save the file** (Ctrl+S)

5. **Refresh your browser** - the new name will appear in the product catalog!

---

## Step-by-Step: How to Change Description

### Example: Making description more detailed

1. **Find the product** you want to edit

2. **Change the `description` field:**
   ```javascript
   // Before
   description: 'Classic V-Neck cotton t-shirt. Comfortable and breathable.'
   
   // After
   description: 'Soft, breathable cotton V-neck t-shirt. Perfect for custom team uniforms, events, and everyday wear. High-quality print surface.'
   ```

3. **Save and refresh**

---

## Step-by-Step: How to Change Price

### Example: Updating V-Neck price from ₱530 to ₱550

1. **Find the product**

2. **Change the `price` field:**
   ```javascript
   // Before
   price: 530,
   
   // After
   price: 550,
   ```

3. **Save and refresh**

---

## Step-by-Step: How to Change Product Code

### Example: Changing from 'CT-01' to 'FAC-VNECK-01'

1. **Find the product**

2. **Change the `code` field:**
   ```javascript
   // Before
   code: 'CT-01',
   
   // After
   code: 'FAC-VNECK-01',
   ```

3. **Save and refresh**

---

## All Products Quick Reference

### Cotton T-Shirts
1. **V-Neck T-Shirt** (`vneck-tshirt`) - Line ~656
2. **Round Neck T-Shirt** (`round-tshirt`) - Line ~669
3. **Raglan 3/4 Round Neck Shirt** (`raglan`) - Line ~682

### Polo Shirts
4. **Classic Polo Shirt** (`classic-polo`) - Line ~696
5. **Dri-Fit Polo Shirt** (`drifit-polo`) - Line ~709

### 2-Tone Polo
6. **2 Tone Polo Shirt (Unisex)** (`2tone-polo-unisex`) - Line ~722
7. **2 Tone Polo Shirt (Ladies)** (`2tone-polo-ladies`) - Line ~735

### Active Wear
8. **Dri-Fit V-Neck Shirt** (`drifit-vneck`) - Line ~748

### Jackets
9. **Pull-Up Jacket** (`pullup-jacket`) - Line ~761
10. **Polycotton Hoodie Jacket** (`hoodie-jacket`) - Line ~774

### Shorts & Pants
11. **Dri-Fit Athletic Shorts** (`drifit-short`) - Line ~787
12. **Jogging Pants** (`jogging-pants`) - Line ~800

---

## How to Add a Color to a Product

### Example: Adding "Red" to V-Neck T-Shirt

1. **First, add the folder with images:**
   ```
   /images/products/All-Shirts/cotton/V_Neck_T-Shirt/Red/
   ├── V-Front_T-shirt.jpg
   ├── V-Back_T-shirt.jpg
   ├── V-LeftSleeve_T-shirt.jpg
   └── V-RightSleeve_T-shirt.jpg
   ```

2. **Then update the product:**
   ```javascript
   // Before
   availableColors: ['Black', 'Green', 'White'],
   
   // After
   availableColors: ['Black', 'Green', 'White', 'Red'],
   ```

3. **Save and refresh** - "Red" will appear in the color dropdown!

---

## Tips for Writing Good Descriptions

### ✅ Good Examples:
```javascript
// Specific and helpful
description: 'Premium cotton polo with moisture-wicking technology. Perfect for corporate uniforms and team wear.'

// Highlights key features
description: 'Comfortable raglan sleeve design with 3/4 length. Great for sports and casual wear. Multiple color options.'

// Mentions use case
description: 'Professional scrub suit set with top and pants. Durable fabric designed for healthcare workers. Easy to customize.'
```

### ❌ Avoid:
```javascript
// Too vague
description: 'Good shirt.'

// Too long (won't display well)
description: 'This is an absolutely amazing premium quality super comfortable ultra-soft breathable moisture-wicking high-performance shirt that you will love wearing every single day for any occasion including sports, work, and casual outings with friends and family.'

// Just repeating the name
description: 'V-Neck T-Shirt'
```

---

## Testing Your Changes

After making changes:

1. **Save the file** (Ctrl+S)
2. **Open browser** → `http://localhost:3000/customize-jersey-new.html`
3. **Click "Change Product"** button
4. **Check the product card** - does it show your new name/description?
5. **Select the product** - does it work correctly?
6. **Check the order summary** - does the name display properly?

---

## Need to Change More?

### To add entirely new products:
See: `PRODUCT_CATALOG_IMAGE_GUIDE.md`

### To change categories or filters:
Requires editing the modal HTML and category buttons

### To change backend product handling:
Edit: `server/models/CustomOrder.js`

---

## Common Issues

### Issue: Changed name but old name still shows
**Solution:** Clear browser cache (Ctrl+Shift+R) or hard refresh

### Issue: Changed price but calculation is wrong
**Solution:** Make sure you only changed the `price:` field, not other pricing logic

### Issue: Product won't select after renaming
**Solution:** You probably changed `id` or `garmentType` - change them back!

### Issue: Colors don't show after adding
**Solution:** Make sure:
1. Folder name in `availableColors` matches actual folder name (case-sensitive!)
2. All required images exist in that folder
3. File names match the expected pattern

---

## Quick Checklist

When renaming products, make sure:
- [ ] Only changed `name`, `code`, `price`, or `description`
- [ ] Saved the file
- [ ] Refreshed browser
- [ ] Tested product selection
- [ ] Checked if name shows in modal
- [ ] Verified pricing calculates correctly
- [ ] Tested adding to cart
- [ ] Checked admin panel displays correctly

---

## Need Help?

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify you didn't accidentally change `id`, `garmentType`, or `folderPath`
3. Make sure JSON syntax is correct (commas, quotes, brackets)
4. Test with a single product first before changing all products
