const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const passport = require('passport');
const jwt = require('jsonwebtoken');

dotenv.config();

// Passport
require('./config/passport')(passport);

// Connect DB
connectDB();

const app = express();
const server = http.createServer(app);

// Socket.io with dynamic CORS (Render + localhost)
const io = socketIo(server, {
    cors: {
        origin: [
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            process.env.FRONTEND_URL,
            process.env.NGROK_DOMAIN
        ],
        credentials: true,
        methods: ["GET", "POST"]
    }
});

// ====================== STATIC ASSETS =============================
app.use(express.static(path.join(__dirname, "client")));

// Serve uploads (uploads folder in Render is TEMPORARY)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve images folder
app.use('/images', express.static(path.join(__dirname, '..', 'images')));

// ====================== PAYMONGO WEBHOOK RAW BODY ==================
app.use(express.json({
    verify: (req, res, buf) => {
        if (req.originalUrl.includes('/api/payments/webhook')) {
            req.rawBody = buf;
        }
    }
}));

// ====================== CORS SETTINGS ==============================
app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        process.env.FRONTEND_URL,
        process.env.NGROK_DOMAIN
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}));

// Passport
app.use(passport.initialize());

// ====================== ROUTES ====================================
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/vouchers', require('./routes/voucherRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/custom-orders', require('./routes/customOrderRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/admin/inventory', require('./routes/inventoryRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/returns', require('./routes/returnRoutes'));

// ====================== SOCKET.IO AUTH =============================
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
    } catch (err) {
        return next(new Error('Authentication error: Invalid token'));
    }
});

// ====================== SOCKET.IO EVENTS ===========================
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    socket.join(socket.userId);

    socket.on('sendMessage', async (data) => {
        try {
            const { recipientId, message } = data;

            io.to(recipientId).emit('receiveMessage', {
                senderId: socket.userId,
                recipientId,
                message,
                timestamp: new Date()
            });

            socket.emit('messageSent', {
                senderId: socket.userId,
                recipientId,
                message,
                timestamp: new Date()
            });

        } catch (error) {
            socket.emit('messageError', { error: 'Failed to send message' });
        }
    });

    socket.on('typing', (data) => {
        io.to(data.recipientId).emit('userTyping', {
            userId: socket.userId,
            isTyping: true
        });
    });

    socket.on('stopTyping', (data) => {
        io.to(data.recipientId).emit('userTyping', {
            userId: socket.userId,
            isTyping: false
        });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.userId}`);
    });
});

// ====================== START SERVER ===============================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () =>
    console.log(`Server running on port ${PORT}`)
);
