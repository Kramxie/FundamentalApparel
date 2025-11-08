const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);

        // --- Execute all queries in parallel for efficiency ---
        const [
            totalSalesResult,
            todaySalesResult,
            totalOrdersResult,
            newCustomersTodayResult,
            salesLast7DaysResult,
            recentOrdersResult,
            lowStockProductsResult
        ] = await Promise.allSettled([
            // Query 1: Total Sales
            Order.aggregate([
                { $match: { status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalPrice' } } }
            ]),
            // Query 2: Today's Sales
            Order.aggregate([
                { $match: { createdAt: { $gte: today }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalPrice' } } }
            ]),
            // Query 3: Total Orders
            Order.countDocuments(),
            // Query 4: New Customers Today
            User.countDocuments({ createdAt: { $gte: today } }),
            // Query 5: Sales Chart Data (Last 7 Days)
            Order.aggregate([
                { $match: { createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$totalPrice" } } },
                { $sort: { _id: 1 } }
            ]),
            // Query 6: Recent Orders
            Order.find().populate('user', 'name').sort({ createdAt: -1 }).limit(5),
            // Query 7: Low Stock Products
            Product.find({ countInStock: { $lte: 5 } }).sort({ countInStock: 1 }).limit(5)
        ]);

        // --- Safely process the results ---
        const totalSales = (totalSalesResult.status === 'fulfilled' && totalSalesResult.value.length > 0) ? totalSalesResult.value[0].total : 0;
        const todaySales = (todaySalesResult.status === 'fulfilled' && todaySalesResult.value.length > 0) ? todaySalesResult.value[0].total : 0;
        const totalOrders = totalOrdersResult.status === 'fulfilled' ? totalOrdersResult.value : 0;
        const newCustomersToday = newCustomersTodayResult.status === 'fulfilled' ? newCustomersTodayResult.value : 0;
        const salesLast7Days = salesLast7DaysResult.status === 'fulfilled' ? salesLast7DaysResult.value : [];
        const recentOrders = recentOrdersResult.status === 'fulfilled' ? recentOrdersResult.value : [];
        const lowStockProducts = lowStockProductsResult.status === 'fulfilled' ? lowStockProductsResult.value : [];
        
        // Log any specific query that failed for easier debugging
        if (recentOrdersResult.status === 'rejected') {
            console.error("Error fetching recent orders:", recentOrdersResult.reason);
        }

        res.status(200).json({
            success: true,
            data: {
                totalSales,
                todaySales,
                totalOrders,
                newCustomersToday,
                salesLast7Days,
                recentOrders,
                lowStockProducts
            }
        });

    } catch (error) {
        // This outer catch is a final fallback
        console.error('A critical error occurred in getDashboardStats:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};