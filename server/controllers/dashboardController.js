const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const CustomOrder = require('../models/CustomOrder');

// @desc    Get dashboard statistics (Enhanced E-commerce Analytics)
// @route   GET /api/dashboard/stats
// @access  Private/Admin
exports.getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 7);
        
        // Current month calculation
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        
        // Last month calculation
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);

        // --- Execute all queries in parallel for efficiency ---
        const [
            totalSalesResult,
            todaySalesResult,
            thisMonthSalesResult,
            lastMonthSalesResult,
            totalOrdersResult,
            pendingOrdersResult,
            completedOrdersResult,
            newCustomersTodayResult,
            newCustomersThisMonthResult,
            salesLast7DaysResult,
            salesLast30DaysResult,
            recentOrdersResult,
            lowStockProductsResult,
            topProductsResult,
            customOrdersStatsResult,
            averageOrderValueResult
        ] = await Promise.allSettled([
            // Query 1: Total Sales (All-time)
            Order.aggregate([
                { $match: { status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalPrice' } } }
            ]),
            // Query 2: Today's Sales
            Order.aggregate([
                { $match: { createdAt: { $gte: today }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalPrice' } } }
            ]),
            // Query 3: This Month's Sales
            Order.aggregate([
                { $match: { createdAt: { $gte: currentMonthStart }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalPrice' } } }
            ]),
            // Query 4: Last Month's Sales (for growth calculation)
            Order.aggregate([
                { $match: { createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, total: { $sum: '$totalPrice' } } }
            ]),
            // Query 5: Total Orders
            Order.countDocuments(),
            // Query 6: Pending Orders
            Order.countDocuments({ status: 'Pending' }),
            // Query 7: Completed Orders
            Order.countDocuments({ status: 'Delivered' }),
            // Query 8: New Customers Today
            User.countDocuments({ createdAt: { $gte: today }, role: 'user' }),
            // Query 9: New Customers This Month
            User.countDocuments({ createdAt: { $gte: currentMonthStart }, role: 'user' }),
            // Query 10: Sales Chart Data (Last 7 Days)
            Order.aggregate([
                { $match: { createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$totalPrice" }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            // Query 11: Sales Chart Data (Last 30 Days)
            Order.aggregate([
                { $match: { createdAt: { $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) }, status: { $ne: 'Cancelled' } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, total: { $sum: "$totalPrice" }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            // Query 12: Recent Orders
            Order.find().populate('user', 'name email').sort({ createdAt: -1 }).limit(5),
            // Query 13: Low Stock Products
            Product.find({ countInStock: { $lte: 5 } }).sort({ countInStock: 1 }).limit(5),
            // Query 14: Top Selling Products (by order items)
            Order.aggregate([
                { $match: { status: { $ne: 'Cancelled' } } },
                { $unwind: '$orderItems' },
                { $group: { 
                    _id: '$orderItems.product', 
                    totalSold: { $sum: '$orderItems.qty' },
                    revenue: { $sum: { $multiply: ['$orderItems.qty', '$orderItems.price'] } }
                }},
                { $sort: { totalSold: -1 } },
                { $limit: 5 },
                { $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productInfo'
                }},
                { $unwind: { path: '$productInfo', preserveNullAndEmptyArrays: true } }
            ]),
            // Query 15: Custom Orders Stats
            CustomOrder.aggregate([
                { $group: { 
                    _id: '$serviceType',
                    count: { $sum: 1 },
                    revenue: { $sum: '$totalAmount' }
                }}
            ]),
            // Query 16: Average Order Value
            Order.aggregate([
                { $match: { status: { $ne: 'Cancelled' } } },
                { $group: { _id: null, avg: { $avg: '$totalPrice' } } }
            ])
        ]);

        // --- Safely process the results ---
        const totalSales = (totalSalesResult.status === 'fulfilled' && totalSalesResult.value.length > 0) ? totalSalesResult.value[0].total : 0;
        const todaySales = (todaySalesResult.status === 'fulfilled' && todaySalesResult.value.length > 0) ? todaySalesResult.value[0].total : 0;
        const thisMonthSales = (thisMonthSalesResult.status === 'fulfilled' && thisMonthSalesResult.value.length > 0) ? thisMonthSalesResult.value[0].total : 0;
        const lastMonthSales = (lastMonthSalesResult.status === 'fulfilled' && lastMonthSalesResult.value.length > 0) ? lastMonthSalesResult.value[0].total : 0;
        
        const totalOrders = totalOrdersResult.status === 'fulfilled' ? totalOrdersResult.value : 0;
        const pendingOrders = pendingOrdersResult.status === 'fulfilled' ? pendingOrdersResult.value : 0;
        const completedOrders = completedOrdersResult.status === 'fulfilled' ? completedOrdersResult.value : 0;
        
        const newCustomersToday = newCustomersTodayResult.status === 'fulfilled' ? newCustomersTodayResult.value : 0;
        const newCustomersThisMonth = newCustomersThisMonthResult.status === 'fulfilled' ? newCustomersThisMonthResult.value : 0;
        
        const salesLast7Days = salesLast7DaysResult.status === 'fulfilled' ? salesLast7DaysResult.value : [];
        const salesLast30Days = salesLast30DaysResult.status === 'fulfilled' ? salesLast30DaysResult.value : [];
        const recentOrders = recentOrdersResult.status === 'fulfilled' ? recentOrdersResult.value : [];
        const lowStockProducts = lowStockProductsResult.status === 'fulfilled' ? lowStockProductsResult.value : [];
        const topProducts = topProductsResult.status === 'fulfilled' ? topProductsResult.value : [];
        const customOrdersStats = customOrdersStatsResult.status === 'fulfilled' ? customOrdersStatsResult.value : [];
        const averageOrderValue = (averageOrderValueResult.status === 'fulfilled' && averageOrderValueResult.value.length > 0) ? averageOrderValueResult.value[0].avg : 0;
        
        // Calculate growth percentages
        const revenueGrowth = lastMonthSales > 0 ? (((thisMonthSales - lastMonthSales) / lastMonthSales) * 100).toFixed(1) : 0;
        const orderCompletionRate = totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0;
        
        // Log any specific query that failed for easier debugging
        if (recentOrdersResult.status === 'rejected') {
            console.error("Error fetching recent orders:", recentOrdersResult.reason);
        }

        res.status(200).json({
            success: true,
            data: {
                // Revenue metrics
                totalSales,
                todaySales,
                thisMonthSales,
                lastMonthSales,
                revenueGrowth,
                averageOrderValue,
                
                // Order metrics
                totalOrders,
                pendingOrders,
                completedOrders,
                orderCompletionRate,
                
                // Customer metrics
                newCustomersToday,
                newCustomersThisMonth,
                
                // Chart data
                salesLast7Days,
                salesLast30Days,
                
                // Lists
                recentOrders,
                lowStockProducts,
                topProducts,
                customOrdersStats
            }
        });

    } catch (error) {
        // This outer catch is a final fallback
        console.error('A critical error occurred in getDashboardStats:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};