import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import Post from '../post/post.model.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.count();
    const activeCommunities = await Community.count({ where: { status: 'active' } });
    const totalBusinesses = await BusinessProfile.count();
    const pendingVerifications = await BusinessProfile.count({ where: { is_verified: false } });
    const totalPosts = await Post.count();

    return successResponse(res, 200, 'Dashboard stats fetched successfully', {
      totalUsers,
      activeCommunities,
      totalBusinesses,
      pendingVerifications,
      totalPosts
    });
  } catch (error) {
    return errorResponse(res, 500, 'Error fetching dashboard stats', error);
  }
};

export const getRecentActivities = async (req, res) => {
  try {
    // Fetching 5 latest users
    const recentUsers = await User.findAll({
      order: [['created_at', 'DESC']],
      limit: 5,
      attributes: ['userId', 'userName', 'email', 'created_at']
    });

    // Fetching 5 latest businesses
    const recentBusinesses = await BusinessProfile.findAll({
      order: [['created_at', 'DESC']],
      limit: 5,
      attributes: ['id', 'business_name', 'created_at', 'is_verified']
    });

    // We can format this into a unified activity feed
    const activities = [
      ...recentUsers.map(u => ({
        id: `user_${u.userId}`,
        title: 'New User Registered',
        description: `${u.userName} joined the platform`,
        date: u.created_at,
        type: 'user'
      })),
      ...recentBusinesses.map(b => ({
        id: `biz_${b.id}`,
        title: 'New Business Registered',
        description: `${b.business_name} created a business profile`,
        date: b.created_at,
        type: 'business'
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    return successResponse(res, 200, 'Recent activities fetched successfully', activities);
  } catch (error) {
    return errorResponse(res, 500, 'Error fetching recent activities', error);
  }
};

export const getAnalyticsData = async (req, res) => {
  try {
    // For MVP, we'll return structured analytics data
    // In production, you would aggregate this with GROUP BY / Sequelize functions over time
    
    // Example: User registrations over the last 6 months
    const userGrowth = [
      { month: 'Jan', users: 120 },
      { month: 'Feb', users: 210 },
      { month: 'Mar', users: 180 },
      { month: 'Apr', users: 320 },
      { month: 'May', users: 450 },
      { month: 'Jun', users: 560 }
    ];

    // Example: Businesses by category
    const businessDistribution = [
      { name: 'Retail', value: 45, color: '#f97316' }, // orange-500
      { name: 'Food & Beverage', value: 30, color: '#3b82f6' }, // blue-500
      { name: 'Services', value: 20, color: '#a855f7' }, // purple-500
      { name: 'Healthcare', value: 5, color: '#22c55e' } // green-500
    ];

    const platformEngagement = {
      activeUsers: 840,
      totalPostsThisMonth: 1240,
      totalBookings: 350
    };

    return successResponse(res, 200, 'Analytics fetched successfully', {
      userGrowth,
      businessDistribution,
      platformEngagement
    });
  } catch (error) {
    return errorResponse(res, 500, 'Error fetching analytics', error);
  }
};

