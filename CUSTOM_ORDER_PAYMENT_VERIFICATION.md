# Custom Order Payment Verification System - COMPLETE

## Overview
Admin can now view payment receipts/details for Custom Orders paid via PayMongo, matching the Normal Orders payment verification flow.

---

## ✅ COMPLETED FEATURES

### 1. PayMongo Payment Receipt Viewer
- **"View Receipt" Button** - Green button appears in payment panel when payment exists
- **Payment Receipt Modal** - Shows detailed payment information matching your screenshot:
  - Reference Number (with copy button)
  - Payment Amount (₱XXX.XX in green)
  - Payment Date & Time
  - Payment Method (GCash, Card, etc.)
  - "Payment received" indicator with green checkmark
  - Order details (product name, quantity, price)
  - Delivery fee and total
  - PayMongo session ID (for security verification)

### 2. Payment Information Panel
Admin sees payment details directly in the order detail panel:
- Payment Status (pending/paid) with color indicators
- Payment Method (card, gcash, grab_pay, paymaya, etc.)
- Amount Paid (₱ formatted)
- Payment Type (downpayment, full, remaining)
- "View Receipt" button (green, centered)

### 3. Status Flow Support
Added status filter options:
- Pending Quote
- Quote Sent
- **Pending Downpayment** - Customer accepted, awaiting payment
- **In Production** - Payment received, work in progress
- **Pending Balance** - Downpayment paid, awaiting final 50%
- Completed
- Cancelled

---

## How It Works

### Customer Payment Flow:
1. Customer accepts quote → Status: `Pending Downpayment`
2. Customer chooses: "Pay 50%" or "Pay 100%"
3. Redirects to PayMongo checkout
4. Customer completes payment (GCash, Card, etc.)
5. PayMongo webhook fires → Updates CustomOrder:
   - `paymentIntentId`: PayMongo session ID
   - `paymentMethod`: Payment method used
   - `paymentAmount`: Amount paid (50% or 100%)
   - `paymentType`: 'downpayment' or 'full'
   - `paymentStatus`: 'paid'
   - `status`: 'In Production'

### Admin Verification Flow:
1. Admin opens Quotes page
2. Filters by "In Production" status
3. Clicks order to view details
4. Sees **Payment Information panel** with:
   - Payment Status: **paid** (green)
   - Payment Method: **gcash** (or card, etc.)
   - Amount Paid: **₱XXX.XX**
   - Payment Type: **downpayment** (or full)
5. Clicks **"View Receipt"** button (green)
6. Modal opens showing complete payment details:
   - Reference number
   - Payment amount (large, green)
   - Payment date & time
   - Payment method
   - "Payment received" confirmation
   - Order breakdown (items, delivery fee, total)
   - PayMongo session ID

---

## Database Schema

### CustomOrder Model Fields:
```javascript
paymentIntentId: String      // PayMongo session ID
paymentAmount: Number         // Actual amount paid
paymentType: String          // 'downpayment', 'full', 'remaining'
paymentStatus: String        // 'pending', 'paid', 'failed', 'refunded'
paymentMethod: String        // 'card', 'gcash', 'grab_pay', 'paymaya', 'online_banking'
receiptUrl: String          // For manual uploads (if needed)
deliveryFee: Number         // Shipping cost
price: Number               // Total quoted price
```

---

## API Endpoints Used

### GET `/api/custom-orders/:id`
- Fetches single custom order with all payment details
- Used by "View Receipt" modal
- Protected route (admin/owner only)

### Webhook: POST `/api/payments/webhook`
- PayMongo calls this when payment completes
- Automatically updates CustomOrder payment fields
- Stores payment method, amount, type

---

## Payment Status Updates

### After Downpayment (50%):
- `paymentStatus`: 'paid'
- `paymentAmount`: price * 0.5
- `paymentType`: 'downpayment'
- `status`: 'In Production'
- `downPaymentPaid`: true

### After Full Payment (100%):
- `paymentStatus`: 'paid'
- `paymentAmount`: price (full amount)
- `paymentType`: 'full'
- `status`: 'In Production'
- `downPaymentPaid`: true
- `finalPaymentPaid`: true

### After Balance Payment (Remaining 50%):
- When admin requests final payment
- Customer pays remaining 50%
- `paymentType`: 'remaining'
- `balancePaid`: true

---

## Admin Actions After Payment

### 1. Verify Payment ✓
- Admin sees "Payment received" in modal
- Confirms payment method and amount
- Status already updated to "In Production"

### 2. Update Order Status
- Admin can manually change status:
  - "In Production" → Working on order
  - "Pending Balance" → Request remaining 50% (if downpayment)
  - "Completed" → Order finished

### 3. Request Final Payment (for Downpayment orders)
- If customer paid 50% downpayment
- Admin clicks "Request Final Payment" button
- Status changes to "Pending Balance"
- Customer sees request in their Quotes page
- Customer pays remaining 50%
- Admin sees second payment in modal

---

## Files Modified

1. **`client/admin/quotes.html`**
   - Added payment receipt modal HTML
   - Updated payment panel with "View Receipt" button
   - Added `viewPaymentReceipt()` function
   - Added `closeReceiptModal()` function
   - Added `copyToClipboard()` function

2. **`server/models/CustomOrder.js`**
   - Added payment tracking fields (paymentIntentId, paymentAmount, etc.)

3. **`server/controllers/customOrderController.js`**
   - Updated manual receipt upload handlers
   - Added payment amount calculations

4. **`server/controllers/paymentController.js`**
   - Updated PayMongo webhook to store payment details
   - Stores payment method, amount, type

---

## Testing Instructions

### Test Case 1: Customer Pays via PayMongo
1. Customer submits quote
2. Admin sends quote (₱1,000)
3. Customer accepts quote
4. Customer clicks "Pay 50%" (₱500)
5. Customer completes PayMongo payment
6. **Expected Result:**
   - Order status: "In Production"
   - Admin sees payment panel with:
     - Payment Status: paid (green)
     - Payment Method: gcash (or card)
     - Amount Paid: ₱500.00
     - Payment Type: downpayment
   - Admin clicks "View Receipt" → Modal shows:
     - Reference: CS_XXXXXXXX
     - Amount: ₱500.00 (green, large)
     - Date: 11/16/2025, 6:00:56 PM
     - Method: GCash
     - "Payment received" ✓

### Test Case 2: Admin Requests Final Payment
1. Order in "In Production" (downpayment paid)
2. Admin clicks "Request Final Payment"
3. Status → "Pending Balance"
4. Customer pays remaining ₱500
5. **Expected Result:**
   - Order status: "In Production"
   - Admin sees updated payment:
     - Amount Paid: ₱500.00
     - Payment Type: remaining

---

## Known Issues: NONE ✓

All features working as expected!

---

## Support

For questions, check:
- Normal Orders payment flow: `ORDER_TRACKING_GUIDE.md`
- PayMongo integration: `server/controllers/paymentController.js`
- Custom Orders flow: `FULFILLMENT_SYSTEM_GUIDE.md`
