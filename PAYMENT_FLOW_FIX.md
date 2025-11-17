# Quick Test: Verify Payment Flow Status

## Problem Description
After paying 50% downpayment, the status should stay at "Pending Downpayment" with payment info displayed, then admin verifies to change it to "In Production".

## Quick Fix Verification

### Step 1: Restart Server
The most likely issue is that code changes haven't been loaded. **RESTART YOUR SERVER NOW**:

```powershell
cd d:\InternetLanguages\BBT\ecommerce-project
.\restart-server.ps1
```

### Step 2: Test Downpayment Flow
1. Go to a quote with status "Pending Downpayment"
2. Click "Pay 50% Downpayment"
3. Complete payment on PayMongo test mode
4. After redirect to payment-success.html, it should show:
   - ✅ "Downpayment Received!"
   - ✅ "Awaiting Admin Verification"
5. Go to my-quotes.html and check:
   - ✅ Status badge: "Pending Downpayment"
   - ✅ Blue box showing "Payment Received"
   - ✅ Shows Payment Method and Amount Paid
6. As admin, go to admin/orders.html:
   - ✅ See order with status "Pending Downpayment"
   - ✅ Click Action → "Verify Downpayment"
   - ✅ Status should change to "In Production"

### Step 3: Check Webhook Logs
Open browser console or server logs and look for:
```
[PayMongo] Processing payment success for: [reference]
[PayMongo] Found order: [orderId] Current status: Pending Downpayment
[PayMongo] Detected 50% downpayment - awaiting admin verification
[PayMongo] Order updated successfully
```

### Step 4: Verify Database
If status is still wrong, check the database directly:
1. The order should have:
   - `status: "Pending Downpayment"` (after payment, before admin verify)
   - `downPaymentPaid: true`
   - `paymentAmount: [amount]`
   - `paymentMethod: "gcash"` or "card"
   - `paymentType: "downpayment"`

## Code Summary (Already Implemented)

### Webhook Behavior (paymentController.js line 639-647)
```javascript
// 1. Downpayment (50%) - check by status first
// Keep at 'Pending Downpayment' so admin can verify
if (order.status === 'Pending Downpayment' && !order.downPaymentPaid) {
  console.log('[PayMongo] Detected 50% downpayment - awaiting admin verification');
  // Don't change status! Admin must verify via "Verify Downpayment" button
  // order.status stays 'Pending Downpayment'
  order.downPaymentPaid = true;
  order.paymentAmount = paidAmount;
  order.paymentType = 'downpayment';
}
```

### Admin Verification (customOrderController.js line 471-550)
```javascript
exports.verifyDownPayment = async (req, res) => {
  // Check if status is 'Pending Downpayment'
  if (order.status !== "Pending Downpayment") {
    return res.status(400).json({...});
  }
  
  // Update to 'In Production'
  order.status = "In Production";
  order.downPaymentPaid = true;
  await order.save();
}
```

### Final Payment Flow (paymentController.js line 659-665)
```javascript
// 3. Remaining balance payment (final 50%)
else if (order.status === 'Pending Balance' && order.downPaymentPaid && !order.balancePaid) {
  console.log('[PayMongo] Detected remaining balance payment - awaiting admin verification');
  order.status = 'Pending Final Verification'; // This one DOES change status
  order.paymentAmount = paidAmount;
  order.paymentType = 'remaining';
  order.balancePaid = true;
}
```

## Expected Complete Flow

### 50% Downpayment Path:
1. Quote Sent → Accept → **Pending Downpayment**
2. Pay 50% → (webhook) → **Pending Downpayment** (with payment info)
3. Admin Verify → **In Production**
4. Admin Request Final → **Pending Balance**
5. Pay 50% → (webhook) → **Pending Final Verification**
6. Admin Verify Final → **Completed**
7. Choose Fulfillment → **Ready for Pickup/Delivery**
8. Confirm Receipt → **Completed** (final)

### 100% Full Payment Path:
1. Quote Sent → Accept → **Pending Downpayment**
2. Pay 100% → (webhook) → **Pending Downpayment** (flags: downPaymentPaid + balancePaid)
3. Admin Verify → **Completed** (skips In Production, Pending Balance)
4. Choose Fulfillment → **Ready for Pickup/Delivery**
5. Confirm Receipt → **Completed** (final)

## If Still Not Working

### Check These Files:
1. `server/controllers/paymentController.js` - Lines 564-700 (webhook handler)
2. `server/controllers/customOrderController.js` - Lines 471-750 (verification endpoints)
3. `client/payment-success.html` - Lines 117-310 (success page logic)
4. `client/my-quotes.html` - Lines 220-450 (order display logic)

### Common Issues:
- ❌ Server not restarted after code changes
- ❌ Multiple webhook calls causing race conditions
- ❌ Old code cached in browser (hard refresh: Ctrl+Shift+R)
- ❌ Wrong order being updated (check paymentIntentId matching)

### Debug Commands:
```powershell
# Check server logs
Get-Content server/logs/server.log -Tail 50

# Or watch live (if logging to console)
# Look for [PayMongo] prefixed messages
```

## Contact Points
If the issue persists after restart, check:
1. Browser console for errors
2. Server console for [PayMongo] log messages
3. Network tab to see actual API responses
