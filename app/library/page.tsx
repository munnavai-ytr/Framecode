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

  const [selectedCategory, setSelectedCategory] = useState<LibraryCategory | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [previewItem, setPreviewItem] = useState<{
    item: LibraryItem;
    url: string;
  } | null>(null);

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

  const filteredItems = items.filter((item) => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) {
      return false;
    }

    if (sourceFilter !== 'all' && item.source !== sourceFilter) {
      return false;
    }

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
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {/* Sticky Header */}
      <header className="sticky top-0 z-20 h-16 border-b border-border bg-surface-1/90 backdrop-blur-xs px-4 sm:px-8 flex items-center">
        <div className="max-w-[1400px] mx-auto w-full flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              href="/"
              className="flex h-11 w-11 lg:h-9 lg:w-9 items-center justify-center rounded-lg border border-border bg-surface-2 hover:bg-surface-3 hover:border-border-strong text-text transition"
              aria-label="Back to chat"
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
              className="flex min-h-[44px] lg:min-h-[38px] items-center space-x-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover active:bg-accent-pressed text-white font-medium text-xs transition cursor-pointer disabled:opacity-50"
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
        <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-8 pt-4">
          <div className="flex items-center justify-between p-3 bg-danger/10 border border-danger/40 rounded-xl text-xs text-danger">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-danger" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="flex h-8 w-8 items-center justify-center text-danger hover:text-text cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Sticky Filters Bar */}
        <div className="sticky top-16 z-10 p-4 bg-surface-2/95 backdrop-blur-xs border border-border rounded-[16px] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Category Chips */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 lg:pb-0">
              {categoriesList.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex min-h-[40px] lg:min-h-[34px] items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                      isActive
                        ? 'bg-surface-3 text-text border border-border-strong'
                        : 'border border-transparent text-muted hover:text-text hover:bg-surface-1'
                    }`}
                  >
                    <span>{cat.label}</span>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent-text" />}
                  </button>
                );
              })}
            </div>

            {/* Source Toggle, Date Range & Sort */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center bg-surface-1 border border-border rounded-lg p-0.5">
                {(['all', 'upload', 'ai'] as SourceFilter[]).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSourceFilter(src)}
                    className={`min-h-[36px] lg:min-h-[28px] px-2.5 py-1 rounded-md capitalize transition cursor-pointer ${
                      sourceFilter === src
                        ? 'bg-surface-2 text-text font-medium'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {src === 'upload' ? 'Uploads' : src === 'ai' ? 'AI Outputs' : 'All'}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-muted">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="min-h-[38px] lg:min-h-[32px] bg-surface-1 border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
                />
                <span className="text-muted">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="min-h-[38px] lg:min-h-[32px] bg-surface-1 border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
                />
              </div>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="min-h-[38px] lg:min-h-[32px] bg-surface-1 border border-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none focus:border-accent"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-muted">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} matching
          </div>
        </div>

        {/* Grid or Empty State */}
        {loading ? (
          <div className="py-20 text-center text-xs text-muted">Loading Library...</div>
        ) : items.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <Film className="w-12 h-12 text-border-strong mx-auto" />
            <p className="text-sm font-medium text-text">Nothing here yet</p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Videos you make and files you upload will appear here.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <p className="text-sm font-medium text-text">No items match these filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 min-[1440px]:grid-cols-5 gap-4">
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/85 backdrop-blur-xs"
          onClick={closePreview}
        >
          <div
            className="bg-surface-2 border border-border rounded-2xl max-w-3xl w-full p-4 overflow-hidden flex flex-col space-y-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <span className="text-sm font-medium text-text truncate">
                {previewItem.item.name}
              </span>
              <button
                type="button"
                onClick={closePreview}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-3 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center bg-surface-1 rounded-xl overflow-hidden min-h-[300px] max-h-[75vh]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg/80 backdrop-blur-xs">
          <div className="bg-surface-2 border border-border rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-text">Delete this item?</h3>
            <p className="text-xs text-muted">This cannot be undone.</p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-border bg-surface-1 text-xs font-medium text-text hover:bg-surface-3 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteItem(deleteConfirmId)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg bg-danger hover:bg-danger/90 text-xs font-medium text-white transition cursor-pointer"
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
    let createdUrl: string | null = null;
    if (item.hasThumb) {
      getThumb(item.id).then((blob) => {
        if (active && blob) {
          createdUrl = URL.createObjectURL(blob);
          setThumbUrl(createdUrl);
        }
      });
    }
    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
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
        return <Film className="w-8 h-8 text-accent-text" />;
      case 'image':
        return <ImageIcon className="w-8 h-8 text-accent" />;
      case 'pdf':
        return <FileText className="w-8 h-8 text-danger" />;
      case 'document':
        return <FileText className="w-8 h-8 text-success" />;
      default:
        return item.name.endsWith('.tsx') || item.name.endsWith('.js') ? (
          <FileCode className="w-8 h-8 text-accent-text" />
        ) : (
          <File className="w-8 h-8 text-muted" />
        );
    }
  };

  const canOpen = item.category === 'video' || item.category === 'image' || item.category === 'pdf';

  return (
    <div className="bg-surface-2 border border-border rounded-[16px] overflow-hidden flex flex-col justify-between group hover:border-border-strong transition">
      {/* Thumbnail or Fallback Icon */}
      <div
        onClick={() => canOpen && onOpen()}
        className={`relative w-full aspect-video bg-surface-1 flex items-center justify-center overflow-hidden ${
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
              ? 'bg-accent text-white'
              : 'bg-surface-3 text-text border border-border'
          }`}
        >
          {item.source === 'ai' ? 'AI' : 'Upload'}
        </span>
      </div>

      {/* Info & Actions */}
      <div className="p-3 space-y-2">
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-text truncate" title={item.name}>
            {item.name}
          </h4>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="capitalize">{item.category}</span>
            <span>{formatFileSize(item.size)}</span>
          </div>
          <div className="text-[10px] text-faint font-mono">
            {formatDate(item.createdAt)}
          </div>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          {canOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="flex min-h-[36px] items-center space-x-1 text-xs text-text hover:text-accent-text transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Open</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center space-x-1">
            <button
              type="button"
              onClick={onDownload}
              className="flex h-9 w-9 items-center justify-center text-muted hover:text-text hover:bg-surface-1 rounded-md transition cursor-pointer"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger hover:bg-danger/10 rounded-md transition cursor-pointer"
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
