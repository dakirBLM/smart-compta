"use client";

import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`max-h-[90vh] w-full overflow-auto rounded-2xl bg-white p-6 shadow-2xl ${
          wide ? "max-w-3xl" : "max-w-lg"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
