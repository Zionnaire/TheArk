// Attach io to each request
app.use((req, res, next) => {
  req.io = io;
  next();
});
