# Services Checkout with PayMongo Integration

## Overview
This implementation provides a dedicated checkout flow for custom service orders (e.g., Customize Jersey) with PayMongo payment gateway integration. Unlike the standard product checkout, this flow excludes shipping options and focuses on service-specific details.

## Features
- ✅ Dedicated service checkout page (no shipping options)
- ✅ PayMongo payment integration (cards, GCash, GrabPay, Maya)
- ✅ Secure checkout session creation
- ✅ Payment success/cancel redirect pages
- ✅ Order reference tracking
- ✅ Mobile-responsive design with Tailwind CSS
- ✅ Real-time payment status updates via webhooks

## File Structure

### Frontend Files
```
client/
├── services-checkout.html      # Main checkout page for services
├── payment-success.html        # Success redirect page
└── payment-cancel.html         # Cancel/failure redirect page
```

### Backend Files
```
server/
├── controllers/
│   └── paymentController.js    # PayMongo integration logic
├── routes/
│   └── paymentRoutes.js        # Payment API endpoints
└── models/
    └── CustomOrder.js          # Extended with payment fields
```

## Setup Instructions

### 1. Install Dependencies
```bash
cd server
npm install node-fetch  # If not already installed (for PayMongo API calls)
```

### 2. PayMongo Account Setup

#### Sign Up
1. Go to [PayMongo Dashboard](https://dashboard.paymongo.com/signup)
2. Create an account and verify your email
3. Complete business verification (for live mode)

#### Get API Keys
1. Navigate to **Developers** > **API Keys**
2. Copy your keys:
   - **Test Secret Key**: `sk_test_...` (for sandbox testing)
   - **Test Public Key**: `pk_test_...` (for sandbox testing)
   - **Live Secret Key**: `sk_live_...` (for production)
   - **Live Public Key**: `pk_live_...` (for production)

### 3. Environment Variables

Add to your `.env` file:
```env
# PayMongo Configuration
PAYMONGO_SECRET_KEY=sk_test_your_secret_key_here
PAYMONGO_PUBLIC_KEY=pk_test_your_public_key_here

# Server URL (used for payment redirects)
SERVER_URL=https://your-domain.com
PORT=5000
```

**Important**: 
- Use `sk_test_` keys for development
- Switch to `sk_live_` keys for production
- Never commit API keys to version control

### 4. Webhook Configuration (Optional but Recommended)

PayMongo webhooks notify your server about payment status changes automatically.

#### Setup Webhook in PayMongo Dashboard:
1. Go to **Developers** > **Webhooks**
2. Click **Create Webhook**
3. Set **Webhook URL**: `https://your-domain.com/api/payments/webhook`
4. Select events:
   - `checkout_session.payment.paid`
   - `checkout_session.payment.failed`
5. Save and copy the **Webhook Secret** (for signature verification)

#### Add Webhook Secret to `.env`:
```env
PAYMONGO_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### 5. Test Payment Flow

#### Using Test Cards (Sandbox Mode):
PayMongo provides test card numbers:

**Successful Payment:**
```
Card Number: 4343 4343 4343 4345
Expiry: Any future date (e.g., 12/25)
CVC: 123
```

**Failed Payment:**
```
Card Number: 4571 7360 0000 0008
```

**GCash Test:**
- Use test mode GCash in sandbox
- Follow PayMongo's test credentials documentation

## Usage Flow

### 1. Customer Submits Design
Customer uses `customize-jersey-new.html` to create their design:
```javascript
// In customize-jersey-new.html (after successful quote submission)
const serviceData = {
  serviceName: 'Custom Jersey',
  serviceType: 'customize-jersey',
  garmentType: state.garmentType,
  printingType: state.printingType,
  quantity: effectiveQty,
  totalPrice: totalPrice,
  unitPrice: unitPrice,
  selectedLocation: state.selectedLocation,
  designText: state.designText,
  teamMode: state.teamMode,
  teamEntries: state.teamEntries,
  orderReference: data.data.quoteNumber // From server response
};

// Store for checkout
localStorage.setItem('pendingServiceCheckout', JSON.stringify(serviceData));

// Redirect to checkout
window.location.href = 'services-checkout.html';
```

### 2. Checkout Page
`services-checkout.html` loads service data and displays:
- Service summary (garment type, quantity, printing type)
- Design previews (if available)
- Contact information form
- Total amount
- Payment button

### 3. Payment Processing
When customer clicks "Proceed to Payment":
1. Frontend validates form
2. Sends request to `/api/payments/create`
3. Backend creates PayMongo checkout session
4. Customer redirected to PayMongo hosted checkout page
5. Customer completes payment (card/GCash/etc.)
6. PayMongo redirects back to success/cancel page

### 4. Payment Confirmation
- **Success**: `payment-success.html` displays confirmation
- **Cancel**: `payment-cancel.html` allows retry
- **Webhook**: Server receives payment status update

## API Endpoints

### POST `/api/payments/create`
Create PayMongo checkout session

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "orderId": "optional_existing_order_id",
  "orderReference": "ABC12345",
  "serviceType": "customize-jersey",
  "amount": 1590,
  "customerInfo": {
    "name": "Juan Dela Cruz",
    "email": "juan@example.com",
    "phone": "+639123456789",
    "notes": "Please rush order"
  },
  "serviceData": {
    "garmentType": "t-shirt",
    "quantity": 3,
    "printingType": "dye-sublimation"
  },
  "successUrl": "https://yourdomain.com/payment-success.html",
  "cancelUrl": "https://yourdomain.com/payment-cancel.html"
}
```

**Response (Success):**
```json
{
  "success": true,
  "msg": "Payment session created successfully",
  "data": {
    "checkoutUrl": "https://checkout.paymongo.com/...",
    "sessionId": "cs_...",
    "orderId": "64abc...",
    "orderReference": "ABC12345"
  }
}
```

### POST `/api/payments/webhook`
PayMongo webhook endpoint (called by PayMongo servers)

**Public endpoint** - No authentication required

### GET `/api/payments/verify/:sessionId`
Verify payment status

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "paid",
    "paymentMethod": "gcash",
    "amount": 1590
  }
}
```

## Database Schema Updates

### CustomOrder Model Extensions
```javascript
{
  // Existing fields...
  
  // New payment fields
  paymentIntentId: String,        // PayMongo checkout session ID
  paymentStatus: String,          // 'pending' | 'paid' | 'failed' | 'refunded'
  paymentMethod: String           // 'card' | 'gcash' | 'grab_pay' | 'paymaya'
}
```

## Security Best Practices

### 1. Environment Variables
- Never hardcode API keys
- Use different keys for dev/production
- Rotate keys periodically

### 2. Webhook Verification
```javascript
// Recommended: Verify webhook signatures
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return signature === expectedSignature;
}
```

### 3. HTTPS Only
- Always use HTTPS in production
- PayMongo rejects HTTP webhooks

### 4. Input Validation
- Validate all form inputs
- Sanitize customer data
- Check amount ranges (min/max)

## Testing Checklist

- [ ] Successful payment with test card
- [ ] Failed payment with declined card
- [ ] GCash payment (test mode)
- [ ] Cancel payment midway
- [ ] Webhook payment.paid event received
- [ ] Webhook payment.failed event received
- [ ] Order status updated correctly
- [ ] Email notifications sent
- [ ] Mobile responsive design
- [ ] Error handling for network issues

## Troubleshooting

### Payment Not Redirecting
**Issue**: Customer not redirected after payment

**Solution**:
1. Check `successUrl` and `cancelUrl` are absolute URLs
2. Verify CORS settings allow redirects
3. Check browser console for errors

### Webhook Not Receiving Events
**Issue**: Server not receiving webhook calls

**Solution**:
1. Verify webhook URL is publicly accessible
2. Check PayMongo dashboard > Webhooks > Logs
3. Ensure `/api/payments/webhook` returns 200 status
4. Test with PayMongo's webhook simulator

### Payment Intent Not Found
**Issue**: Order not found after payment

**Solution**:
1. Check `paymentIntentId` stored correctly
2. Verify order reference matching logic
3. Check MongoDB connection

### Test Card Not Working
**Issue**: Test card declined in sandbox

**Solution**:
1. Use exact test card numbers from PayMongo docs
2. Ensure using test API keys (sk_test_...)
3. Try different test card (success vs. failure)

## Going Live

### Pre-launch Checklist
1. [ ] Replace test keys with live keys
2. [ ] Update webhook URL to production
3. [ ] Test with real small amount
4. [ ] Verify SSL certificate valid
5. [ ] Enable email receipts
6. [ ] Set up monitoring/alerts
7. [ ] Document refund process
8. [ ] Train support team

### Production Environment Variables
```env
# Production Keys
PAYMONGO_SECRET_KEY=sk_live_actual_live_key
PAYMONGO_PUBLIC_KEY=pk_live_actual_live_key
PAYMONGO_WEBHOOK_SECRET=whsec_actual_webhook_secret

