'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  Film,
  Image as ImageIcon,
  FileText,
  FileCode,
  File,
  Download,
  Trash2,
  Eye,
  X,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { LibraryItem, LibraryCategory } from '@/types/framecode';
import {
  listLibrary,
  addLibraryItem,
  getBlob,
  getThumb,
  deleteLibraryItem,
} from '@/lib/db';
import {
  categorize,
  readMediaInfo,
  makeThumb,
  formatFileSize,
  MAX_FILE_SIZE_BYTES,
  getFileTooLargeMessage,
} from '@/lib/files';

type SourceFilter = 'all' | 'upload' | 'ai';
type SortOrder = 'newest' | 'oldest';

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState<LibraryCategory | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // Preview Dialog state
  const [previewItem, setPreviewItem] = useState<{
    item: LibraryItem;
    url: string;
  } | null>(null);

  // Delete Confirm Modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLibrary = async () => {
    try {
      setLoading(true);
      const data = await listLibrary();
      setItems(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load Library';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        const data = await listLibrary();
        if (active) setItems(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load Library';
        if (active) setErrorMessage(msg);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  // Revoke preview dialog URL when closed
  const closePreview = () => {
    if (previewItem) {
      URL.revokeObjectURL(previewItem.url);
      setPreviewItem(null);
    }
  };

  const handleUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setErrorMessage(null);
    setUploading(true);

    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          setErrorMessage(getFileTooLargeMessage(file.name));
          break;
        }

        const category = categorize(file.name, file.type);
        const info = await readMediaInfo(file);
        const kind = category === 'video' ? 'video' : 'image';
        const thumbBlob =
          category === 'video' || category === 'image'
            ? await makeThumb(file, kind)
            : null;

        const id = crypto.randomUUID();
        const meta: LibraryItem = {
          id,
          name: file.name,
          category,
          source: 'upload',
          mime: file.type || 'application/octet-stream',
          size: file.size,
          createdAt: new Date().toISOString(),
          width: info.width,
          height: info.height,
          duration: info.duration,
          hasThumb: Boolean(thumbBlob),
        };

        await addLibraryItem(meta, file, thumbBlob);
      }

      await fetchLibrary();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save item to Library';
      setErrorMessage(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenItem = async (item: LibraryItem) => {
    if (item.category === 'file' || item.category === 'document') {
      handleDownloadItem(item);
      return;
    }

    try {
      const blob = await getBlob(item.id);
      if (!blob) {
        setErrorMessage(`File data for ${item.name} is not available.`);
        return;
      }

      const url = URL.createObjectURL(blob);
      if (item.category === 'pdf') {
        window.open(url, '_blank');
      } else {
        setPreviewItem({ item, url });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not open file';
      setErrorMessage(msg);
    }
  };

  const handleDownloadItem = async (item: LibraryItem) => {
    try {
      const blob = await getBlob(item.id);
      if (!blob) {
        setErrorMessage(`File data for ${item.name} is not available.`);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not download file';
      setErrorMessage(msg);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteLibraryItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setDeleteConfirmId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete item';
      setErrorMessage(msg);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    // Category filter
    if (selectedCategory !== 'all' && item.category !== selectedCategory) {
      return false;
    }

    // Source filter
    if (sourceFilter !== 'all' && item.source !== sourceFilter) {
      return false;
    }

    // Date range filter
    if (fromDate) {
      const itemTime = new Date(item.createdAt).getTime();
      const startOfDay = new Date(fromDate).setHours(0, 0, 0, 0);
      if (itemTime < startOfDay) return false;
    }
    if (toDate) {
      const itemTime = new Date(item.createdAt).getTime();
      const endOfDay = new Date(toDate).setHours(23, 59, 59, 999);
      if (itemTime > endOfDay) return false;
    }

    return true;
  });

  // Sort items
  filteredItems.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
  });

  const categoriesList: Array<{ id: LibraryCategory | 'all'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'video', label: 'Videos' },
    { id: 'image', label: 'Images' },
    { id: 'document', label: 'Documents' },
    { id: 'pdf', label: 'PDFs' },
    { id: 'file', label: 'Files' },
  ];

  return (
    <div className="min-h-screen bg-[#1F1E1D] text-[#FAF9F5] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#3A3835] bg-[#2A2927] px-4 py-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="p-2 rounded-lg border border-[#3A3835] bg-[#1F1E1D] hover:bg-[#33322F] text-[#FAF9F5] transition"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Library</h1>
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              multiple
              onChange={handleUploadFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-[#D97757] hover:bg-[#D97757]/90 text-white font-medium text-xs transition cursor-pointer disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Error alert banner */}
      {errorMessage && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 pt-4">
          <div className="flex items-center justify-between p-3 bg-red-950/40 border border-red-900/50 rounded-xl text-xs text-red-300">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Filters Bar */}
        <div className="p-4 bg-[#2A2927] border border-[#3A3835] rounded-xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Category Chips */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {categoriesList.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                      isActive
                        ? 'bg-[#33322F] text-[#FAF9F5] border border-[#3A3835]'
                        : 'text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#1F1E1D]'
                    }`}
                  >
                    <span>{cat.label}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#D97757]" />}
                  </button>
                );
              })}
            </div>

            {/* Source Toggle, Date Range & Sort */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* Source Toggle */}
              <div className="flex items-center bg-[#1F1E1D] border border-[#3A3835] rounded-lg p-0.5">
                {(['all', 'upload', 'ai'] as SourceFilter[]).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSourceFilter(src)}
                    className={`px-2.5 py-1 rounded-md capitalize transition ${
                      sourceFilter === src
                        ? 'bg-[#2A2927] text-[#FAF9F5] font-medium'
                        : 'text-[#A8A59E] hover:text-[#FAF9F5]'
                    }`}
                  >
                    {src === 'upload' ? 'Uploads' : src === 'ai' ? 'AI Outputs' : 'All'}
                  </button>
                ))}
              </div>

              {/* Date From & To */}
              <div className="flex items-center space-x-2">
                <span className="text-[#A8A59E]">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-[#1F1E1D] border border-[#3A3835] rounded-lg px-2 py-1 text-xs text-[#FAF9F5] focus:outline-none focus:border-[#D97757]"
                />
                <span className="text-[#A8A59E]">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-[#1F1E1D] border border-[#3A3835] rounded-lg px-2 py-1 text-xs text-[#FAF9F5] focus:outline-none focus:border-[#D97757]"
                />
              </div>

              {/* Sort Dropdown */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="bg-[#1F1E1D] border border-[#3A3835] rounded-lg px-2.5 py-1 text-xs text-[#FAF9F5] focus:outline-none focus:border-[#D97757]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-[#A8A59E]">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} matching
          </div>
        </div>

        {/* Grid or Empty State */}
        {loading ? (
          <div className="py-20 text-center text-xs text-[#A8A59E]">Loading Library...</div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <Film className="w-12 h-12 text-[#3A3835] mx-auto" />
            <p className="text-sm font-medium text-[#FAF9F5]">Nothing here yet</p>
            <p className="text-xs text-[#A8A59E] max-w-sm mx-auto">
              Videos you make and files you upload will appear here.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <p className="text-sm font-medium text-[#FAF9F5]">No items match these filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredItems.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                onOpen={() => handleOpenItem(item)}
                onDownload={() => handleDownloadItem(item)}
                onDelete={() => setDeleteConfirmId(item.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* In-page Video / Image Preview Dialog */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-[#2A2927] border border-[#3A3835] rounded-2xl max-w-3xl w-full p-4 overflow-hidden flex flex-col space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#3A3835]">
              <span className="text-sm font-medium text-[#FAF9F5] truncate">
                {previewItem.item.name}
              </span>
              <button
                type="button"
                onClick={closePreview}
                className="p-1 rounded-lg text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#3A3835] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-[#1F1E1D] rounded-xl overflow-hidden min-h-[300px] max-h-[75vh]">
              {previewItem.item.category === 'video' ? (
                <video
                  src={previewItem.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[75vh] w-full rounded-lg"
                />
              ) : (
                <img
                  src={previewItem.url}
                  alt={previewItem.item.name}
                  className="max-h-[75vh] max-w-full object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-[#2A2927] border border-[#3A3835] rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-[#FAF9F5]">Delete this item?</h3>
            <p className="text-xs text-[#A8A59E]">This cannot be undone.</p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 rounded-lg border border-[#3A3835] bg-[#1F1E1D] text-xs font-medium text-[#FAF9F5] hover:bg-[#33322F] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(deleteConfirmId)}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-xs font-medium text-white transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LibraryCard({
  item,
  onOpen,
  onDownload,
  onDelete,
}: {
  item: LibraryItem;
  onOpen: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (item.hasThumb) {
      getThumb(item.id).then((blob) => {
        if (active && blob) {
          setThumbUrl(URL.createObjectURL(blob));
        }
      });
    }
    return () => {
      active = false;
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
      }
    };
  }, [item.id, item.hasThumb]);

  const formatDate = (isoStr: string) => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(isoStr));
    } catch {
      return isoStr;
    }
  };

  const renderCategoryIcon = () => {
    switch (item.category) {
      case 'video':
        return <Film className="w-8 h-8 text-[#D97757]" />;
      case 'image':
        return <ImageIcon className="w-8 h-8 text-blue-400" />;
      case 'pdf':
        return <FileText className="w-8 h-8 text-red-400" />;
      case 'document':
        return <FileText className="w-8 h-8 text-emerald-400" />;
      default:
        return item.name.endsWith('.tsx') || item.name.endsWith('.js') ? (
          <FileCode className="w-8 h-8 text-purple-400" />
        ) : (
          <File className="w-8 h-8 text-[#A8A59E]" />
        );
    }
  };

  const canOpen = item.category === 'video' || item.category === 'image' || item.category === 'pdf';

  return (
    <div className="bg-[#2A2927] border border-[#3A3835] rounded-xl overflow-hidden flex flex-col justify-between group hover:border-[#484542] transition">
      {/* Thumbnail or Fallback Icon */}
      <div
        onClick={() => canOpen && onOpen()}
        className={`relative w-full aspect-video bg-[#1F1E1D] flex items-center justify-center overflow-hidden ${
          canOpen ? 'cursor-pointer' : ''
        }`}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          renderCategoryIcon()
        )}

        {/* Source badge overlay */}
        <span
          className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${
            item.source === 'ai'
              ? 'bg-[#D97757]/90 text-white'
              : 'bg-[#3A3835]/90 text-[#FAF9F5]'
          }`}
        >
          {item.source === 'ai' ? 'AI' : 'Upload'}
        </span>
      </div>

      {/* Info & Actions */}
      <div className="p-3 space-y-2">
        <div className="space-y-0.5">
          <h4
            className="text-xs font-semibold text-[#FAF9F5] truncate"
            title={item.name}
          >
            {item.name}
          </h4>
          <div className="flex items-center justify-between text-[11px] text-[#A8A59E]">
            <span className="capitalize">{item.category}</span>
            <span>{formatFileSize(item.size)}</span>
          </div>
          <div className="text-[10px] text-[#A8A59E]/70 font-mono">
            {formatDate(item.createdAt)}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-2 border-t border-[#3A3835]">
          {canOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="flex items-center space-x-1 text-xs text-[#FAF9F5] hover:text-[#D97757] transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Open</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onDownload}
              className="p-1.5 text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#1F1E1D] rounded-md transition cursor-pointer"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-[#A8A59E] hover:text-red-400 hover:bg-red-500/10 rounded-md transition cursor-pointer"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
