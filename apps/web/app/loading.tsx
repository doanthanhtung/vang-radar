export default function Loading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="space-y-6 pb-12"
      aria-label="Đang tải dữ liệu thị trường"
      aria-busy="true"
    >
      <section className="dashboard-visual">
        <div className="mx-auto max-w-7xl animate-pulse px-4 pb-12 pt-8 md:pb-14 md:pt-12">
          <div className="h-6 w-56 rounded bg-slate-700/70" />
          <div className="mt-5 h-14 w-full max-w-xl rounded bg-slate-700/70" />
          <div className="mt-5 h-5 w-full max-w-2xl rounded bg-slate-700/50" />
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 rounded-lg bg-slate-700/45" />
            ))}
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl space-y-6 px-4">
        <section className="animate-pulse rounded-lg border border-border/60 bg-panel/75 p-4">
          <div className="h-6 w-52 rounded bg-slate-700/70" />
          <div className="mt-4 space-y-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-16 rounded-md bg-slate-700/40" />
            ))}
          </div>
        </section>
        <section className="animate-pulse rounded-lg border border-border/60 bg-panel/75 p-4">
          <div className="h-6 w-48 rounded bg-slate-700/70" />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-28 rounded-md bg-slate-700/40" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
