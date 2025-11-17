# Payment Flow Test Guide

## What Was Fixed

### 1. **Final Payment Status Not Updating**
- **Problem**: After paying final payment, order stayed at "Pending Balance" status
- **Root Cause**: PayMongo webhooks can't reach localhost during testing
- **Solution**: Added manual payment sync endpoint + automatic client-side polling that:
  - Detects when user returns from PayMongo payment
  - Automatically calls `/api/payments/sync/:orderId` to check payment status
  - Updates order status in real-time without page refresh

### 2. **100% Payment Orders Showing "Request Final Payment"**
- **Problem**: Orders paid 100% upfront still showed "Request Final Payment" button in admin
- **Root Cause**: Admin UI didn't check `balancePaid` flag or `paymentType === 'full'`
- **Solution**: 
  - Admin UI now checks if `balancePaid === true` or `paymentType === 'full'`
  - If 100% paid: Hides "Request Final Payment", shows "Full Payment Received" indicator
  - When admin verifies 100% payment: Skips straight to "Completed" status

### 3. **Webhook Payment Detection Order**
- **Problem**: Webhook logic checked conditions in wrong order
- **Solution**: Reordered checks:
  1. Remaining balance (Pending Balance status) - highest priority
  2. Full payment (100%) - check total amount
  3. Downpayment (50%) - check half amount
  4. Fallback for edge cases

---

## Test Scenarios

### Test 1: 50% Downpayment Flow ✅

**Expected Flow:**
```
Quote Sent 
  → Customer pays 50%
  → Pending Downpayment 
  → Admin verifies
  → In Production 
  → Admin requests final payment
  → Pending Balance
  → Customer pays remaining 50%
  → Pending Final Verification
  → Admin verifies
  → Completed
```

**Steps:**
1. Customer goes to Customize Apparel and creates order
2. Admin sends quote with price (e.g., ₱10,000)
3. Customer clicks "Accept Quote"
4. Customer clicks "Pay 50% Downpayment" (₱5,000)
5. Completes payment on PayMongo test mode
6. **After redirect back:** Watch for blue "Verifying payment status..." notification
7. **Should auto-update to:** Green "Payment verified successfully!" notification
8. Order status should change to "In Production"
9. Admin opens order → clicks "Request Final Payment"
10. Customer sees "Pay Final Payment" button
11. Customer clicks it → pays remaining ₱5,000
12. **After redirect:** Auto-sync should trigger again
13. Status should update to "Pending Final Verification"
14. Admin verifies final payment
15. Status → "Completed"

---

### Test 2: 100% Full Payment Flow ✅

**Expected Flow:**
```
Quote Sent 
  → Customer pays 100%
  → Pending Downpayment 
  → Admin verifies
  → Completed (SKIP Request Final Payment)
```

**Steps:**
1. Customer creates order
2. Admin sends quote (e.g., ₱10,000)
3. Customer clicks "Accept Quote"
4. Customer clicks "Pay 100% Full Amount" (₱10,000)
5. Completes payment on PayMongo
6. **After redirect:** Auto-sync triggers
7. Order status → "In Production" (webhook marks `balancePaid = true`)
8. **Admin opens order:**
   - Should see "Full Payment Received (100%)" indicator
   - Should NOT see "Request Final Payment" button
   - Should see message: "Ready to mark as completed and arrange fulfillment"
9. **Admin clicks "Verify Downpayment":**
   - Backend detects `balancePaid === true`
   - Skips "Request Final Payment" flow
   - Directly sets status to "Completed"
10. Customer receives email: "Payment Verified – Order Completed"
11. Customer can now choose fulfillment method (pickup/delivery)

---

## PayMongo Test Cards

Use these in PayMongo test mode:

### Successful Payment:
- **Card Number:** `4343 4343 4343 4345`
- **Expiry:** Any future date (e.g., 12/25)
- **CVC:** Any 3 digits (e.g., 123)
- **Name:** Any name

