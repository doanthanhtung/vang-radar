export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8" aria-label="Đang tải dữ liệu thị trường">
      <div className="h-72 animate-pulse rounded-xl bg-panel" />
      <div className="h-40 animate-pulse rounded-xl bg-panel" />
      <div className="h-80 animate-pulse rounded-xl bg-panel" />
    </main>
  );
}
