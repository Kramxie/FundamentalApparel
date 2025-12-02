const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const User = require('../models/User');
    const user = await User.findOne({email: 'prince23@gmail.com'}).select('vouchers');
    
    console.log('User Vouchers:');
    user.vouchers.forEach(v => {
        console.log('  Code:', v.code, '| Used:', v.used ? 'YES' : 'NO', '| UsedAt:', v.usedAt || 'N/A');
    });
    
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
