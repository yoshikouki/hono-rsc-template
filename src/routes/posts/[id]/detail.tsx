import { Hono } from "hono";
import { AppLayout } from "@/components/app-layout";

function PostDetailPage({ id }: { id: string }) {
  return (
    <div>
      <h1 className="mb-4 font-bold text-3xl">Post Detail</h1>
      <p className="text-gray-600">
        Dynamic post id: <strong>{id}</strong>
      </p>
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
