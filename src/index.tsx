import { Hono } from "hono";

const app = new Hono();

// API routes — add your endpoints here
app.get("/api/hello", (c) => {
  return c.json({ message: "Hello from Hono!", timestamp: Date.now() });
});

app.get("/healthz", (c) => c.text("ok"));

export default app;
