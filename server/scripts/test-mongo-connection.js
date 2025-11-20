const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('[TEST] MONGO_URI is not set. Check server/.env');
  process.exit(1);
}

console.log('[TEST] Attempting to connect to MongoDB with provided MONGO_URI...');

mongoose.connect(uri, { family: 4 })
  .then(conn => {
    console.log('[TEST] Connected to MongoDB. Host:', conn.connection.host);
    mongoose.connection.close(false, () => process.exit(0));
  })
  .catch(err => {
    console.error('[TEST] Connection failed:', err.message || err);
    if (err && err.reason) console.error('[TEST] Reason:', err.reason);
    process.exit(1);
  });
