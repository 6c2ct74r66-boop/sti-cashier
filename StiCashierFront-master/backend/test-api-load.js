console.log('Starting test-api-load.js');

try {
  console.log('About to require api.js...');
  const setupApiRoutes = require('./routes/api');
  console.log('Loaded successfully. Type:', typeof setupApiRoutes);
  console.log('Calling setupApiRoutes with mock objects...');
  const mockApp = {
    get: () => {},
    post: () => {},
    put: () => {},
    delete: () => {}
  };
  const mockPool = {};
  const mockAuth = () => {};
  setupApiRoutes(mockApp, mockPool, mockAuth);
  console.log('Successfully executed setupApiRoutes');
} catch (err) {
  console.error('ERROR:', err.message);
  console.error(err.stack);
}
