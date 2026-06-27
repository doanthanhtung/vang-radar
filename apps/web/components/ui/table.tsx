import { cn } from "../../lib/utils";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn("w-full border-collapse text-sm tabular-nums", className)} {...props} />
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "border-b border-white/[0.08] bg-slate-950/35 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400",
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-white/[0.07] px-4 py-3.5 align-middle", className)}
      {...props}
    />
  );
}
