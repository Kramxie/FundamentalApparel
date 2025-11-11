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

// Body parser
app.use(express.json());

// Enable CORS 
app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "https://unmumbled-balloonlike-gayle.ngrok-free.dev"
    ],
    credentials: true,
    methods: "GET,POST,PUT,DELETE"
}));

app.use(passport.initialize());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/client', express.static(path.join(__dirname, '..', 'client')));

app.get('/', (req, res) => {
  res.send('API is running...');
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

// Socket.io authentication middleware
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

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId}`);

    // Join user to their personal room
    socket.join(socket.userId);

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

