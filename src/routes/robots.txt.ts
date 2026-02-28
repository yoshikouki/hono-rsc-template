import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("User-agent: *\nAllow: /\n", 200, {
    "Content-Type": "text/plain; charset=utf-8",
  });
});

export default app;
