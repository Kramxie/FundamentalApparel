# 💬 Real-Time Messaging System - Setup & Usage Guide

## 📋 Overview

A complete real-time messaging system that allows customers to chat directly with admin support. Built with **Socket.io**, **MongoDB**, **Vanilla JavaScript**, and **Tailwind CSS**.

---

## ✨ Features

### Customer Features
- 🔵 **Floating Chat Button** - Fixed bottom-right widget with unread message counter
- 💬 **Real-Time Messaging** - Instant message delivery via Socket.io
- ⌨️ **Typing Indicators** - See when admin is typing
- 📱 **Responsive Design** - Mobile-friendly chat interface
- 🔔 **Unread Badge** - Visual notification of new messages
- 💾 **Message History** - All messages saved to database
- 🔐 **JWT Authentication** - Secure, token-based auth

### Admin Features
- 📊 **Conversations Dashboard** - View all customer chats in one place
- 👥 **Customer List** - See all customers who have messaged
- 🔴 **Unread Indicators** - Badge showing unread message count per customer
- 🔍 **Search Customers** - Quick search by name or email
- ⚡ **Real-Time Updates** - Instant message notifications
- 📝 **Full Chat History** - Access complete conversation logs
- ⌨️ **Typing Indicators** - See when customers are typing

---

## 🛠️ Installation

### 1. Install Dependencies

First, make sure Socket.io is installed in your server:

```bash
cd server
npm install socket.io
```

### 2. Files Created/Modified

#### Backend Files (New)
- ✅ `server/models/Message.js` - MongoDB message schema
- ✅ `server/controllers/messageController.js` - Message CRUD operations
- ✅ `server/routes/messageRoutes.js` - API endpoints

#### Backend Files (Modified)
- ✅ `server/server.js` - Added Socket.io integration
- ✅ `server/controllers/authController.js` - Added `getAdminUser` endpoint
- ✅ `server/routes/authRoutes.js` - Added admin user route

#### Frontend Files (New)
- ✅ `client/js/chat.js` - Chat widget logic
- ✅ `client/admin/messages.html` - Admin chat interface

#### Frontend Files (Modified)
All customer-facing pages now include the chat widget:
- ✅ `client/index.html`
- ✅ `client/products.html`
- ✅ `client/product-detail.html`
- ✅ `client/cart.html`
- ✅ `client/checkout.html`
- ✅ `client/profile.html`
- ✅ `client/services.html`
- ✅ `client/customize-jersey.html`
- ✅ `client/order-confirmation.html`

All admin pages now have Messages link in sidebar:
- ✅ `client/admin/index.html`
- ✅ `client/admin/orders.html`
- ✅ `client/admin/vouchers.html`
- ✅ `client/admin/add-product.html`
- ✅ `client/admin/edit-product.html`
- ✅ `client/admin/manage-products.html`

---

## 🚀 How to Use

### For Customers

1. **Login Required**: Chat widget only appears for logged-in users
2. **Open Chat**: Click the blue chat button at bottom-right corner
3. **Send Messages**: Type message and press Enter or click send button
4. **View History**: All previous messages load automatically
5. **Unread Badge**: Red badge shows number of unread admin replies
6. **Close Chat**: Click X button or chat button again to minimize

**Screenshots of Customer Chat:**
- Floating button with unread badge (when minimized)
- Full chat window with admin header
- Message bubbles (yours in blue, admin in white)
- Timestamp below each message
- Typing indicator when admin is typing

### For Admin

1. **Access Messages**: Go to Admin Panel → Messages
2. **View Conversations**: Left sidebar shows all customer chats
3. **Unread Indicators**: Red badges show unread message counts
4. **Select Customer**: Click on a conversation to open chat
5. **Send Replies**: Type and press Enter or click Send
6. **Search**: Use search box to find customers by name/email
7. **Real-Time**: New messages appear instantly without refresh

**Admin Dashboard Features:**
- Conversations sorted by most recent
- Last message preview
- Timestamp of last activity
- Unread message count badges
- Customer avatar/name display
- Search functionality

