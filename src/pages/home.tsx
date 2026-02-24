import { Suspense } from "react";
import { ClientClock } from "@/components/client-clock";
import { ClickCounter } from "@/components/click-counter";

// ─── Async Server Component (runs only on server, can await freely) ───────────

async function SlowServerData() {
  // Simulates a slow data fetch (DB, external API, etc.)
  await new Promise<void>((r) => setTimeout(r, 1500));
  const now = new Date().toISOString();
  return (
    <div
      style={{
        background: "#f0fff4",
        border: "1px solid #9ae6b4",
        borderRadius: "6px",
        padding: "0.75rem 1rem",
      }}
    >
      <strong>Loaded ✓</strong> — fetched at {now} (server time, 1.5s delay)
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const section: React.CSSProperties = {
  marginBottom: "2.5rem",
};

const h2: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: "600",
  marginBottom: "0.75rem",
  borderBottom: "1px solid #eee",
  paddingBottom: "0.4rem",
};

export function HomePage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>Hono RSC Template</title>
      </head>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: "640px",
          margin: "0 auto",
          padding: "2rem 1rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          Hono RSC Template
        </h1>
        <p style={{ color: "#666", marginBottom: "2.5rem" }}>
          React Server Components + Hono on Cloudflare Workers
        </p>

        {/* ── 1. Client Component: live clock ─────────────────────────────── */}
        <section style={section}>
          <h2 style={h2}>⏰ Client Component — live clock</h2>
          <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
            <code>"use client"</code> + <code>useEffect</code> + <code>setInterval</code>.
            Updates every second in the browser.
          </p>
          <ClientClock />
        </section>

        {/* ── 2. Client Component: click counter ──────────────────────────── */}
        <section style={section}>
          <h2 style={h2}>🖱️ Client Component — click counter</h2>
          <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
            <code>"use client"</code> + <code>useState</code>. Zero JS shipped for the
            rest of this page.
          </p>
          <ClickCounter />
        </section>

        {/* ── 3. Async Server Component + Suspense ────────────────────────── */}
        <section style={section}>
          <h2 style={h2}>⏳ Async Server Component + Suspense</h2>
          <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
            The server streams a fallback immediately, then replaces it when the slow
            component resolves (~1.5s).
          </p>
          <Suspense
            fallback={
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fbd38d",
                  borderRadius: "6px",
                  padding: "0.75rem 1rem",
                  color: "#744210",
                }}
              >
                ⏳ Loading data from server…
              </div>
            }
          >
            <SlowServerData />
          </Suspense>
        </section>

        {/* ── 4. API routes ────────────────────────────────────────────────── */}
        <section style={section}>
          <h2 style={h2}>🔌 API routes (Hono)</h2>
          <ul style={{ lineHeight: "2" }}>
            <li>
              <a href="/api/hello">/api/hello</a> — JSON response
            </li>
            <li>
              <a href="/api/env">/api/env</a> — reads <code>GREETING</code> from{" "}
              <code>wrangler.toml [vars]</code> via <code>c.env</code>
            </li>
          </ul>
        </section>

        {/* ── 5. Server Component (rendered at request time) ───────────────── */}
        <section style={section}>
          <h2 style={h2}>🖥️ Server Component — rendered at request time</h2>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            No <code>"use client"</code> — this HTML was generated on the server.
          </p>
          <ServerTime />
        </section>
      </body>
    </html>
  );
}

function ServerTime() {
  const now = new Date().toISOString();
  return (
    <code
      style={{
        background: "#f0f0f0",
        padding: "0.25rem 0.75rem",
        borderRadius: "4px",
      }}
    >
      {now}
    </code>
  );
}
