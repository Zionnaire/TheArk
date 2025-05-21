// ...

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
  });
  
// Handle rate limit exceeded error
  app.use((err, req, res, next) => {
    if (err instanceof RateLimitExceededError) {
      res.status(429).json({ message: 'Too many requests, please try again later.' });
    } else {
      next(err);
    }
  });

// Handle validation errors
  app.use((err, req, res, next) => {
    if (err instanceof ValidationError) {
      res.status(400).json({ message: err.message });
    } else {
      next(err);
    }
  });

// Handle authentication errors
  app.use((err, req, res, next) => {
    if (err instanceof AuthenticationError) {
      res.status(401).json({ message: 'Unauthorized access' });
    } else {
      next(err);
    }
  });

// Handle authorization errors  
  app.use((err, req, res, next) => {
    if (err instanceof AuthorizationError) {
      res.status(403).json({ message: 'Forbidden access' });
    } else {
      next(err);
    }
  });

// Handle not found errors
  app.use((req, res) => {
    res.status(404).json({ message: 'Resource not found' });
  });

// Handle all other errors

  app.use((err, req, res, next) => {
    res.status(500).json({ message: 'Internal Server Error' });
  }
  );

  module.exports = app;