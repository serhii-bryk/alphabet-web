import { SearchResultsSkeleton } from '@/components/search';
import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
      <section aria-busy="true" aria-label="Loading search">
      <Skeleton className="mb-2 h-3 w-20" />
      <Skeleton className="mb-5 h-9 w-52" />
      <Skeleton className="mb-7 h-12 max-w-2xl" />
      <SearchResultsSkeleton />
    </section>
  );
}