### Failed Payment (for testing):
- **Card Number:** `4571 7360 XXXX XXXX` (will be declined)

---

## What to Watch For

### ✅ Success Indicators:

1. **After Payment Redirect:**
   - Blue notification: "Verifying payment status..."
   - Changes to green: "Payment verified successfully!"
   - Order status updates automatically

2. **50% Payment:**
   - Status: "In Production"
   - Button appears in admin: "Request Final Payment"

3. **Final Payment:**
   - Status: "Pending Final Verification"
   - Admin sees "View Final Payment Receipt" button

4. **100% Payment:**
   - Webhook sets `balancePaid = true`
   - Admin sees "Full Payment Received" indicator
   - NO "Request Final Payment" button
   - On verify: Goes straight to "Completed"

### ❌ Common Issues:

1. **Status Not Updating After Payment:**
   - **Check:** Is auto-sync polling running? (Check browser console)
   - **Check:** Is server running? (Must be on for sync endpoint to work)
   - **Fix:** Manually refresh page, status should update within 20 seconds

2. **"Request Final Payment" Shows for 100% Payment:**
   - **Check:** Order's `balancePaid` field in database
   - **Check:** Order's `paymentType` field (should be 'full')
   - **Fix:** Clear browser cache and reload admin page

3. **Webhook Not Working:**
   - **Normal for localhost!** Webhooks can't reach local machine
   - Use the auto-sync feature we implemented instead
   - For production: Use ngrok or deploy to public server

---

## Database Verification

To manually check order status in MongoDB:

```javascript
// In MongoDB Compass or shell:
db.customorders.find({
  _id: ObjectId("YOUR_ORDER_ID")
}, {
  status: 1,
  paymentType: 1,
  paymentAmount: 1,
  downPaymentPaid: 1,
  balancePaid: 1,
  paymentMethod: 1
})
```

**Expected for 50% payment:**
```json
{
  "status": "In Production",
  "paymentType": "downpayment",
  "paymentAmount": 5000,
  "downPaymentPaid": true,
  "balancePaid": false
}
```

**Expected for 100% payment:**
```json
{
  "status": "In Production",
  "paymentType": "full",
  "paymentAmount": 10000,
  "downPaymentPaid": true,
  "balancePaid": true
}
```

---

## Server Console Logs

When payment sync runs, you should see:

```
[Payment Sync] Manually checking PayMongo status for order: 673...
[Payment Sync] PayMongo status: succeeded Payments: 1
[Payment Sync] Payment succeeded, updating order...
[PayMongo] Webhook payment analysis: { orderId: '673...', currentStatus: 'Pending Balance', ... }
[PayMongo] Detected remaining balance payment
[PayMongo] Order updated successfully: 673...
```

---

## Quick Reset (For Testing)

To reset an order for re-testing:

1. **MongoDB Compass:**
   ```javascript
   // Reset to Quote Sent status
   db.customorders.updateOne(
     { _id: ObjectId("YOUR_ORDER_ID") },
     { $set: {
       status: "Quote Sent",
       downPaymentPaid: false,
       balancePaid: false,
       paymentAmount: 0,
       paymentType: null,
       paymentIntentId: null
     }}
   )
   ```

2. **Or delete and create new order**

---

## Production Deployment Notes

When deploying to production:

1. **Use ngrok or public server** for PayMongo webhooks to work
2. Set `SERVER_URL` in `.env` to your public URL
3. Configure PayMongo webhook in dashboard:
   - URL: `https://your-domain.com/api/payments/webhook`
   - Events: `checkout_session.payment.paid`, `checkout_session.payment.failed`
4. The auto-sync will still work as backup if webhook is delayed

---

## Contact

If you encounter issues not covered here, check:
- Browser console for JavaScript errors
- Server console for backend errors
- MongoDB for database state
- PayMongo dashboard for payment status
