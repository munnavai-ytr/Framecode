export default function LibraryLoading() {
  return (
    <div className="min-h-screen bg-[#1F1E1D] text-[#FAF9F5] flex flex-col">
      <header className="border-b border-[#3A3835] bg-[#2A2927] px-4 py-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 rounded-lg bg-[#1F1E1D] border border-[#3A3835] animate-pulse" />
            <div className="w-24 h-6 rounded bg-[#3A3835]/60 animate-pulse" />
          </div>
          <div className="w-24 h-8 rounded-xl bg-[#3A3835]/60 animate-pulse" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div className="p-4 bg-[#2A2927] border border-[#3A3835] rounded-xl h-20 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-[#2A2927] border border-[#3A3835] rounded-xl overflow-hidden animate-pulse"
            >
              <div className="w-full aspect-video bg-[#1F1E1D]" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 w-3/4 rounded bg-[#3A3835]/60" />
                <div className="h-3 w-1/2 rounded bg-[#3A3835]/40" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
