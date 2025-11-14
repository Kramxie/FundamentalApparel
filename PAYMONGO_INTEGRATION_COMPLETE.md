# PayMongo Integration - Complete Implementation

## Overview
Both product and service checkout pages have been updated to use PayMongo payment gateway with **GCash and Credit/Debit Card only**. Receipt upload functionality has been removed.

---

## 🎯 Changes Summary

### Frontend Changes

#### 1. **Product Checkout (checkout.html)**
**Location:** `client/checkout.html`

**Changes Made:**
- ✅ Removed receipt upload section (file input, bank transfer option)
- ✅ Added PayMongo payment method selection:
  - GCash (default selected)
  - Credit/Debit Card (Visa, Mastercard, JCB)
- ✅ Updated `submitOrder` function to create PayMongo checkout sessions
- ✅ Changed button text to "Proceed to Secure Payment"
- ✅ Payment flow: Client → `/api/payments/create-order` → PayMongo hosted checkout

**Payment Method UI:**
```html
<label class="flex items-center justify-between border-2 rounded-lg p-4 cursor-pointer">
  <input type="radio" name="payment_method" id="pay-gcash" checked>
  <span>GCash</span>
  <img src="..." alt="GCash">
</label>

<label class="flex items-center justify-between border-2 rounded-lg p-4 cursor-pointer">
  <input type="radio" name="payment_method" id="pay-card">
  <span>Credit/Debit Card</span>
  <div class="flex gap-1">
    <img src="..." alt="Visa">
    <img src="..." alt="Mastercard">
  </div>
</label>
```

#### 2. **Services Checkout (services-checkout.html)**
**Location:** `client/services-checkout.html`

**Changes Made:**
- ✅ Updated payment section to match product checkout pattern
- ✅ Added GCash/Card radio button selection
- ✅ Updated `handlePaymentSubmit` to send `paymentMethod` parameter
- ✅ Changed button text to "Proceed to Secure Payment"
- ✅ Payment flow: Client → `/api/payments/create` → PayMongo hosted checkout

---

### Backend Changes

#### 3. **Payment Controller**
**Location:** `server/controllers/paymentController.js`

**New Functions:**
- ✅ `createOrderPaymentSession`: Creates PayMongo checkout session for product orders
- ✅ Updated webhook handlers to support both product and service orders

**Key Features:**
```javascript
exports.createOrderPaymentSession = async (req, res) => {
  // Validates items, shipping address, payment method
  // Creates Order document
  // Generates PayMongo checkout session
  // Returns checkout URL for redirect
}
```

**Validation Rules:**
- Payment method must be 'gcash' or 'card'
- Amount must be > 0
- Items array required
- Shipping address required

**Payment Method Mapping:**
- `gcash` → PayMongo payment type: `['gcash']`
- `card` → PayMongo payment type: `['card']`

#### 4. **Payment Routes**
**Location:** `server/routes/paymentRoutes.js`

**New Routes:**
- ✅ `POST /api/payments/create-order` - Create checkout session for product orders (protected)

**All Routes:**
```javascript
POST   /api/payments/create         // Services (protected)
POST   /api/payments/create-order   // Products (protected)
POST   /api/payments/webhook        // Webhook callback (public)
GET    /api/payments/verify/:id     // Verify payment status (protected)
```

#### 5. **Order Model**
**Location:** `server/models/Order.js`

**Schema Updates:**
```javascript
paymentMethod: {
  type: String,
  enum: ['GCash', 'BankTransfer', 'card'],  // Added 'card'
  default: 'GCash'
}

paymentIntentId: { type: String }  // NEW: PayMongo session ID

receiptUrl: { type: String }  // Deprecated but kept for backward compatibility
```

#### 6. **Webhook Handler Updates**
**Updated Functions:**
- ✅ `handlePaymentSuccess`: Now checks both `Order` and `CustomOrder` models
- ✅ `handlePaymentFailure`: Now checks both `Order` and `CustomOrder` models

**Logic:**
1. Search for CustomOrder (services) by paymentIntentId or reference
2. If not found, search for Order (products)
3. Update payment status accordingly:
   - **Product Orders**: `paymentStatus = 'Received'`, `status = 'Processing'`, `isPaid = true`
   - **Service Orders**: `paymentStatus = 'paid'`, `status = 'Quote Accepted'`, `downPaymentPaid = true`

---

## 🔐 Payment Flow

### Product Orders Flow
```
User clicks "Proceed to Secure Payment"
     ↓
Frontend reads selected payment method (gcash/card)
     ↓
POST /api/payments/create-order
  - items[]
  - shippingAddress{}
  - amount
  - paymentMethod
     ↓
Backend creates Order document (status: Pending)
     ↓
Backend calls PayMongo API
  - Creates checkout session
  - payment_method_types: ['gcash'] or ['card']
     ↓
Returns checkout URL
     ↓
Frontend redirects to PayMongo hosted checkout
     ↓
User completes payment
     ↓
PayMongo calls /api/payments/webhook
     ↓
Backend updates Order:
  - paymentStatus: 'Received'
  - status: 'Processing'
  - isPaid: true
     ↓
User redirected to payment-success.html?ref=XXX&type=order
```

