export function AdminShellLoading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-[70vh] max-w-7xl space-y-6 px-4 py-8"
      aria-label="Đang chuẩn bị trang quản trị"
      aria-busy="true"
    >
      <div className="animate-pulse">
        <div className="h-4 w-28 rounded bg-slate-700/70" />
        <div className="mt-3 h-9 w-64 max-w-full rounded bg-slate-700/70" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-slate-700/50" />
      </div>
      <div className="grid animate-pulse gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 rounded-lg border border-border bg-panel/70" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg border border-border bg-panel/70" />
    </main>
  );
}
