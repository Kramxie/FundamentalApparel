const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Order = require('../models/Order');
    
    // Find order by partial ID
    const orders = await Order.find().sort({createdAt: -1}).limit(5);
    
    console.log('Recent Orders:');
    for (const o of orders) {
        const idShort = o._id.toString().slice(-12);
        console.log('---');
        console.log('ID:', idShort);
        console.log('Voucher:', o.voucher ? JSON.stringify(o.voucher) : 'NONE');
        console.log('Discount:', o.discount || 0);
        console.log('Total:', o.totalPrice);
        console.log('PaymentStatus:', o.paymentStatus);
    }
    
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
