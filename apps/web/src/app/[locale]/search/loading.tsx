import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <section aria-busy="true" aria-label="Loading game search">
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="mb-5 h-9 w-52" />
      <Skeleton className="mb-7 h-12 max-w-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="aspect-[16/11] w-full" />)}
      </div>
    </section>
  );
}
