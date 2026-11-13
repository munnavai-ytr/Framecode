export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-20 h-16 border-b border-border bg-surface-1/90 px-4 sm:px-8 flex items-center">
        <div className="max-w-[1040px] mx-auto w-full flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-surface-2 border border-border animate-pulse" />
          <div className="h-6 w-28 rounded bg-surface-2 animate-pulse" />
        </div>
      </div>

      <div className="max-w-[1040px] mx-auto px-4 sm:px-8 py-8 flex flex-col lg:flex-row gap-8">
        <aside className="hidden lg:block w-[220px] shrink-0 space-y-2">
          <div className="h-10 w-full rounded-xl bg-surface-2 animate-pulse" />
          <div className="h-10 w-full rounded-xl bg-surface-2 animate-pulse" />
        </aside>

        <div className="flex-1 max-w-[760px] space-y-6">
          <div className="p-4 bg-surface-2 border border-border rounded-[16px] h-16 animate-pulse" />

          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-surface-2 border border-border rounded-[16px] p-5 space-y-4 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-surface-3" />
                    <div className="h-3 w-56 rounded bg-surface-3/60" />
                  </div>
                  <div className="h-6 w-24 rounded-full bg-surface-1" />
                </div>
                <div className="h-10 w-full rounded-xl bg-surface-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
