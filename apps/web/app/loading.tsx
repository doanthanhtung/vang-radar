export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8" aria-label="Đang tải dữ liệu thị trường">
      <section className="animate-pulse overflow-hidden rounded-2xl border border-border/60 bg-panel/75 p-6 md:p-10">
        <div className="mx-auto h-3 w-44 rounded bg-slate-700/80" />
        <div className="mx-auto mt-5 h-12 w-64 max-w-full rounded bg-slate-700/80" />
        <div className="mx-auto mt-5 h-5 w-full max-w-xl rounded bg-slate-700/60" />
        <div className="mx-auto mt-2 h-5 w-4/5 max-w-lg rounded bg-slate-700/60" />
        <div className="mt-8 grid grid-cols-3 divide-x divide-border/60 rounded-lg border border-border/60">
          {[1, 2, 3].map((item) => <div key={item} className="h-16 bg-slate-700/40" />)}
        </div>
      </section>
      <section className="animate-pulse rounded-xl border border-border/60 bg-panel/75 p-4">
        <div className="h-5 w-44 rounded bg-slate-700/70" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-16 rounded-lg bg-slate-700/45" />)}
        </div>
      </section>
      <section className="animate-pulse rounded-xl border border-border/60 bg-panel/75 p-4">
        <div className="h-5 w-48 rounded bg-slate-700/70" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 rounded-lg bg-slate-700/40" />)}
        </div>
      </section>
    </main>
  );
}
