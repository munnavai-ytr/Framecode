export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-[#1F1E1D] text-[#FAF9F5] p-4 sm:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#2A2927] border border-[#3A3835] animate-pulse" />
          <div className="w-40 h-6 rounded bg-[#2A2927] animate-pulse" />
        </div>

        <div className="p-4 bg-[#2A2927] border border-[#3A3835] rounded-xl h-16 animate-pulse" />

        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-[#2A2927] border border-[#3A3835] rounded-xl p-5 space-y-4 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-32 rounded bg-[#3A3835]/60" />
                  <div className="h-3 w-56 rounded bg-[#3A3835]/40" />
                </div>
                <div className="h-6 w-24 rounded-full bg-[#1F1E1D]" />
              </div>
              <div className="h-9 w-full rounded-lg bg-[#1F1E1D]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
