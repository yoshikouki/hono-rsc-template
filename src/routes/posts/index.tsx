import { Hono } from "hono";
import { AppLayout } from "@/components/app-layout";
import { PostIdForm } from "@/components/post-id-form";

function PostsPage() {
  return (
    <div>
      <h1 className="mb-4 font-bold text-3xl">Posts</h1>
      <p className="mb-6 text-gray-600">
        Try a nested dynamic route at{" "}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">
          /posts/:id/detail
        </code>
        .
      </p>
      <div className="space-y-3">
        <a
          className="block underline hover:no-underline"
          href="/posts/alpha/detail"
        >
          Open alpha
        </a>
        <a
          className="block underline hover:no-underline"
          href="/posts/bravo/detail"
        >
          Open bravo
        </a>
      </div>
      <PostIdForm id="alpha" />
    </div>
  );
}

const app = new Hono();

app.get("/", (c) =>
  c.render(
    <AppLayout>
      <PostsPage />
    </AppLayout>,
    {
      description: "Nested dynamic post routes",
      title: "Posts",
    }
  )
);

export default app;
