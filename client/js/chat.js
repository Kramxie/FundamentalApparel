// chat.js - Real-time messaging widget for customer-admin chat
(function() {
    const API_BASE = 'https://unmumbled-balloonlike-gayle.ngrok-free.dev';
    const SOCKET_URL = 'https://unmumbled-balloonlike-gayle.ngrok-free.dev';
    
    let socket = null;
    let currentUser = null;
    let adminUser = null;
    let messages = [];
    let isOpen = false;
    let typingTimeout = null;

    // Create chat widget HTML
    function createChatWidget() {
        const chatHTML = `
            <!-- Chat Button -->
            <div id="chat-widget-container" class="fixed bottom-6 right-6 z-50">
                <!-- Floating Chat Button -->
                <button 
                    id="chat-toggle-btn" 
                    class="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    aria-label="Open chat"
                >
                    <i class="fas fa-comments text-2xl"></i>
                    <span id="unread-badge" class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold"></span>
                </button>

                <!-- Chat Window -->
                <div 
                    id="chat-window" 
                    class="hidden absolute bottom-20 right-0 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden"
                    style="height: 500px; max-height: calc(100vh - 150px);"
                >
                    <!-- Chat Header -->
                    <div class="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between">
                        <div class="flex items-center space-x-3">
                            <div class="w-10 h-10 bg-white rounded-full flex items-center justify-center">
                                <i class="fas fa-user-shield text-indigo-600"></i>
                            </div>
                            <div>
                                <h3 class="font-semibold">Admin Support</h3>
                                <p class="text-xs text-indigo-100" id="admin-status">Online</p>
                            </div>
                        </div>
                        <button 
                            id="close-chat-btn" 
                            class="text-white hover:text-indigo-100 transition-colors"
                            aria-label="Close chat"
                        >
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <!-- Messages Container -->
                    <div id="messages-container" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                        <div id="messages-list"></div>
                        <div id="typing-indicator" class="hidden text-sm text-gray-500 italic">
                            Admin is typing...
                        </div>
                    </div>

                    <!-- Message Input -->
                    <div class="border-t border-gray-200 p-4 bg-white">
                        <div class="flex space-x-2">
                            <input 
                                type="text" 
                                id="message-input" 
                                placeholder="Type your message..." 
                                class="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                aria-label="Message input"
                            />
                            <button 
                                id="send-message-btn" 
                                class="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full w-10 h-10 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                aria-label="Send message"
                            >
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Inject HTML into page
        document.body.insertAdjacentHTML('beforeend', chatHTML);
    }

    // Initialize chat widget
    async function initChat() {
        const token = localStorage.getItem('token');
        
        if (!token) {
            console.log('User not logged in, chat widget disabled');
            return;
        }

        try {
            // Fetch current user info
            const userResponse = await fetch(`${API_BASE}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!userResponse.ok) {
                console.error('Failed to fetch user info');
                return;
            }

            const userData = await userResponse.json();
            currentUser = userData.data;

            // Don't show chat widget for admin users (they use the admin panel)
            if (currentUser.role === 'admin') {
                console.log('Admin user detected, chat widget disabled');
                return;
            }

            // Get admin user ID
            await fetchAdminUser();

            // Create chat widget UI
            createChatWidget();

            // Setup event listeners
            setupEventListeners();

            // Initialize Socket.io connection
            initSocket(token);

            // Load chat history
            await loadChatHistory();

            // Get unread count
            await updateUnreadCount();

        } catch (error) {
            console.error('Chat initialization error:', error);
        }
    }

    // Fetch admin user
    async function fetchAdminUser() {
        try {
            const response = await fetch(`${API_BASE}/api/auth/admin-user`);
            if (response.ok) {
                const data = await response.json();
                adminUser = data.data;
            } else {
                console.error('Failed to fetch admin user');
            }
        } catch (error) {
            console.error('Error fetching admin user:', error);
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        const toggleBtn = document.getElementById('chat-toggle-btn');
        const closeBtn = document.getElementById('close-chat-btn');
        const sendBtn = document.getElementById('send-message-btn');
        const messageInput = document.getElementById('message-input');

        toggleBtn.addEventListener('click', toggleChat);
        closeBtn.addEventListener('click', toggleChat);
        sendBtn.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });

        // Typing indicator
        messageInput.addEventListener('input', handleTyping);
    }

    // Toggle chat window
    function toggleChat() {
        const chatWindow = document.getElementById('chat-window');
        const toggleBtn = document.getElementById('chat-toggle-btn');
        
        isOpen = !isOpen;
        
        if (isOpen) {
            chatWindow.classList.remove('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-times text-2xl"></i>';
            markMessagesAsRead();
            scrollToBottom();
        } else {
            chatWindow.classList.add('hidden');
            toggleBtn.innerHTML = '<i class="fas fa-comments text-2xl"></i><span id="unread-badge" class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center font-bold"></span>';
        }
    }

    // Initialize Socket.io
    function initSocket(token) {
        socket = io(SOCKET_URL, {
            auth: {
                token: token
            },
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Socket.io connected');
            updateAdminStatus('Online');
        });

        socket.on('disconnect', () => {
            console.log('Socket.io disconnected');
            updateAdminStatus('Offline');
        });

        socket.on('receiveMessage', (data) => {
            handleReceiveMessage(data);
        });

        socket.on('messageSent', (data) => {
            // Message confirmation - already handled by optimistic UI
        });

        socket.on('userTyping', (data) => {
            showTypingIndicator(data.isTyping);
        });

        socket.on('messageError', (error) => {
            console.error('Socket message error:', error);
            alert('Failed to send message. Please try again.');
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            updateAdminStatus('Connection Error');
        });
    }

    // Load chat history
    async function loadChatHistory() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE}/api/messages`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load messages');
            }

            const data = await response.json();
            messages = data.data;

            // Extract admin user from messages if available
            if (messages.length > 0) {
                const adminMessage = messages.find(m => m.sender.role === 'admin' || m.recipient.role === 'admin');
                if (adminMessage) {
                    adminUser = adminMessage.sender.role === 'admin' ? adminMessage.sender : adminMessage.recipient;
                }
            }

            renderMessages();
            scrollToBottom();
        } catch (error) {
            console.error('Error loading chat history:', error);
        }
    }

    // Render messages
    function renderMessages() {
        const messagesList = document.getElementById('messages-list');
        
        if (messages.length === 0) {
            messagesList.innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-comments text-4xl mb-2"></i>
                    <p>Start a conversation with admin</p>
                </div>
            `;
            return;
        }

        messagesList.innerHTML = messages.map(msg => {
            const isOwn = msg.sender._id === currentUser._id;
            const time = new Date(msg.createdAt).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });

            return `
                <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3">
                    <div class="max-w-[75%]">
                        ${!isOwn ? `<p class="text-xs text-gray-500 mb-1">${msg.sender.name}</p>` : ''}
                        <div class="${isOwn ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200'} rounded-lg px-4 py-2 shadow-sm">
                            <p class="text-sm">${escapeHtml(msg.message)}</p>
                        </div>
                        <p class="text-xs text-gray-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}">${time}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Handle receiving message
    function handleReceiveMessage(data) {
        const newMessage = {
            _id: Date.now().toString(),
            sender: {
                _id: data.senderId,
                name: 'Admin',
                role: 'admin'
            },
            recipient: {
                _id: currentUser._id
            },
            message: data.message,
            createdAt: data.timestamp,
            isRead: isOpen
        };

        messages.push(newMessage);
        renderMessages();
        scrollToBottom();

        // Update unread count if chat is closed
        if (!isOpen) {
            updateUnreadCount();
        } else {
            markMessagesAsRead();
        }

        // Play notification sound (optional)
        playNotificationSound();
    }

    // Send message
    async function sendMessage() {
        const messageInput = document.getElementById('message-input');
        const message = messageInput.value.trim();

        if (!message || !adminUser) {
            if (!adminUser) {
                alert('Admin user not available. Please try again later.');
            }
            return;
        }

        // Clear input
        messageInput.value = '';

        // Optimistic UI update
        const tempMessage = {
            _id: 'temp-' + Date.now(),
            sender: {
                _id: currentUser._id,
                name: currentUser.name
            },
            recipient: {
                _id: adminUser._id
            },
            message: message,
            createdAt: new Date().toISOString()
        };

        messages.push(tempMessage);
        renderMessages();
        scrollToBottom();

        try {
            // Send via Socket.io for real-time delivery
            socket.emit('sendMessage', {
                recipientId: adminUser._id,
                message: message
            });

            // Also save to database via API
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE}/api/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipientId: adminUser._id,
                    message: message
                })
            });

            if (!response.ok) {
                throw new Error('Failed to save message');
            }

            const data = await response.json();
            
            // Replace temp message with real one
            const tempIndex = messages.findIndex(m => m._id === tempMessage._id);
            if (tempIndex !== -1) {
                messages[tempIndex] = data.data;
                renderMessages();
            }

        } catch (error) {
            console.error('Error sending message:', error);
            // Remove temp message on error
            messages = messages.filter(m => m._id !== tempMessage._id);
            renderMessages();
            alert('Failed to send message. Please try again.');
        }
    }

    // Handle typing indicator
    function handleTyping() {
        if (!adminUser) return;

        socket.emit('typing', {
            recipientId: adminUser._id
        });

        // Clear previous timeout
        if (typingTimeout) {
            clearTimeout(typingTimeout);
        }

        // Set new timeout to stop typing after 2 seconds of inactivity
        typingTimeout = setTimeout(() => {
            socket.emit('stopTyping', {
                recipientId: adminUser._id
            });
        }, 2000);
    }

    // Show typing indicator
    function showTypingIndicator(isTyping) {
        const indicator = document.getElementById('typing-indicator');
        if (isTyping) {
            indicator.classList.remove('hidden');
            scrollToBottom();
        } else {
            indicator.classList.add('hidden');
        }
    }

    // Mark messages as read
    async function markMessagesAsRead() {
        const unreadMessages = messages.filter(m => 
            m.recipient._id === currentUser._id && !m.isRead
        );

        if (unreadMessages.length === 0) return;

        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_BASE}/api/messages/read`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    messageIds: unreadMessages.map(m => m._id)
                })
            });

            // Update local state
            unreadMessages.forEach(m => m.isRead = true);
            updateUnreadCount();

        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }

    // Update unread count
    async function updateUnreadCount() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_BASE}/api/messages/unread-count`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            const count = data.count;

            const badge = document.getElementById('unread-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        } catch (error) {
            console.error('Error fetching unread count:', error);
        }
    }

    // Update admin status
    function updateAdminStatus(status) {
        const statusElement = document.getElementById('admin-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    // Scroll to bottom
    function scrollToBottom() {
        setTimeout(() => {
            const container = document.getElementById('messages-container');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 100);
    }

    // Play notification sound
    function playNotificationSound() {
        // Optional: Add notification sound
        // const audio = new Audio('/path/to/notification.mp3');
        // audio.play();
    }

    // Escape HTML to prevent XSS
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChat);
    } else {
        initChat();
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (socket) {
            socket.disconnect();
        }
    });
})();
