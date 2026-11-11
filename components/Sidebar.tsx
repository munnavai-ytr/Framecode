'use client';

import React from 'react';
import { Plus, MessageSquare, X, Video } from 'lucide-react';
import { ChatSession } from '@/types/framecode';

interface SidebarProps {
  pastChats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  pastChats,
  activeChatId,
  onSelectChat,
  onNewChat,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex h-full w-[260px] flex-col justify-between border-r border-[#3A3835] bg-[#1F1E1D] p-3 select-none">
      {/* Top: App Brand + New Chat Button */}
      <div className="space-y-3">
        {/* Brand Lockup */}
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-[#3A3835] bg-[#2A2927]">
              <Video className="h-3.5 w-3.5 text-[#FAF9F5]" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-[#FAF9F5]">
              Framecode
            </span>
          </div>

          {/* Close button for mobile drawer */}
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="flex h-8 w-8 lg:hidden items-center justify-center rounded-[8px] text-[#A8A59E] hover:text-[#FAF9F5] hover:bg-[#2A2927]"
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
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[12px] border border-[#3A3835] bg-[#2A2927] px-3 text-xs font-medium text-[#FAF9F5] hover:bg-[#33322F] hover:border-[#484542] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New chat</span>
        </button>

        {/* Section Title */}
        <div className="px-2 pt-2">
          <span className="text-[11px] font-medium text-[#A8A59E]">
            Recent chats
          </span>
        </div>

        {/* 5 Dummy Past Chats List */}
        <div className="space-y-1">
          {pastChats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => {
                  onSelectChat(chat.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`group flex w-full min-h-[44px] items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'bg-[#2A2927] text-[#FAF9F5] border border-[#3A3835]'
                    : 'text-[#A8A59E] hover:bg-[#2A2927]/60 hover:text-[#FAF9F5]'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate font-medium">{chat.title}</span>
                  <span className="text-[10px] text-[#A8A59E]/70">
                    {chat.timestamp}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer Information */}
      <div className="border-t border-[#3A3835] pt-3 px-2">
        <div className="flex items-center justify-between text-[11px] text-[#A8A59E]">
          <span>Remotion · React 19</span>
          <span className="font-mono text-[10px] text-[#A8A59E]/70">v1.0</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block h-full w-[260px] shrink-0">
        {content}
      </aside>

      {/* Mobile / Tablet Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          {/* Drawer container */}
          <div className="relative z-10 h-full shadow-2xl">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
