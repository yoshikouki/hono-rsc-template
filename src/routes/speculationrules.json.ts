import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) =>
  c.json({
    prefetch: [
      {
        source: "document",
        where: {
          and: [
            { href_matches: "/*" },
            { not: { href_matches: "/*.xml" } },
            { not: { href_matches: "/*.txt" } },
            { not: { href_matches: "/*.json" } },
            { not: { href_matches: "/__rsc/*" } },
          ],
        },
        eagerness: "moderate",
      },
    ],
  })
);

export default app;
