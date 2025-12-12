// components/UserMini.tsx
"use client";
import * as React from "react";

type UserMiniProps = {
    name?: string;        // "David Cardero"
    handle?: string;      // "@davidcarr"
    photoUrl?: string;    // "https://i.pravatar.cc/64?img=3" o "/avatar.png"
    onClick?: () => void; // opcional
};

export function UserMini({
    name = "David Cardero",
    handle = "@davidcarr",
    photoUrl = "",
    onClick,
}: UserMiniProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="
        group w-full bg-[#212121] flex items-center gap-3 rounded-lg
        px-2.5 py-2 transition-colors 
      "
            aria-label="Open account menu"
        >
            {/* Avatar con aro sutil (compacto) */}
            <span
                className="
          relative inline-flex items-center justify-center
          h-7 w-7 rounded-full p-[2px]
          bg-[conic-gradient(from_180deg,_#ff8a65_0deg,_#ffd180_120deg,_#80deea_240deg,_#ff8a65_360deg)]
        "
                aria-hidden
            >
                <span className="block h-full w-full rounded-full bg-white overflow-hidden">
                    <img
                        src={photoUrl}
                        alt={name}
                        className="h-full w-full rounded-full object-cover"
                        referrerPolicy="no-referrer"
                    />
                </span>
            </span>

            {/* Texto compacto (más chico que normal) */}
            <span className="flex min-w-0 flex-col text-left">
                <span className="truncate text-[13px] font-semibold leading-5 text-white">
                    {name}
                </span>
                <span className="truncate text-[11px] leading-4 text-white/60">
                    {handle}
                </span>
            </span>

            {/* Chevron sutil */}
            <svg
                className="ml-auto h-3.5 w-3.5 text-white/40 group-hover:text-white/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
            >
                <path d="m9 18 6-6-6-6" />
            </svg>
        </button>
    );
}
