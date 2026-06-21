import { Card, CardContent } from "../../../components/ui/card";

export default function ProductLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 h-16 max-w-sm animate-pulse rounded-md bg-border/60" />
      <section className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index}>
            <CardContent>
              <div className="h-4 w-20 animate-pulse rounded bg-border/70" />
              <div className="mt-3 h-6 w-28 animate-pulse rounded bg-border/60" />
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="my-6 grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="h-48 animate-pulse rounded-lg border border-border bg-panel" />
        <div className="h-48 animate-pulse rounded-lg border border-border bg-panel" />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-lg border border-border bg-panel"
          />
        ))}
      </div>
    </main>
  );
}
