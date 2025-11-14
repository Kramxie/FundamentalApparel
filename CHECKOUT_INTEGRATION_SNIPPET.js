/**
 * Integration Helper: Connect Customizer to Services Checkout
 * 
 * Add this code to customize-jersey-new.html after successful quote submission
 * to redirect customers to the payment checkout page.
 */

// ===== OPTION 1: Auto-redirect after quote submission =====
// Replace the success alert in addToCart() with this:

async function addToCart() {
  // ... existing code ...
  
  try {
    // ... existing fetch and validation ...
    
    if (!response.ok) {
      const serverMsg = data.msg || data.error || ('HTTP ' + response.status);
      alert(`Error submitting quote:\n${serverMsg}`);
      return;
    }

    // SUCCESS: Prepare checkout data
    const orderRef = (data && data.data && (data.data.quoteNumber || data.data.orderNumber)) || 'PENDING';
    const orderId = data.data?.orderId;
    
    const checkoutData = {
      orderId: orderId,
      orderReference: orderRef,
      serviceName: products[state.garmentType][state.neckStyle === 'round' ? 'premium' : 'classic'].name,
      serviceType: 'customize-jersey',
      garmentType: backendGarmentType,
      selectedLocation: state.selectedLocation,
      primaryColor: state.primaryColor,
      secondaryColor: state.secondaryColor,
      accentColor: state.accentColor,
      designText: state.designText || '',
      printingType: state.printingType,
      quantity: effectiveQty,
      totalPrice: totalPrice,
      unitPrice: unitPrice,
      teamMode: state.teamMode,
      teamEntries: state.teamEntries,
      basePrice: state.basePrice,
      notes: '', // Can add order comment field if needed
      // Optional: Add design preview URLs if you want to show them in checkout
      designPreviews: [] // Can populate with captured images
    };
    
    // Store for checkout page
    localStorage.setItem('pendingServiceCheckout', JSON.stringify(checkoutData));
    
    // Show confirmation and redirect
    const proceed = confirm(
      `✓ Quote submitted successfully!\n` +
      `Reference: ${orderRef}\n\n` +
      `Would you like to proceed to payment checkout?`
    );
    
    if (proceed) {
      window.location.href = 'services-checkout.html';
    } else {
      // Alternative: show order tracking link
      alert(`Your quote has been saved. You can complete payment anytime from your profile page.`);
    }
    
  } catch (error) {
    console.error('Quote submit failed:', error);
    alert('Failed to submit quote:\n' + error.message);
  }
}

// ===== OPTION 2: Add separate "Proceed to Payment" button =====
// Add this button to your HTML after quote submission:

/*
<div id="checkout-action" class="hidden mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
  <p class="text-green-800 mb-3">
    <i class="fas fa-check-circle mr-1"></i>
    Quote submitted successfully! Reference: <strong id="quote-ref"></strong>
  </p>
  <button onclick="proceedToCheckout()" class="w-full bg-indigo-600 text-white py-2 rounded-lg font-semibold hover:bg-indigo-700">
    <i class="fas fa-credit-card mr-2"></i>
    Proceed to Payment
  </button>
</div>
*/

// Then add this function:
let savedCheckoutData = null;

function showCheckoutOption(quoteData) {
  const checkoutAction = document.getElementById('checkout-action');
  const quoteRef = document.getElementById('quote-ref');
  
  if (checkoutAction && quoteRef) {
    quoteRef.textContent = quoteData.orderReference;
    checkoutAction.classList.remove('hidden');
    savedCheckoutData = quoteData;
  }
}

function proceedToCheckout() {
  if (savedCheckoutData) {
    localStorage.setItem('pendingServiceCheckout', JSON.stringify(savedCheckoutData));
    window.location.href = 'services-checkout.html';
  } else {
    alert('No quote data found. Please submit your design first.');
  }
}

// Call after successful submission:
// showCheckoutOption(checkoutData);


// ===== OPTION 3: Admin sends payment link =====
// Add this to admin panel (manage-orders.html or similar):

function sendPaymentLink(orderId, customerEmail) {
  const paymentLink = `${window.location.origin}/services-checkout.html?order=${orderId}`;
  
  // Send email with payment link (backend handles this)
  fetch('/api/custom-orders/' + orderId + '/send-payment-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token')
    },
    body: JSON.stringify({ customerEmail, paymentLink })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('Payment link sent to customer!');
    }
  })
  .catch(err => console.error(err));
}

// And modify services-checkout.html to load order by ID:
/*
// In services-checkout.html loadServiceData():
function loadServiceData() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('order');
  
  if (orderId) {
    // Fetch order details from backend
    fetchOrderForCheckout(orderId);
  } else {
    // Use localStorage as usual
    const storedData = localStorage.getItem('pendingServiceCheckout');
    // ... rest of existing code
  }
}

async function fetchOrderForCheckout(orderId) {
  const token = localStorage.getItem('token');
  const res = await fetch(`/api/custom-orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const json = await res.json();
  if (json.success) {
    serviceData = json.data;
    renderServiceSummary(serviceData);
    updatePaymentAmounts(serviceData);
  }
}
*/


// ===== TESTING =====
// Test the flow:
// 1. Complete customizer form with valid data
// 2. Click "Submit Quote"
// 3. Should see confirmation
// 4. Click "Proceed to Payment" (or auto-redirect)
// 5. Verify checkout page loads with correct data
// 6. Fill contact form
// 7. Click "Proceed to Payment"
// 8. Should redirect to PayMongo (or show error if keys not configured)


// ===== TROUBLESHOOTING =====

// Check if data is stored:
console.log('Checkout data:', localStorage.getItem('pendingServiceCheckout'));

// Clear and retry:
localStorage.removeItem('pendingServiceCheckout');

// Verify data structure:
const testData = {
  orderReference: 'TEST123',
  serviceName: 'Custom T-Shirt',
  serviceType: 'customize-jersey',
  garmentType: 't-shirt',
  quantity: 2,
  totalPrice: 1260,
  unitPrice: 630
};
localStorage.setItem('pendingServiceCheckout', JSON.stringify(testData));
// Then visit services-checkout.html