---

## 🔧 Technical Details

### Backend Architecture

#### 1. MongoDB Message Schema
```javascript
{
  sender: ObjectId (ref: User),
  recipient: ObjectId (ref: User),
  message: String,
  isRead: Boolean,
  isAdminMessage: Boolean,
  timestamps: true
}
```

#### 2. Socket.io Events

**Client → Server:**
- `sendMessage` - Send new message
- `typing` - User started typing
- `stopTyping` - User stopped typing

**Server → Client:**
- `receiveMessage` - New message received
- `messageSent` - Confirmation of sent message
- `userTyping` - Typing indicator
- `messageError` - Error occurred

#### 3. API Endpoints

```
GET    /api/messages                 - Get chat history
GET    /api/messages/conversations   - Get all conversations (admin)
POST   /api/messages                 - Send new message
PUT    /api/messages/read            - Mark messages as read
GET    /api/messages/unread-count    - Get unread message count
GET    /api/auth/admin-user          - Get admin user info (public)
```

### Frontend Architecture

#### Chat Widget (`client/js/chat.js`)
- Self-contained IIFE module
- Automatic initialization on page load
- Only shows for logged-in non-admin users
- Connects via Socket.io with JWT auth
- Stores messages in local array
- Real-time UI updates

#### Admin Interface (`client/admin/messages.html`)
- Full-screen chat dashboard
- Split view: conversations list + chat window
- Real-time message updates
- Typing indicators
- Search functionality
- Message persistence

---

## 🎨 UI/UX Features

### Customer Chat Widget
- **Fixed Position**: Bottom-right, doesn't interfere with content
- **Floating Button**: 64x64px circular button with icon
- **Unread Badge**: Red circle with count (top-right of button)
- **Chat Window**: 384px wide, 500px tall, rounded corners, shadow
- **Message Bubbles**: 
  - Admin messages: White with gray border (left-aligned)
  - Your messages: Indigo blue (right-aligned)
- **Input Field**: Rounded pill-style with send button
- **Scroll**: Auto-scrolls to latest message
- **Responsive**: Adapts to mobile screens

### Admin Dashboard
- **Sidebar**: 320px wide conversation list
- **Main Area**: Full chat window
- **Conversation Items**: Show avatar, name, last message, timestamp, unread badge
- **Search Bar**: Fixed at top of sidebar
- **Active State**: Indigo background for selected conversation
- **Empty State**: "Select a conversation" placeholder

---

## 🔐 Security Features

1. **JWT Authentication**: All Socket.io connections verified
2. **User Verification**: Token checked on every message
3. **Role-Based Access**: Admin-only endpoints protected
4. **Message Ownership**: Users can only view their own messages
5. **XSS Prevention**: HTML escaped in message display
6. **CORS Configuration**: Restricted to allowed origins

---

## 📊 Database Collections

