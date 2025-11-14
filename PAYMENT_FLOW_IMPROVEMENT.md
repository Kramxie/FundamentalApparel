# Improved Payment Flow - Quote Acceptance to Payment

## 🎯 Overview
This document explains the improved payment workflow from quote acceptance through PayMongo payment gateway integration.

---

## 📋 Customer Side Flow

### **Step 1: View Quote**
**Location:** `client/my-quotes.html`

Customer sees quote with status **"Quote Sent"**
- Display: Quote details, pricing, and "Accept Quote" button

### **Step 2: Accept Quote**
**Action:** Click "Accept Quote" button

**What Happens:**
1. Frontend calls: `PUT /api/custom-orders/:id/accept`
2. Backend updates status: `'Quote Sent'` → `'Pending Downpayment'`
3. Page refreshes to show payment options

### **Step 3: Choose Payment Option**
**Location:** `client/my-quotes.html` (after refresh)

Customer sees **TWO payment buttons:**

```
┌─────────────────────────────────────┐
│  ✅ Quote Accepted! Choose payment: │
│                                     │
│  [💳 Pay 50% Downpayment]          │
│  [💰 Pay 100% Full Amount]         │
└─────────────────────────────────────┘
```

**Button Actions:**
- **Pay 50% Downpayment** → Calculate 50% of total, store payment option, redirect to services-checkout
- **Pay 100% Full Amount** → Use full amount, store payment option, redirect to services-checkout

### **Step 4: Services Checkout Page**
**Location:** `client/services-checkout.html`

**Displays:**
- Order summary with payment option badge
- If 50%: Yellow badge "50% Downpayment - Remaining balance due after production starts"
- If 100%: Green badge "100% Full Payment - Complete payment, no balance due"
- Contact form
- Payment method selection (GCash/Card)
- Correct amount displayed based on payment option

### **Step 5: Proceed to PayMongo**
**Action:** Click "Proceed to Secure Payment"

**What Happens:**
1. Frontend calls: `POST /api/payments/create` with:
   - `amount`: Calculated amount (50% or 100%)
   - `paymentOption`: 'downpayment' or 'full'
   - `paymentMethod`: 'gcash' or 'card'
2. Backend creates PayMongo checkout session
3. Backend updates order with payment option
4. Customer redirected to PayMongo hosted checkout

### **Step 6: Complete Payment**
**Location:** PayMongo hosted page

Customer completes payment using GCash or Credit Card

### **Step 7: Payment Success**
**What Happens:**
1. PayMongo calls webhook: `POST /api/payments/webhook`
2. Backend updates order:
   - If 50% downpayment: 
     - `status` → 'In Production'
     - `downPaymentPaid` → true
     - `paymentStatus` → 'paid'
   - If 100% full payment:
     - `status` → 'In Production'
     - `downPaymentPaid` → true
     - `finalPaymentPaid` → true
     - `paymentStatus` → 'paid'
3. Customer redirected to `payment-success.html`

---

## 👨‍💼 Admin Side Flow

### **Step 1: View Orders Dashboard**
**Location:** `client/admin/orders.html` (Custom Orders tab)

**What Admin Sees:**

#### Before Payment:
```
Order #A1B2C3D4
Status: Pending Downpayment
⚠️ Waiting for customer payment
```

#### After 50% Payment:
```
Order #A1B2C3D4
Status: In Production
✅ Downpayment Paid: ₱2,650
💳 Payment Method: GCash
🔑 PayMongo ID: cs_xxx
⏳ Balance Due: ₱2,650
```

#### After 100% Payment:
```
Order #A1B2C3D4
Status: In Production
✅ Full Payment Paid: ₱5,300
💳 Payment Method: Card
🔑 PayMongo ID: cs_xxx
✅ No Balance Due
```

### **Step 2: Admin Actions**

**For Orders with Downpayment (50%):**
- Admin can see payment details
- Can request final payment when ready
- Can track production progress

**For Orders with Full Payment (100%):**
- Admin can see payment details
- No balance collection needed
- Can proceed directly with production
- Can mark as completed when done

### **Payment Details Admin Can See:**
1. **Payment Status** - Paid/Pending
2. **Payment Method** - GCash or Card
3. **Payment Amount** - Exact amount paid
4. **PayMongo Transaction ID** - For verification
5. **Payment Option** - 50% or 100%
6. **Remaining Balance** - If applicable
7. **Payment Date/Time** - Timestamp

---

## 🔄 Complete Workflow Diagram

```
CUSTOMER SIDE                           ADMIN SIDE
─────────────────────────────────────────────────────────────

1. Admin sends quote
                                        ↓
                                   [Quote Sent]
                                   (Admin can see)
        ↓
2. Customer views quote
   [View Quote Details]
        ↓
3. Customer accepts quote
   [Accept Quote Button]
        ↓
   Status → Pending Downpayment
                                        ↓
                                   [Pending Downpayment]
                                   (Admin sees: Waiting for payment)
        ↓
4. Customer chooses payment
   [Pay 50%] or [Pay 100%]
        ↓
5. Redirected to checkout
   [services-checkout.html]
   - Shows payment option badge
   - Shows correct amount
        ↓
6. Customer proceeds to PayMongo
   [Proceed to Secure Payment]
        ↓
7. PayMongo hosted checkout
   [Customer pays via GCash/Card]
        ↓
8. Payment success
   ↓ (Webhook updates order)
   
   If 50%:                           If 100%:
   - downPaymentPaid: true           - downPaymentPaid: true
   - status: In Production           - finalPaymentPaid: true
   - Balance: ₱XXX remaining         - status: In Production
                                     - Balance: ₱0
        ↓                                    ↓
9. Customer sees success page      Admin sees payment details
   [payment-success.html]          - Transaction ID
                                   - Amount paid
                                   - Payment method
                                   - Balance (if any)
                                        ↓
                              10. Admin starts production
                                   - Can track progress
                                   - Can request balance (if 50%)
                                   - Can complete order
```

