# 🔧 Custom Order Form Submission - FIXED

## Problem Identified
**Error Message**: "Failed to submit order. Please try again."

**Root Cause**: Field name mismatch between frontend form data and backend expectations.

---

## ✅ What Was Fixed

### 1. **Frontend Field Mapping** (`client/services.html`)

#### **Before (WRONG):**
```javascript
formData.append('designMethod', ...);  // ❌ Backend doesn't recognize this
formData.append('logo', logoFile);     // ❌ Should be 'logoFile'
formData.append('design', designFile); // ❌ Should be 'designFile'
```

#### **After (CORRECT):**
```javascript
formData.append('customType', 'Template' or 'FileUpload');  // ✅ Backend expects this
formData.append('logoFile', logoFile);                       // ✅ Matches multer config
formData.append('designFile', designFile);                   // ✅ Matches multer config
formData.append('includeTeamMembers', 'true' or 'false');   // ✅ Boolean as string
formData.append('shortsSameDesign', 'true' or 'false');     // ✅ Boolean as string
```

---

### 2. **Required Fields Added**

The backend expects these fields that were missing:

| Field | Value | Purpose |
|-------|-------|---------|
| `customType` | 'Template' or 'FileUpload' | Identifies design method |
| `productName` | 'Custom Jersey' | Order title |
| `itemType` | 'jersey' | Type of apparel |
| `includeTeamMembers` | 'true' / 'false' | Boolean flag |
| `shortsSameDesign` | 'true' / 'false' | Boolean flag |
| `textPlacement` | 'center' | Text position |
| `logoType` | 'uploaded' | Logo source |
| `logoPlacement` | 'center' | Logo position |

---

### 3. **File Upload Field Names**

**Multer Configuration** (`server/routes/customOrderRoutes.js`):
```javascript
upload.fields([
    { name: 'designFile', maxCount: 1 },      // ✅
    { name: 'logoFile', maxCount: 1 },        // ✅
    { name: 'shortsDesignFile', maxCount: 1 } // ✅
])
```

**Frontend Now Sends**:
- `logoFile` - Logo image upload
- `designFile` - Custom design file (for FileUpload method)

---

### 4. **Enhanced Error Logging**

**Frontend Console Output:**
```javascript
console.log('Submitting order to:', `${API}/api/custom-orders`);
console.log('Response status:', response.status);
console.log('Response data:', data);
```

**Backend Error Details:**
```javascript
console.error("Custom Order Submit Error:", error);
console.error("Error details:", error.message);
console.error("Order data:", orderData);
```

Now shows detailed error messages in development mode.

---

## 📋 Complete Field Mapping

### **Frontend → Backend**

```javascript
// ===== SERVICE INFO =====
serviceType: 'customize-jersey'
customType: 'Template' or 'FileUpload'
productName: 'Custom Jersey'

// ===== BASIC INFO =====
quantity: number
notes: string
itemType: 'jersey'
printingType: 'dye-sublimation' | 'heat-transfer' | 'vinyl-print'

// ===== COLORS =====
primaryColor: '#hexcode'
secondaryColor: '#hexcode'
accentColor: '#hexcode'

// ===== TEXT =====
customText: string
textFont: string
textSize: string
textPlacement: 'center'

// ===== LOGO =====
logoFile: File (uploaded)
logoType: 'uploaded'
logoPlacement: 'center'

// ===== TEAM MEMBERS =====
includeTeamMembers: 'true' | 'false'
teamMembers: JSON string [{ name, number, size }]

// ===== SHORTS =====
includeShorts: 'true' | 'false'
shortsSameDesign: 'true' | 'false'
shortsDesignDetails: string (if different)

// ===== DESIGN FILE (for FileUpload method) =====
designFile: File (uploaded)
```

---

## 🧪 Testing Checklist

### **Test Case 1: Template Customization**
1. ✅ Select "Customize Jersey" radio
2. ✅ Choose colors (primary, secondary, accent)
3. ✅ Enter custom text
4. ✅ Select font and size
5. ✅ Upload logo (optional)
6. ✅ Enter quantity
7. ✅ Add team members (auto-generated)
8. ✅ Toggle shorts options
9. ✅ Click "Submit Custom Order"

**Expected**: Success message → Redirect to profile.html

### **Test Case 2: File Upload**
1. ✅ Select "Upload Design" radio
2. ✅ Upload design file (required)
3. ✅ Enter quantity
4. ✅ Add team members
5. ✅ Click "Submit Custom Order"

**Expected**: Success message → Redirect to profile.html

### **Test Case 3: With Shorts (Different Design)**
1. ✅ Fill basic jersey details
2. ✅ Check "Include Shorts"
3. ✅ Select "Different Design"
4. ✅ Choose shorts colors
5. ✅ Add shorts notes
6. ✅ Click "Submit Custom Order"

**Expected**: Success message with shorts details saved

---

## 🐛 Debugging Guide

### **If Error Persists:**

#### **Step 1: Check Browser Console**
Open DevTools (F12) → Console tab

