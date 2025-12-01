/**
 * Script to verify all employee accounts.
 * 
 * This ensures all existing employee accounts have isVerified = true
 * so they can login to the admin panel.
 * 
 * Run with: node server/scripts/verify_employee_accounts.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;

async function main() {
    console.log('='.repeat(60));
    console.log('VERIFY EMPLOYEE ACCOUNTS');
    console.log('='.repeat(60));
    
    if (!MONGO_URI) {
        console.error('ERROR: MONGO_URI not set in environment');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Find all employee accounts
        const employees = await User.find({ role: 'employee' });
        console.log(`Found ${employees.length} employee account(s)\n`);

        let verifiedCount = 0;
        let alreadyVerifiedCount = 0;

        for (const emp of employees) {
            if (emp.isVerified) {
                console.log(`✓ ${emp.email} - Already verified`);
                alreadyVerifiedCount++;
            } else {
                emp.isVerified = true;
                await emp.save();
                console.log(`🔧 ${emp.email} - NOW VERIFIED`);
                verifiedCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total employees: ${employees.length}`);
        console.log(`Already verified: ${alreadyVerifiedCount}`);
        console.log(`Just verified: ${verifiedCount}`);
        console.log('='.repeat(60));

        if (verifiedCount > 0) {
            console.log(`\n🎉 Verified ${verifiedCount} employee account(s)! They can now login.`);
        } else if (employees.length > 0) {
            console.log('\n✓ All employee accounts are already verified.');
        } else {
            console.log('\nNo employee accounts found.');
        }

    } catch (err) {
        console.error('Script error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

main();
