# Loyalty Award Feature Implementation

## Tasks
- [x] Create a utility function in server/utils/loyalty.js to handle loyalty voucher awarding logic
- [ ] Modify server/controllers/orderController.js completeOrder function to call the loyalty utility after order completion
- [ ] Test the feature to ensure vouchers are awarded correctly (only once per month after 10 purchases)

## Details
- Award 20 pesos off voucher after 10 completed purchases in a month
- Only one voucher per month, even if user makes more purchases
- Voucher should appear in user's "My Vouchers" page
- Trigger on order completion (status: 'Completed')