### Messages Collection
```javascript
{
  _id: ObjectId,
  sender: ObjectId,
  recipient: ObjectId,
  message: "Hello, I need help with my order",
  isRead: false,
  isAdminMessage: false,
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**Indexes:**
- Compound index: `{ sender: 1, recipient: 1, createdAt: -1 }`
- Compound index: `{ recipient: 1, isRead: 1 }`

---

## 🧪 Testing Checklist

### Customer Side
- [ ] Chat button appears after login
- [ ] Chat button hidden for admin users
- [ ] Chat button hidden when not logged in
- [ ] Click button opens chat window
- [ ] Can send messages
- [ ] Messages appear in chat instantly
- [ ] Receive admin replies in real-time
- [ ] Typing indicator shows when admin types
- [ ] Unread badge updates correctly
- [ ] Message history loads on open
- [ ] Enter key sends message
- [ ] Send button works
- [ ] Close button minimizes chat
- [ ] Timestamps display correctly
- [ ] Long messages wrap properly
- [ ] Mobile responsive layout works

### Admin Side
- [ ] Messages link in sidebar navigation
- [ ] Can access /admin/messages.html
- [ ] Conversations list loads
- [ ] Can select a conversation
- [ ] Chat history displays
- [ ] Can send replies
- [ ] Replies deliver to customer instantly
- [ ] Typing indicator works both ways
- [ ] Unread badges show correct counts
- [ ] Search customers works
- [ ] New messages auto-appear
- [ ] Timestamps display correctly
- [ ] Can switch between conversations
- [ ] Empty state shows when no conversations

### Real-Time Features
- [ ] Socket.io connects successfully
- [ ] Messages deliver instantly both ways
- [ ] Typing indicators work
- [ ] Connection reconnects after disconnect
- [ ] Multiple tabs sync messages
- [ ] No message duplication
- [ ] Error handling works

---

## 🐛 Troubleshooting

### Issue: Chat button doesn't appear
**Solution:**
- Check if user is logged in (localStorage has 'token')
- Verify user is not admin (admins don't see widget)
- Check browser console for errors
- Ensure chat.js is loaded after DOM content

### Issue: Messages not sending
**Solution:**
- Check Socket.io connection status
- Verify JWT token is valid
- Check backend server is running
- Check MongoDB connection
- Verify admin user exists in database

### Issue: Socket.io connection fails
**Solution:**
- Verify server is running on correct port
- Check CORS configuration in server.js
- Ensure Socket.io client library loaded
- Check firewall/network settings
- Verify ngrok URL matches in code

### Issue: Admin can't see messages
**Solution:**
- Verify admin user has role: 'admin'
- Check Messages link in sidebar
- Ensure messageRoutes mounted in server.js
- Check browser console for API errors
- Verify JWT token in localStorage (adminToken)

---

## 🔄 Future Enhancements

Potential features to add:

1. **File Attachments** - Send images/documents
2. **Message Reactions** - Emoji reactions
3. **Read Receipts** - Blue checkmarks when read
4. **Message Search** - Search within conversations
5. **Canned Responses** - Quick reply templates for admin
6. **Notification Sounds** - Audio alerts for new messages
7. **Multi-Admin Support** - Multiple admins can respond
8. **Customer Info Panel** - Show customer details in admin view
9. **Message Deletion** - Allow users to delete messages
10. **Conversation Archive** - Archive old conversations

---

## 📝 Notes

- **Auto-Scroll**: Messages automatically scroll to bottom
- **Optimistic UI**: Messages show immediately, then confirm with server
- **Reconnection**: Socket.io auto-reconnects on disconnect
- **Message Persistence**: All messages saved to MongoDB
- **Typing Timeout**: Typing indicator disappears after 2 seconds
- **Token Refresh**: JWT tokens valid for 30 days

---

## 🎯 Configuration

### Update API URLs

In `client/js/chat.js`, update these constants:

```javascript
const API_BASE = 'https://your-ngrok-url.ngrok-free.dev';
const SOCKET_URL = 'https://your-ngrok-url.ngrok-free.dev';
```

In `client/admin/messages.html`, update:

```javascript
const API_BASE = 'https://your-ngrok-url.ngrok-free.dev';
const SOCKET_URL = 'https://your-ngrok-url.ngrok-free.dev';
```

### CORS Settings

In `server/server.js`, ensure your frontend URLs are whitelisted:

```javascript
app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "https://your-ngrok-url.ngrok-free.dev"
    ],
    credentials: true,
    methods: "GET,POST,PUT,DELETE"
}));
```

---

## ✅ Summary

You now have a complete real-time messaging system! 

**What was implemented:**
✅ Backend: Message model, controller, routes, Socket.io integration
✅ Frontend: Chat widget for customers, dashboard for admin
✅ Real-time: Socket.io bidirectional communication
✅ Security: JWT auth, role-based access, XSS prevention
✅ UI/UX: Beautiful Tailwind CSS design, mobile responsive
✅ Features: Typing indicators, unread badges, message history

**Ready to use! Just:**
1. Run `npm install socket.io` in server folder
2. Start your server: `node server.js`
3. Test the chat widget on customer pages
4. Test admin dashboard at `/admin/messages.html`

Enjoy your new messaging feature! 🎉
