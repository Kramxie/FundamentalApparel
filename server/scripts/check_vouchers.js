const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const Order = require('../models/Order');
    
    // Find all orders with voucher
    const orders = await Order.find({ 'voucher.code': { $exists: true, $ne: null } })
        .select('voucher user paymentStatus status')
        .populate('user', 'email');
    
    console.log('Orders with voucher:', orders.length);
    orders.forEach(o => {
        console.log('Voucher:', o.voucher?.code, '| User:', o.user?.email, '| Payment:', o.paymentStatus, '| Status:', o.status);
    });
    
    process.exit(0);
});
