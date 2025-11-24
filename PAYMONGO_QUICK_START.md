# PayMongo Integration - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### 1. Get PayMongo API Keys
1. Sign up at https://dashboard.paymongo.com/signup
2. Go to **Developers** → **API Keys**
3. Copy your **Test Secret Key** (starts with `sk_test_`)
4. Copy your **Test Public Key** (starts with `pk_test_`)

### 2. Update Environment Variables
Create or update `server/.env`:

```env
# PayMongo Test Keys
PAYMONGO_SECRET_KEY=sk_test_your_actual_secret_key_here
PAYMONGO_PUBLIC_KEY=pk_test_your_actual_public_key_here

# Your Ngrok URL
SERVER_URL=https://fundamental-apparel-backend.onrender.com
PORT=5000
```

### 3. Configure PayMongo Webhook
1. Go to **Developers** → **Webhooks** in PayMongo dashboard
2. Click **Add endpoint**
3. Enter webhook URL: `https://your-ngrok-url.ngrok-free.dev/api/payments/webhook`
4. Select events:
   - ✅ `checkout_session.payment.paid`
   - ✅ `checkout_session.payment.failed`
5. Click **Create**

### 4. Restart Server
```powershell
cd server
npm start
```

---

## 🧪 Test Payment (2 Minutes)

### Test Product Checkout
1. Browse products at `https://fundamental-apparel-backend.onrender.com/client/products.html`
2. Add items to cart
3. Go to checkout: `https://fundamental-apparel-backend.onrender.com/client/checkout.html`
4. Fill in shipping address
5. Select **GCash** or **Credit Card**
6. Click **Proceed to Secure Payment**
7. Use test credentials below

### Test Service Checkout
1. Create custom design at `https://fundamental-apparel-backend.onrender.com/client/customize-jersey.html`
2. Submit for quote
3. Go to services checkout
4. Fill in contact info
5. Select **GCash** or **Credit Card**
6. Click **Proceed to Secure Payment**
7. Use test credentials below

---

## 💳 PayMongo Test Credentials

### Test Credit Card
```
Card Number:  4343 4343 4343 4345
Expiry Date:  12/25 (any future date)
CVV:          123 (any 3 digits)
Name:         Test User
```

### Test GCash
```
Phone Number: 09123456789
OTP Code:     123456
```

**Note:** PayMongo test mode automatically approves all test payments.

---

## ✅ What to Verify

### After Successful Payment:
1. ✅ Redirected to `payment-success.html`
2. ✅ Order reference displayed (e.g., `REF-A1B2C3D4`)
3. ✅ Order status in database:
   - **Product Orders**: `paymentStatus: 'Received'`, `status: 'Processing'`
   - **Service Orders**: `paymentStatus: 'paid'`, `status: 'Quote Accepted'`

### Check Database (MongoDB):
```javascript
// Product Order
db.orders.findOne({ _id: ObjectId("...") })
// Should have:
// - paymentIntentId: "cs_xxx"
// - paymentStatus: "Received"
// - status: "Processing"
// - isPaid: true

// Service Order
db.customorders.findOne({ _id: ObjectId("...") })
// Should have:
// - paymentIntentId: "cs_xxx"
// - paymentStatus: "paid"
// - status: "Quote Accepted"
```

---

## 🔧 Troubleshooting

### Issue: "Failed to create payment session"
**Solution:** Check PayMongo API keys in `.env` file

### Issue: Webhook not being called
**Solution:** 
1. Verify webhook URL in PayMongo dashboard
2. Make sure ngrok is running
3. Check server logs for webhook events

### Issue: "Order not found" after payment
**Solution:**
1. Check MongoDB connection
2. Verify order was created before redirect
3. Check server logs for payment intent ID

### Issue: Payment succeeds but order status not updated
**Solution:**
1. Verify webhook is configured correctly
2. Check webhook events in PayMongo dashboard
3. Review server logs for webhook processing errors

---

## 📊 Payment Method Mapping

| Frontend Value | PayMongo API Value | Display Name |
|----------------|-------------------|--------------|
| `gcash`        | `['gcash']`       | GCash        |
| `card`         | `['card']`        | Credit/Debit Card |

---

## 🔐 Security Checklist

- [ ] Never commit `.env` file to Git
- [ ] Use test keys for development/testing
- [ ] Switch to live keys only in production
- [ ] Verify webhook signatures (production)
- [ ] Use HTTPS for webhook endpoint
- [ ] Validate all payment amounts server-side

---

## 📱 Mobile Testing

PayMongo checkout is mobile-responsive. Test on:
- [ ] iPhone Safari
- [ ] Android Chrome
- [ ] iPad Safari
- [ ] Desktop Chrome/Firefox

---

## 🎯 Success Criteria

- [ ] Product checkout redirects to PayMongo
- [ ] Service checkout redirects to PayMongo
- [ ] GCash payment completes successfully
- [ ] Card payment completes successfully
- [ ] Webhook updates order status
- [ ] User redirected to success page
- [ ] Order appears in admin dashboard
- [ ] No console errors during checkout

---

## 🚨 Common Mistakes

❌ **Don't:**
- Use live keys in development
- Skip webhook configuration
- Forget to restart server after .env changes
- Test with real payment details in test mode

✅ **Do:**
- Use test credentials provided
- Check server logs for detailed errors
- Verify ngrok URL is updated in .env
- Test both GCash and Card payments

---

## 📞 Quick Links

- **PayMongo Dashboard:** https://dashboard.paymongo.com
- **PayMongo Docs:** https://developers.paymongo.com/docs
- **Test Card Numbers:** https://developers.paymongo.com/docs/testing
- **Webhook Guide:** https://developers.paymongo.com/docs/webhooks

---

## 💡 Pro Tips

1. **Keep Ngrok Running:** Don't close ngrok during testing or PayMongo can't send webhooks
2. **Check Logs:** Server logs show detailed PayMongo API requests/responses
3. **Test Failures:** Use PayMongo test cards that trigger failures to test error handling
4. **Webhook Events:** View webhook history in PayMongo dashboard for debugging

---

**Ready to test?** Start the server and follow the test steps above! 🎉
