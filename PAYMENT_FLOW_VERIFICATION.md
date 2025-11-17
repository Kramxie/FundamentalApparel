# Payment Flow Verification Guide

## Expected Flow (50% Downpayment Option)

### Phase 1: Quote Acceptance & Downpayment
1. **Customer accepts quote** → Status: `Pending Downpayment`
2. **Customer clicks "Pay 50% Downpayment"** → Redirects to PayMongo
3. **Customer completes payment on PayMongo** → PayMongo webhook fires
4. **Webhook updates order**:
   - Status: **STAYS** `Pending Downpayment` (NOT changed!)
   - Sets: `downPaymentPaid = true`
   - Sets: `paymentAmount` (actual amount paid)
   - Sets: `paymentMethod` (gcash/card/etc)
   - Sets: `paymentType = 'downpayment'`
5. **Customer redirected to payment-success.html** → Shows "Payment Received - Awaiting Admin Verification"
6. **Customer sees on my-quotes.html**:
   - Status badge: `Pending Downpayment`
   - Message: "Payment Received - Your 50% payment has been received and is being verified by our admin team"
   - Shows: Payment Method, Amount Paid

### Phase 2: Admin Verification
7. **Admin opens orders.html** → Sees order with status `Pending Downpayment`
8. **Admin clicks "Action" → "Verify Downpayment"** → Sends PUT request to `/api/custom-orders/:id/verify-downpayment`
9. **Backend updates order**:
   - Status: Changes from `Pending Downpayment` → `In Production`
   - Confirms: `downPaymentPaid = true`
10. **Customer receives email**: "Downpayment Verified – Your order is now In Production"
11. **Customer sees on my-quotes.html**:
    - Status badge: `In Production`
    - Message: "Your downpayment has been verified and production has begun"

### Phase 3: Request Final Payment
12. **Admin clicks "Action" → "Request Final Payment"** → Sends PUT request to `/api/custom-orders/:id/request-final-payment`
13. **Backend updates order**:
    - Status: Changes from `In Production` → `Pending Balance`
14. **Customer receives email**: "Final Payment Requested – Your order is finished. Please pay your remaining balance"
15. **Customer sees on my-quotes.html**:
    - Status badge: `Pending Balance`
    - Button: "Pay Final Payment"

### Phase 4: Final Payment
16. **Customer clicks "Pay Final Payment"** → Redirects to PayMongo
17. **Customer completes payment on PayMongo** → PayMongo webhook fires
18. **Webhook updates order**:
    - Status: Changes from `Pending Balance` → `Pending Final Verification`
    - Sets: `balancePaid = true`
    - Updates: `paymentAmount` (final payment amount)
    - Sets: `paymentType = 'remaining'`
19. **Customer redirected to payment-success.html** → Shows "Final Payment Received - Awaiting Admin Verification"
20. **Customer sees on my-quotes.html**:
    - Status badge: `Pending Final Verification`
    - Message: "We received your final payment. It is now waiting for admin verification"

### Phase 5: Admin Final Verification
21. **Admin opens orders.html** → Sees order with status `Pending Final Verification`
22. **Admin clicks "Action" → "Verify Final Payment"** → Sends PUT request to `/api/custom-orders/:id/verify-final-payment`
23. **Backend updates order**:
    - Status: Changes from `Pending Final Verification` → `Completed`
    - Confirms: `balancePaid = true`
24. **Customer receives email**: "Payment Verified – Order Completed. Please choose your fulfillment method"
25. **Customer sees on my-quotes.html**:
    - Status badge: `Completed`
    - Shows: Fulfillment form (Pickup or Delivery)

### Phase 6: Fulfillment
26. **Customer chooses fulfillment method** → Sends PUT request to `/api/custom-orders/:id/fulfillment`
27. **Backend updates order**:
    - Status: Changes from `Completed` → `Ready for Pickup/Delivery`
    - Sets: `fulfillmentMethod` (pickup/delivery)
    - Sets: `deliveryAddress` (if delivery)
28. **Admin adds tracking/pickup details** → Status stays `Ready for Pickup/Delivery`
29. **Customer sees on my-quotes.html**:
    - Status badge: `Ready for Pickup/Delivery`
    - Shows: Pickup location OR Delivery address + tracking
    - Button: "Confirm Receipt & Complete Order"

### Phase 7: Order Completion
30. **Customer receives order and clicks "Confirm Receipt"** → Sends PUT request to `/api/custom-orders/:id/confirm-receipt`
31. **Backend updates order**:
    - Status: Changes from `Ready for Pickup/Delivery` → `Completed`
    - Sets: `completedAt = new Date()`
32. **Customer sees on my-quotes.html**:
    - Status badge: `Completed`
    - Message: "Order Completed! Thank you for your business"
    - Shows: Completion date

---

## Expected Flow (100% Full Payment Option)

### Variant Flow
1. Customer accepts quote → Status: `Pending Downpayment`
2. Customer clicks "Pay 100% Full Payment" → PayMongo
3. PayMongo webhook detects full amount → Sets both `downPaymentPaid` and `balancePaid` to true
4. Status **STAYS** `Pending Downpayment` for admin verification
5. Admin verifies → Status changes directly to `Completed` (skips In Production and Pending Balance)
6. Customer chooses fulfillment → Status: `Ready for Pickup/Delivery`
7. Customer confirms receipt → Status: `Completed` (final)

---

## Key Backend Endpoints

### Customer Endpoints
- `POST /api/payments/create` - Create PayMongo checkout session
- `PUT /api/custom-orders/:id/fulfillment` - Set fulfillment method
- `PUT /api/custom-orders/:id/confirm-receipt` - Confirm receipt
- `PUT /api/custom-orders/:id/cancel` - Cancel quote

### Admin Endpoints
- `PUT /api/custom-orders/:id/verify-downpayment` - Verify downpayment
- `PUT /api/custom-orders/:id/request-final-payment` - Request final payment
- `PUT /api/custom-orders/:id/verify-final-payment` - Verify final payment
- `PUT /api/custom-orders/:id/fulfillment-details` - Add tracking/pickup details

### Webhook
- `POST /api/payments/webhook` - PayMongo webhook receiver
- `POST /api/payments/sync/:orderId` - Manual sync for localhost testing

---

## Critical Rules

1. **Webhook NEVER auto-approves payments** - Only sets flags (`downPaymentPaid`, `balancePaid`)
2. **Status preservation**: Downpayment keeps status at `Pending Downpayment`
3. **Admin gate**: Admin MUST verify before status progresses
4. **Final payment status change**: Only final payment changes status to `Pending Final Verification`
5. **Order detection**: Uses `paymentIntentId` only (NOT regex on _id)
6. **Payment type priority**: Check status FIRST, then amount

---

## Testing Checklist

- [ ] Customer pays 50% downpayment → Status stays `Pending Downpayment` (payment info saved)
- [ ] Admin verifies downpayment → Status changes to `In Production`
- [ ] Admin requests final payment → Status changes to `Pending Balance`
- [ ] Customer pays final 50% → Status changes to `Pending Final Verification`
- [ ] Admin verifies final payment → Status changes to `Completed`
- [ ] Customer sets fulfillment → Status changes to `Ready for Pickup/Delivery`
- [ ] Customer confirms receipt → Status changes to `Completed` (final)
- [ ] Customer pays 100% upfront → Status stays `Pending Downpayment`, admin verifies → skips to `Completed`
