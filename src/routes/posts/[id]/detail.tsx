import { type Env, Hono } from "hono";
import type { BlankSchema } from "hono/types";
import { AppLayout } from "@/components/app-layout";
import { PostIdForm } from "@/components/post-id-form";

function PostDetailPage({ id }: { id: string }) {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-bold">Post Detail</h1>
      <p className="text-gray-600">
        Dynamic post id: <strong>{id}</strong>
      </p>
      <p className="mt-4">
        <a className="underline hover:no-underline" href="/posts">
          Back to posts
        </a>
      </p>
      <PostIdForm id={id} />
    </div>
  );
}

// The file router mounts this module at /posts/:id/detail.
const app = new Hono<Env, BlankSchema, "/posts/:id/detail">();

app.get("/", (c) => {
  const id = c.req.param("id");
  return c.render(
    <AppLayout>
      <PostDetailPage id={id} />
    </AppLayout>,
    {
      description: `Detail page for post ${id}`,
      title: `Post ${id}`,
    }
  );
});

export default app;
