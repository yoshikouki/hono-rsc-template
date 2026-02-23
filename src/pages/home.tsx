// React Server Component — no "use client" directive, runs only on the server

export function HomePage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <title>Hono RSC Template</title>
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h1>Hello from React Server Components!</h1>
        <p>
          This page is rendered as an RSC on Cloudflare Workers.
          No JavaScript bundle is shipped for this component.
        </p>
        <p>
          Try the API: <a href="/api/hello">/api/hello</a>
        </p>
        <ServerTime />
      </body>
    </html>
  );
}

// Another Server Component — can be async
async function ServerTime() {
  // This runs on the server; you can fetch data, read DB, etc.
  const now = new Date().toISOString();
  return <p style={{ color: "gray" }}>Rendered at: {now}</p>;
}
