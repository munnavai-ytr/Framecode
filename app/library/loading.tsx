export default function LibraryLoading() {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      <header className="sticky top-0 z-20 h-16 border-b border-border bg-surface-1/90 px-4 sm:px-8 flex items-center">
        <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border animate-pulse" />
            <div className="w-24 h-6 rounded bg-surface-2 animate-pulse" />
          </div>
          <div className="w-24 h-9 rounded-xl bg-surface-2 animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-8 space-y-6">
        <div className="p-4 bg-surface-2 border border-border rounded-[16px] h-20 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 min-[1440px]:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-surface-2 border border-border rounded-[16px] overflow-hidden animate-pulse"
            >
              <div className="w-full aspect-video bg-surface-1" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-surface-3" />
                <div className="h-3 w-1/2 rounded bg-surface-3/60" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