---

## 💾 Database Updates

### CustomOrder Model Fields Updated:

```javascript
{
  // Status progression
  status: 'Quote Sent' → 'Pending Downpayment' → 'In Production' → 'Completed'
  
  // Payment tracking
  paymentOption: 'downpayment' | 'full',     // NEW
  paymentStatus: 'pending' | 'paid',
  paymentIntentId: 'cs_xxx',                  // PayMongo session ID
  paymentMethod: 'gcash' | 'card',           // NEW
  
  // Payment flags
  downPaymentPaid: true/false,
  finalPaymentPaid: true/false,              // NEW (for 100% payments)
  
  // Amount tracking
  totalPrice: 5300,
  price: 5300  // Admin-set quote price
}
```

---

## 🎨 UI/UX Improvements

### Payment Option Buttons:
```html
<!-- 50% Downpayment -->
<button class="bg-green-600 text-white">
  <i class="fas fa-credit-card"></i>
  Pay 50% Downpayment
</button>

<!-- 100% Full Payment -->
<button class="bg-blue-600 text-white">
  <i class="fas fa-money-bill-wave"></i>
  Pay 100% Full Amount
</button>
```

### Payment Option Badges (Checkout Page):
```html
<!-- 50% Badge -->
<div class="bg-yellow-100 border border-yellow-300 rounded p-2">
  <i class="fas fa-info-circle"></i>
  <strong>50% Downpayment</strong>
  Remaining balance due after production starts
</div>

<!-- 100% Badge -->
<div class="bg-green-100 border border-green-300 rounded p-2">
  <i class="fas fa-check-circle"></i>
  <strong>100% Full Payment</strong>
  Complete payment, no balance due
</div>
```

---

## 🔐 Security & Validation

### Backend Validations:
- ✅ User authentication required
- ✅ Order ownership verification
- ✅ Status validation (only accept if 'Quote Sent')
- ✅ Amount validation (must match quote price)
- ✅ Payment option validation ('downpayment' or 'full')
- ✅ PayMongo webhook verification

### Payment Integrity:
- Amount calculated server-side based on payment option
- PayMongo transaction ID stored for audit trail
- Webhook ensures payment status updates are from PayMongo
- No direct receipt uploads (automated via PayMongo)

---

## 📊 Admin Benefits

### 1. **Automated Payment Verification**
- No manual receipt checking
- PayMongo confirms payment automatically
- Instant order status updates

### 2. **Clear Payment Tracking**
- See exactly what was paid (50% or 100%)
- View remaining balance
- Track payment method used
- Access PayMongo transaction ID

### 3. **Better Order Management**
- Know which orders need balance collection
- Prioritize full-payment orders
- Track production readiness

### 4. **Financial Reporting**
- Easy to see total payments received
- Track payment methods used
- Monitor downpayment vs full payment trends

---

## 🧪 Testing Checklist

### Customer Flow:
- [ ] Accept quote from my-quotes page
- [ ] See two payment options after acceptance
- [ ] Click "Pay 50% Downpayment"
- [ ] Verify correct amount shown (50% of total)
- [ ] See yellow badge "50% Downpayment"
- [ ] Complete PayMongo payment
- [ ] Verify order status changes to "In Production"
- [ ] Verify downPaymentPaid = true

### Full Payment Test:
- [ ] Accept different quote
- [ ] Click "Pay 100% Full Amount"
- [ ] Verify correct amount shown (100% of total)
- [ ] See green badge "100% Full Payment"
- [ ] Complete PayMongo payment
- [ ] Verify order status changes to "In Production"
- [ ] Verify both downPaymentPaid and finalPaymentPaid = true

### Admin View Test:
- [ ] View order in admin dashboard after 50% payment
- [ ] Verify payment details displayed
- [ ] Verify remaining balance shown
- [ ] View order after 100% payment
- [ ] Verify "No Balance Due" shown

---

## 🚀 Benefits Summary

### For Customers:
✅ Clear payment options upfront  
✅ Secure payment via PayMongo  
✅ Choose between 50% or 100%  
✅ Immediate payment confirmation  
✅ No manual receipt uploads  

### For Admin:
✅ Automated payment verification  
✅ Clear payment tracking  
✅ No manual receipt checking  
✅ Better cash flow management  
✅ Reduced workload  

### For Business:
✅ Professional payment system  
✅ Reduced payment errors  
✅ Faster order processing  
✅ Better customer experience  
✅ Automated record keeping  

---

**Implementation Date:** January 2025  
**Status:** ✅ Complete and Ready for Testing
