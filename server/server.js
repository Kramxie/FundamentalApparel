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

require('./config/passport')(passport);
// Route files
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes'); 
const orderRoutes = require('./routes/orderRoutes');
const voucherRoutes = require('./routes/voucherRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customOrderRoutes = require('./routes/customOrderRoutes');
const messageRoutes = require('./routes/messageRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const returnRoutes = require('./routes/returnRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const notifyUtil = require('./utils/notify');

connectDB();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: [
            "http://127.0.0.1:5500",
            "https://unmumbled-balloonlike-gayle.ngrok-free.dev"
        ],
        credentials: true,
        methods: ["GET", "POST"]
    }
});

// Initialize notify util with io
try { notifyUtil.init(io); } catch (e) { console.warn('Failed to init notify util', e && e.message); }

app.use(express.static(path.join(__dirname, "client")));
// Body parser
// Capture raw body bytes for webhook verification when needed.
// This uses the `verify` option to save the raw Buffer on `req.rawBody`
// for requests to the webhook path so HMAC checks use the exact bytes PayMongo sent.
app.use(express.json({
    verify: (req, res, buf, encoding) => {
        try {
            const url = (req.originalUrl || req.url || '').toString();
            if (url && url.includes('/api/payments/webhook')) {
                req.rawBody = buf; // Buffer
            }
        } catch (e) {
            // swallow - verification capture should not break normal parsing
            console.warn('[BodyParser] Failed to capture rawBody for webhook:', e && e.message);
        }
    }
}));

// Enable CORS 
app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://unmumbled-balloonlike-gayle.ngrok-free.dev"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
}));

app.use(passport.initialize());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/client', express.static(path.join(__dirname, '..', 'client')));
// Serve images folder (outside client) for product/customizer assets
app.use('/images', express.static(path.join(__dirname, '..', 'images')));

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Health check endpoints used by Render and monitoring systems
app.get('/healthz', (req, res) => {
    return res.status(200).json({ status: 'ok' });
});

// Some Render setups used a misspelled path '/healtz' in health check configuration;
// include it to avoid failures if that path is still configured.
app.get('/healtz', (req, res) => {
    return res.status(200).json({ status: 'ok' });
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes); 
app.use('/api/orders', orderRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/custom-orders', customOrderRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin/inventory', inventoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/admin/notifications', notificationRoutes);

// Socket.io authentication middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
        return next(new Error('Authentication error: No token provided'));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        socket.role = decoded.role;
        next();
    } catch (err) {
        return next(new Error('Authentication error: Invalid token'));
    }
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user to their personal room
    socket.join(socket.userId);
        // If the connected user is an admin, also join them to the admins room
        try {
            if (socket.role === 'admin') socket.join('admins');
        } catch (e) { /* ignore */ }

    // Handle sending messages
    socket.on('sendMessage', async (data) => {
        try {
            const { recipientId, message } = data;
            
            // Broadcast to recipient
            io.to(recipientId).emit('receiveMessage', {
                senderId: socket.userId,
                recipientId,
                message,
                timestamp: new Date()
            });

            // Also send back to sender for confirmation
            socket.emit('messageSent', {
                senderId: socket.userId,
                recipientId,
                message,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket sendMessage error:', error);
            socket.emit('messageError', { error: 'Failed to send message' });
        }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
        const { recipientId } = data;
        io.to(recipientId).emit('userTyping', {
            userId: socket.userId,
            isTyping: true
        });
    });

    socket.on('stopTyping', (data) => {
        const { recipientId } = data;
        io.to(recipientId).emit('userTyping', {
            userId: socket.userId,
            isTyping: false
        });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.userId}`);
    });
});

const PORT = process.env.PORT || 5000;


server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

