/**
 * Script to debug employee login issues.
 * 
 * Run with: node server/scripts/debug_employee_login.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;

async function main() {
    console.log('='.repeat(60));
    console.log('DEBUG EMPLOYEE LOGIN');
    console.log('='.repeat(60));
    
    if (!MONGO_URI) {
        console.error('ERROR: MONGO_URI not set in environment');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Find all employee and admin accounts
        const users = await User.find({ role: { $in: ['employee', 'admin'] } }).select('+password');
        console.log(`Found ${users.length} admin/employee account(s)\n`);

        for (const user of users) {
            console.log(`\n📧 ${user.email}`);
            console.log(`   Role: ${user.role}`);
            console.log(`   isVerified: ${user.isVerified}`);
            console.log(`   isActive: ${user.isActive}`);
            console.log(`   Has password: ${user.password ? 'Yes' : 'No'}`);
            console.log(`   Password length: ${user.password ? user.password.length : 0}`);
            console.log(`   Password starts with $2: ${user.password ? user.password.startsWith('$2') : false}`);
            
            // Test if password can be compared
            if (user.password) {
                try {
                    const testResult = await user.matchPassword('testpassword123');
                    console.log(`   matchPassword works: Yes`);
                } catch (e) {
                    console.log(`   matchPassword error: ${e.message}`);
                }
            }
        }

        console.log('\n' + '='.repeat(60));

    } catch (err) {
        console.error('Script error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

main();
