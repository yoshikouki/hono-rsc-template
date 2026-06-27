import { Hono } from "hono";
import { AppLayout } from "@/components/app-layout";
import { PostIdForm } from "@/components/post-id-form";

function PostDetailPage({ id }: { id: string }) {
  return (
    <div>
      <h1 className="mb-4 font-bold text-3xl">Post Detail</h1>
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

const app = new Hono();

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
