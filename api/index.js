// Vercel serverless entry for Express app
const server = require('../server');

// Export the Express app as the handler for Vercel
module.exports = server.app;