Look for:
```javascript
Submitting order to: https://fundamental-apparel-backend.onrender.com/api/custom-orders
Response status: 500 (or 400, 401, etc.)
Response data: { success: false, msg: "...", error: "..." }
```

#### **Step 2: Check Server Terminal**
Look for:
```
Custom Order Submit Error: ValidationError: ...
Error details: teamMembers.0.name: Path `name` is required.
```

#### **Step 3: Check Network Tab**
DevTools → Network tab → Click failed request

**Check:**
- **Request Headers**: Should have `Authorization: Bearer <token>`
- **Request Payload**: Verify all fields are present
- **Response**: Check actual error message

---

## 🔍 Common Errors & Solutions

### **Error 1: "Missing required field: quantity"**
**Cause**: Quantity input is empty
**Fix**: Make sure quantity input has a value >= 1

### **Error 2: "A design file is required for File Upload mode"**
**Cause**: Selected "Upload Design" but no file uploaded
**Fix**: Upload a design file or switch to "Customize Jersey"

### **Error 3: "Authentication error"**
**Cause**: No token or expired token
**Fix**: Log in again to get fresh token

### **Error 4: "File type not allowed"**
**Cause**: Uploaded unsupported file format
**Allowed**: jpg, png, webp, zip, rar, psd, ai, pdf
**Fix**: Convert file to supported format

### **Error 5: "Validation Error: teamMembers.0.name required"**
**Cause**: Team member fields are empty
**Fix**: Auto-generated forms should fill, check if inputs exist

---

## 📝 Data Flow

```
┌─────────────────────────────────────────┐
│  FRONTEND (services.html)               │
│  User fills form + uploads files        │
└───────────────┬─────────────────────────┘
                │
                │ FormData with:
                │ - customType: 'Template'
                │ - quantity: 5
                │ - teamMembers: JSON
                │ - logoFile: File
                │ - printingType: 'dye-sublimation'
                │
                ▼
┌─────────────────────────────────────────┐
│  MULTER MIDDLEWARE                      │
│  Processes file uploads                 │
│  - Saves to /uploads/custom-designs/    │
│  - Adds to req.files                    │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  BACKEND (customOrderController.js)     │
│  - Extracts fields from req.body        │
│  - Builds orderData object              │
│  - Handles file URLs from req.files     │
│  - Validates required fields            │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  DATABASE (CustomOrder model)           │
│  - Saves complete order                 │
│  - Returns created document             │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  RESPONSE                               │
│  { success: true, data: {...} }         │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  FRONTEND SUCCESS                       │
│  - Alert: "Order submitted!"            │
│  - Redirect to profile.html             │
└─────────────────────────────────────────┘
```

---

## ✅ Verification Steps

### **1. Clear Browser Cache**
```
Ctrl + Shift + Delete → Clear cached files
```

### **2. Hard Refresh Page**
```
Ctrl + F5
```

### **3. Open Browser Console**
```
F12 → Console tab
```

### **4. Fill Form & Submit**
Watch console for:
- "Submitting order to: ..."
- "Response status: 201"
- "Response data: { success: true }"

### **5. Check Server Logs**
Server terminal should show:
```
POST /api/custom-orders 201 - 150ms
```

### **6. Check Database**
Orders should appear in:
- Admin dashboard → Orders page
- User profile → My Orders tab

---

## 🎯 Next Steps

1. **Test all three service types:**
   - ✅ Customize Jersey
   - ✅ Layout Creation
   - ✅ Printing Only

2. **Test with different combinations:**
   - Template vs File Upload
   - With/without logo
   - With/without shorts
   - Different quantities

3. **Check admin view:**
   - Go to `admin/orders.html`
   - Verify custom orders appear
   - Check all fields display correctly

---

## 📞 If Still Not Working

**Run these commands to get detailed logs:**

```powershell
# Check if server is running
Get-Process node

# Check ngrok status
Invoke-WebRequest -Uri "http://localhost:4040/api/tunnels" | ConvertFrom-Json

# Test endpoint directly
$token = "your-token-here"
Invoke-WebRequest -Uri "https://fundamental-apparel-backend.onrender.com/api/custom-orders" `
  -Method POST `
  -Headers @{Authorization="Bearer $token"} `
  -Body @{serviceType='customize-jersey';quantity=1} `
  -ContentType "application/json"
```

**Share these details:**
1. Browser console errors
2. Network tab response
3. Server terminal output
4. Screenshots of form before submission

---

## 🎉 Success Indicators

**When working correctly, you'll see:**

✅ Browser console: "Response status: 201"
✅ Success alert: "Custom order submitted successfully!"
✅ Auto-redirect to profile.html
✅ Order appears in profile "My Orders" tab
✅ Admin can see order in orders dashboard

---

**Date Fixed**: November 13, 2025
**Files Modified**: 
- `client/services.html` (handleJerseyFormSubmit function)
- `server/controllers/customOrderController.js` (error logging)

**Status**: ✅ READY FOR TESTING
