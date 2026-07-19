export function TaskListSkeleton() {
  return (
    <ul className="flex flex-col gap-1.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="bg-ink-1 rounded-md px-3 py-2 flex items-center gap-3 animate-pulse"
        >
          <div className="h-3.5 w-3.5 rounded-sm bg-ink-2" />
          <div className="h-4 w-20 rounded-md bg-ink-2" />
          <div className="h-4 flex-1 max-w-[40%] rounded-md bg-ink-2/70" />
          <div className="ml-auto h-3 w-16 rounded-md bg-ink-2/60" />
        </li>
      ))}
    </ul>
  );
}
