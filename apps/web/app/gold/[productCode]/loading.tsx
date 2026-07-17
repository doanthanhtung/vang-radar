import { Card, CardContent } from "../../../components/ui/card";

export default function ProductLoading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto max-w-7xl px-4 py-8"
      aria-label="Đang tải phân tích sản phẩm"
      aria-busy="true"
    >
      <div className="mb-4 h-11 w-44 animate-pulse rounded-md bg-border/50" />
      <div className="mb-6 h-20 max-w-md animate-pulse rounded-md bg-border/60" />
      <section className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index}>
            <CardContent>
              <div className="h-4 w-20 animate-pulse rounded bg-border/70" />
              <div className="mt-3 h-6 w-28 animate-pulse rounded bg-border/60" />
            </CardContent>
          </Card>
        ))}
      </section>
      <div className="my-6 h-52 animate-pulse rounded-lg border border-border bg-panel" />
      <div className="space-y-4">
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
