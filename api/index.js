// Vercel serverless function entrypoint wrapper
// Vercel looks for this to deploy the Express application

// Since we compiled TS to 'dist/server.js', we import the compiled version.
// Alternatively, if Vercel compiles TS, we could import '../server' directly.

const app = require('../dist/server.js').default;

module.exports = app;