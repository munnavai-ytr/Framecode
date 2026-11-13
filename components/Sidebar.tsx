'use client';

import React from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, X, Video, Settings, FolderKanban } from 'lucide-react';
import { ChatSession } from '@/types/framecode';

interface SidebarProps {
  pastChats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onNavigate?: (href: string) => void;
}

const SidebarInner: React.FC<SidebarProps> = ({
  pastChats,
  activeChatId,
  onSelectChat,
  onNewChat,
  isOpenMobile = false,
  onCloseMobile,
  onNavigate,
}) => {
  const sortedChats = [...pastChats].sort((a, b) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  const formatDate = (chat: ChatSession) => {
    if (chat.updatedAt) {
      try {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(chat.updatedAt));
      } catch {
        return chat.timestamp || '';
      }
    }
    return chat.timestamp || '';
  };

  const handleNavClick = (e: React.MouseEvent, href: string) => {
    if (onCloseMobile) onCloseMobile();
    if (onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
  };

  const content = (
    <div className="flex h-full w-[260px] min-[1440px]:w-[280px] flex-col justify-between border-r border-border bg-surface-1 p-3 select-none">
      {/* Top: App Brand + New Chat Button */}
      <div className="space-y-3 overflow-y-auto">
        {/* Brand Lockup */}
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-border bg-surface-2">
              <Video className="h-3.5 w-3.5 text-accent-text" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-text">
              Framecode
            </span>
          </div>

          {/* Close button for mobile drawer */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-11 w-11 lg:hidden items-center justify-center rounded-[8px] text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* New Chat Button */}
        <button
          type="button"
          onClick={() => {
            onNewChat();
            if (onCloseMobile) onCloseMobile();
          }}
          className="flex min-h-[44px] lg:min-h-[40px] w-full items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 text-xs font-medium text-text hover:bg-surface-3 hover:border-border-strong transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5 text-accent-text" />
          <span>New chat</span>
        </button>

        {/* Section Title */}
        <div className="px-2 pt-2">
          <span className="text-[11px] font-medium text-faint">
            Recent chats
          </span>
        </div>

        {/* Past Chats List */}
        <div className="space-y-1">
          {sortedChats.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-faint">
              No saved chats yet
            </div>
          ) : (
            sortedChats.map((chat) => {
              const isActive = chat.id === activeChatId;
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => {
                    onSelectChat(chat.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`group flex w-full min-h-[44px] items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-surface-3 text-text border border-accent'
                      : 'border border-transparent text-muted hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-75 group-hover:opacity-100" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate font-medium">{chat.title}</span>
                    <span className="text-[10px] text-faint">
                      {formatDate(chat)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom Footer: Library & Settings Navigation Side-by-Side */}
      <div className="border-t border-border pt-3 px-1 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)] lg:pb-0">
        <Link
          href="/library"
          prefetch
          onClick={(e) => handleNavClick(e, '/library')}
          className="flex min-h-[44px] lg:min-h-[38px] items-center justify-center space-x-1.5 px-2 py-2 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 hover:border-border-strong text-xs font-medium text-text transition"
        >
          <FolderKanban className="w-3.5 h-3.5 text-accent-text" />
          <span>Library</span>
        </Link>
        <Link
          href="/settings"
          prefetch
          onClick={(e) => handleNavClick(e, '/settings')}
          className="flex min-h-[44px] lg:min-h-[38px] items-center justify-center space-x-1.5 px-2 py-2 rounded-lg border border-border bg-surface-2 hover:bg-surface-3 hover:border-border-strong text-xs font-medium text-text transition"
        >
          <Settings className="w-3.5 h-3.5 text-muted" />
          <span>Settings</span>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block h-full w-[260px] min-[1440px]:w-[280px] shrink-0">
        {content}
      </aside>

      {/* Mobile / Tablet Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-bg/80 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};

export const Sidebar = React.memo(SidebarInner);