SERVER_URL=https://fundamentalapparel.com
NODE_ENV=production
```

## Support Resources

- [PayMongo API Documentation](https://developers.paymongo.com/docs)
- [PayMongo Dashboard](https://dashboard.paymongo.com)
- [PayMongo Support](mailto:support@paymongo.com)
- [Test Cards Reference](https://developers.paymongo.com/reference/test-cards)

## Additional Features (Future Enhancements)

### Recommended Additions:
1. **Payment History**: Track all payment attempts
2. **Refund Management**: Admin panel for refunds
3. **Installment Plans**: Support for 3/6-month installments
4. **Retry Failed Payments**: Auto-retry or manual retry
5. **Payment Receipts**: PDF generation and email
6. **Multi-currency**: Support USD/other currencies
7. **Discounts/Vouchers**: Apply promo codes at checkout
8. **Split Payments**: Deposit + balance workflow

---

## Quick Start Example

### Redirect to Checkout from Customizer
Add this to your `customize-jersey-new.html` after successful quote submission:

```javascript
// After quote submission success
if (json.success && json.data) {
  const orderRef = json.data.quoteNumber || json.data.orderNumber;
  
  // Prepare checkout data
  const checkoutData = {
    orderId: json.data.orderId,
    orderReference: orderRef,
    serviceName: 'Custom Jersey',
    serviceType: 'customize-jersey',
    garmentType: backendGarmentType,
    selectedLocation: state.selectedLocation,
    printingType: state.printingType,
    quantity: effectiveQty,
    totalPrice: totalPrice,
    unitPrice: unitPrice,
    teamMode: state.teamMode,
    teamEntries: state.teamEntries,
    designText: state.designText,
    // Add design previews if captured
    designPreviews: []
  };
  
  // Store and redirect
  localStorage.setItem('pendingServiceCheckout', JSON.stringify(checkoutData));
  
  // Show confirmation and redirect
  if (confirm('Quote submitted! Proceed to payment?')) {
    window.location.href = 'services-checkout.html';
  }
}
```

---

**Created**: November 2025  
**Version**: 1.0.0  
**Author**: Fundamental Apparel Development Team
