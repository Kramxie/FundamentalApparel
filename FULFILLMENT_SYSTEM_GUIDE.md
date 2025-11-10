# 📦 Custom Order Fulfillment System - Implementation Guide

## ✅ What's Implemented (Backend)

### 1. Updated CustomOrder Model
**File:** `server/models/CustomOrder.js`

**New Fields Added:**
```javascript
// Payment option
paymentOption: {
    type: String,
    enum: ['full', 'downpayment'],
    default: 'downpayment'
},

// Fulfillment fields
fulfillmentMethod: {
    type: String,
    enum: ['pickup', 'delivery', 'pending'],
    default: 'pending'
},
deliveryAddress: String,
trackingNumber: String,
estimatedDeliveryDate: Date,
pickupDate: Date,
pickupLocation: {
    type: String,
    default: 'Fundamental Store - 123 Main St, Manila'
}
```

**New Status Added:**
- `'Ready for Pickup/Delivery'` - When customer has chosen their fulfillment method

### 2. New Controller Functions
**File:** `server/controllers/customOrderController.js`

#### For Customers:
```javascript
// PUT /api/custom-orders/:id/fulfillment
exports.setFulfillmentMethod = async (req, res) => { ... }
```
- Customer selects "pickup" or "delivery"
- If delivery, they must provide a delivery address
- Changes status to "Ready for Pickup/Delivery"

#### For Admins:
```javascript
// PUT /api/custom-orders/:id/fulfillment-details
exports.updateFulfillmentDetails = async (req, res) => { ... }
```
- Admin adds tracking number + estimated delivery date (for delivery)
- Admin adds pickup date + pickup location (for pickup)

### 3. New Routes
**File:** `server/routes/customOrderRoutes.js`

```javascript
// Customer chooses pickup or delivery
router.route('/:id/fulfillment')
    .put(protect, setFulfillmentMethod);

// Admin adds tracking or pickup details
router.route('/:id/fulfillment-details')
    .put(protect, authorize('admin'), updateFulfillmentDetails);
```

---

## 🔄 Updated Workflow

### Current Flow:
1. **Customer submits custom order** → Status: `Pending Quote`
2. **Admin sends quote (price)** → Status: `Quote Sent`
3. **Customer pays 50% downpayment** → Status: `Pending Downpayment`
4. **Admin verifies downpayment** → Status: `In Production`
5. **Admin finishes, requests balance** → Status: `Pending Balance`
6. **Customer pays 50% balance** → Status: `Pending Final Verification`
7. **Admin verifies balance** → Status: `Completed`

### 🆕 NEW: After Completion
8. **Customer chooses Pickup or Delivery** → Status: `Ready for Pickup/Delivery`
   - If **Delivery**: Customer provides delivery address
   - If **Pickup**: Uses default pickup location

9. **Admin adds fulfillment details:**
   - For **Delivery**: Tracking number + estimated delivery date
   - For **Pickup**: Pickup date + pickup location

---

## 🎨 Frontend Implementation Needed

### 1. Customer Side (`profile.html` - My Custom Orders)

**When Status = "Completed":**
Show a button or modal to choose fulfillment method:

```html
<!-- Example UI -->
<button onclick="showFulfillmentModal(orderId)">
    Choose Pickup or Delivery
</button>

<div id="fulfillment-modal">
    <h3>How would you like to receive your order?</h3>
    
    <label>
        <input type="radio" name="method" value="pickup">
        Pickup from store
    </label>
    
    <label>
        <input type="radio" name="method" value="delivery">
        Delivery to my address
    </label>
    
    <div id="delivery-address-field" style="display:none;">
        <textarea placeholder="Enter full delivery address"></textarea>
    </div>
    
    <button onclick="submitFulfillment()">Submit</button>
</div>
```

**JavaScript Example:**
```javascript
async function submitFulfillment(orderId, method, address) {
    const response = await fetch(
        `${API_BASE}/api/custom-orders/${orderId}/fulfillment`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                fulfillmentMethod: method,
                deliveryAddress: address || null
            })
        }
    );
    
    const result = await response.json();
    if (result.success) {
        alert(result.msg);
        // Refresh the orders list
        fetchMyCustomOrders();
    }
}
```

**When Status = "Ready for Pickup/Delivery":**
Show fulfillment details:

```html
<!-- If Delivery -->
<div class="order-fulfillment">
    <p><strong>Delivery Address:</strong> {{ order.deliveryAddress }}</p>
    <p><strong>Tracking Number:</strong> {{ order.trackingNumber || 'Pending' }}</p>
    <p><strong>Estimated Delivery:</strong> {{ order.estimatedDeliveryDate || 'TBA' }}</p>
</div>

<!-- If Pickup -->
<div class="order-fulfillment">
    <p><strong>Pickup Location:</strong> {{ order.pickupLocation }}</p>
    <p><strong>Pickup Date:</strong> {{ order.pickupDate || 'TBA' }}</p>
</div>
```

---

### 2. Admin Side (`admin/orders.html` - Custom Orders Tab)

**When Status = "Ready for Pickup/Delivery":**
Show form to add fulfillment details:

```html
<!-- If customer chose Delivery -->
<div class="fulfillment-form">
    <h4>Add Delivery Details</h4>
    <input type="text" id="tracking-number" placeholder="Tracking Number">
    <input type="date" id="delivery-date" placeholder="Estimated Delivery Date">
    <button onclick="updateFulfillment(orderId)">Update Delivery Info</button>
</div>

<!-- If customer chose Pickup -->
<div class="fulfillment-form">
    <h4>Schedule Pickup</h4>
    <input type="date" id="pickup-date" placeholder="Pickup Date">
    <input type="text" id="pickup-location" value="Fundamental Store - 123 Main St, Manila">
    <button onclick="updateFulfillment(orderId)">Update Pickup Info</button>
</div>
```

**JavaScript Example:**
```javascript
async function updateFulfillment(orderId, fulfillmentMethod) {
    const data = {};
    
    if (fulfillmentMethod === 'delivery') {
        data.trackingNumber = document.getElementById('tracking-number').value;
        data.estimatedDeliveryDate = document.getElementById('delivery-date').value;
    } else {
        data.pickupDate = document.getElementById('pickup-date').value;
        data.pickupLocation = document.getElementById('pickup-location').value;
    }
    
    const response = await fetch(
        `${API_BASE}/api/custom-orders/${orderId}/fulfillment-details`,
        {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify(data)
        }
    );
    
    const result = await response.json();
    if (result.success) {
        alert('Fulfillment details updated!');
        fetchCustomOrders(); // Refresh
    }
}
```

---

## 📋 Testing Checklist

### Customer Flow:
- [ ] Complete a custom order (pay full balance)
- [ ] See "Choose Pickup or Delivery" button when status = "Completed"
- [ ] Select "Delivery" and provide address
- [ ] See status change to "Ready for Pickup/Delivery"
- [ ] See delivery address displayed
- [ ] Wait for admin to add tracking number
- [ ] See tracking number and estimated delivery date

### Admin Flow:
- [ ] See customer's fulfillment choice in orders list
- [ ] Add tracking number for delivery orders
- [ ] Add pickup date for pickup orders
- [ ] Verify customer sees updated information

---

## 🚀 Next Steps (Optional Enhancements)

### 1. Full Payment Option
Allow customers to pay 100% upfront instead of 50/50:
- Add payment option selector when quote is sent
- Skip "Pending Balance" step if full payment is made
- Go straight to "Completed" after verifying full payment

### 2. Email Notifications
- Send email when order is ready for pickup/delivery
- Send tracking number via email
- Send pickup reminder 1 day before pickup date

### 3. Order Tracking Page
- Create a dedicated tracking page
- Show real-time order status
- Display tracking map (integrate with delivery service API)

### 4. SMS Notifications
- Integrate SMS API (e.g., Twilio, Semaphore)
- Send SMS when order is out for delivery
- Send SMS with pickup confirmation code

---

## 📝 Database Migration Note

**Important:** If you already have existing custom orders in your database, they won't have the new fields. They will default to:
- `paymentOption`: `'downpayment'`
- `fulfillmentMethod`: `'pending'`
- `pickupLocation`: `'Fundamental Store - 123 Main St, Manila'`

This is fine and won't break anything. New orders will use the new system.

---

## 🎯 Summary

### What You Need to Do:
1. ✅ **Backend is complete** - All endpoints are ready
2. 🎨 **Update frontend** - Add UI for customers to choose pickup/delivery
3. 🎨 **Update admin panel** - Add form to input tracking/pickup details
4. 🧪 **Test the flow** - Make a test order and go through the whole process

### Key Benefits:
- ✅ Customers can choose how to receive their order
- ✅ Delivery orders get tracking numbers
- ✅ Pickup orders get scheduled dates
- ✅ Better customer experience
- ✅ Matches standard e-commerce flow

Let me know if you need help with the frontend implementation!