### Service Orders Flow
```
User clicks "Proceed to Secure Payment"
     ↓
Frontend reads selected payment method (gcash/card)
     ↓
POST /api/payments/create
  - serviceData{}
  - amount
  - paymentMethod
  - customerInfo{}
     ↓
Backend creates CustomOrder document
     ↓
Backend calls PayMongo API
     ↓
Returns checkout URL
     ↓
Frontend redirects to PayMongo
     ↓
User completes payment
     ↓
Webhook updates CustomOrder:
  - paymentStatus: 'paid'
  - status: 'Quote Accepted'
     ↓
User redirected to payment-success.html?ref=XXX
```

---

## 🧪 Testing Checklist

### Product Checkout Testing
- [ ] Add items to cart
- [ ] Navigate to checkout
- [ ] Fill in shipping address
- [ ] Select GCash payment method
- [ ] Click "Proceed to Secure Payment"
- [ ] Verify redirect to PayMongo checkout
- [ ] Complete test payment (use PayMongo test card)
- [ ] Verify redirect to payment-success.html
- [ ] Check Order in database (paymentStatus: 'Received', status: 'Processing')

### Service Checkout Testing
- [ ] Create custom jersey design
- [ ] Navigate to services-checkout
- [ ] Fill in contact information
- [ ] Select Card payment method
- [ ] Click "Proceed to Secure Payment"
- [ ] Verify redirect to PayMongo checkout
- [ ] Complete test payment
- [ ] Verify redirect to payment-success.html
- [ ] Check CustomOrder in database (paymentStatus: 'paid', status: 'Quote Accepted')

### PayMongo Test Credentials
```javascript
// Test Credit Card
Card Number: 4343 4343 4343 4345
Expiry: Any future date (e.g., 12/25)
CVV: Any 3 digits (e.g., 123)

// Test GCash
Phone: 09123456789
OTP: 123456
```

---

## 📋 Environment Variables

Add these to your `.env` file:

```env
# PayMongo API Keys
PAYMONGO_SECRET_KEY=sk_test_your_secret_key_here
PAYMONGO_PUBLIC_KEY=pk_test_your_public_key_here

# Server URL for redirects
SERVER_URL=https://your-ngrok-url.ngrok-free.dev
```

---

## 🚨 Important Notes

### 1. **Payment Methods Limited**
Only GCash and Credit/Debit Card are enabled. Other methods (GrabPay, PayMaya, online banking) are **not** included.

### 2. **Receipt Upload Removed**
The old receipt upload system has been completely removed from the product checkout. All payments now go through PayMongo.

### 3. **Backward Compatibility**
- `receiptUrl` field is kept in Order model for old orders
- Admin dashboard may need updates to handle PayMongo orders differently

### 4. **Webhook Configuration**
PayMongo webhooks must be configured in the PayMongo dashboard:
- **Webhook URL**: `https://your-ngrok-url.ngrok-free.dev/api/payments/webhook`
- **Events to listen**: `checkout_session.payment.paid`, `checkout_session.payment.failed`

### 5. **Success/Cancel Pages**
- Product orders: `?type=order` parameter added to distinguish from service orders
- Service orders: No type parameter
- Both use the same `payment-success.html` and `payment-cancel.html` pages

---

## 📦 Files Modified

### Frontend
1. `client/checkout.html` - Product checkout PayMongo integration
2. `client/services-checkout.html` - Service checkout PayMongo updates

### Backend
3. `server/controllers/paymentController.js` - Added `createOrderPaymentSession`, updated webhooks
4. `server/routes/paymentRoutes.js` - Added `/create-order` route
5. `server/models/Order.js` - Added `paymentIntentId`, updated `paymentMethod` enum

---

## 🎨 UI Improvements

### Payment Method Selection
- Radio buttons with hover effects
- Payment provider logos (GCash, Visa, Mastercard)
- Clear visual feedback for selected method
- Mobile-responsive design

### Security Indicators
- Shield icon with "Secure Payment via PayMongo" message
- SSL/TLS encryption notice
- Accepted payment methods display

### Button States
- Loading spinner during payment session creation
- Disabled state while processing
- Clear error messages on failure

---

## 🔄 Next Steps

1. **Configure PayMongo Account**
   - Sign up at https://paymongo.com
   - Get API keys from dashboard
   - Configure webhook URL

2. **Update Environment Variables**
   - Add PayMongo keys to `.env`
   - Update `SERVER_URL` with ngrok URL

3. **Test Payment Flows**
   - Use PayMongo test credentials
   - Verify both product and service checkouts
   - Check webhook callbacks

4. **Admin Dashboard Updates** (Optional)
   - Display PayMongo payment details in order view
   - Show payment method (GCash/Card)
   - Add PayMongo transaction ID

5. **Email Notifications** (TODO)
   - Send confirmation email after successful payment
   - Include order reference and payment details

---

## 💡 Developer Notes

### Why GCash/Card Only?
- Simplified user experience (2 clear options)
- Most popular payment methods in Philippines
- Reduces UI complexity
- Easier testing and maintenance

### Why Remove Receipt Upload?
- Security concerns with manual verification
- Automated payment gateway is more reliable
- Faster order processing
- Better user experience

### Order Status Flow
**Product Orders:**
```
Pending → (PayMongo) → Received → Processing → Shipped → Delivered
```

**Service Orders:**
```
Pending Quote → (PayMongo) → Quote Accepted → In Production → Completed
```

---

## 📞 Support

- **PayMongo Docs**: https://developers.paymongo.com/docs
- **PayMongo Support**: support@paymongo.com
- **Test Mode**: Use sandbox keys for testing, live keys for production

---

**Implementation Date:** January 2025  
**Status:** ✅ Complete and Ready for Testing
