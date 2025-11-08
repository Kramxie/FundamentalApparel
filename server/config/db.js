const mongoose = require('mongoose');

const connectDB = async () => {
    console.log('[DB] connectDB function called.');
    if (!process.env.MONGO_URI) {
        console.error('[DB] FATAL ERROR: MONGO_URI is not defined in .env file.');
        process.exit(1);
    }
    
    try {
        console.log('[DB] Attempting to connect to Mongoose...');
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`[DB] Connection Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
