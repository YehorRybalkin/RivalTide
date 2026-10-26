import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-80" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]"><Skeleton className="h-96 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>
    </div>
  );
}
