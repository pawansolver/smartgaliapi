import Example from './example.model.js';

export const getApiStatus = async () => {
  try {
    // Optionally check database connection by doing a simple query
    await Example.findOne(); // If this fails, it means DB is not connected properly
    
    return {
      status: 'active',
      database: 'connected',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Database connection test failed in Example Service:', error);
    return {
      status: 'active',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    };
  }
};
