"use client";

import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n-context";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,image/jpeg,image/png,application/pdf";

export function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    /\.(pdf|jpe?g|png)$/i.test(name)
  );
}

export function FileDropZone({
  title,
  file,
  preview,
  isPdf,
  onFile,
}: {
  title: string;
  file: File | null;
  preview: string | null;
  isPdf: boolean;
  onFile: (file: File) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onFile(next);
          event.target.value = "";
        }}
      />
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const next = event.dataTransfer.files?.[0];
          if (next) onFile(next);
        }}
        className={`flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-6 py-10 text-center transition ${
          dragOver
            ? "border-[#789d90] bg-white"
            : "border-[#b8c9c2] bg-white/70 hover:border-[#789d90] hover:bg-white"
        }`}
      >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="mb-4 max-h-56 rounded-xl" />
      ) : file && isPdf ? (
        <FileText size={36} className="mb-3 text-[#376d5b]" />
      ) : (
        <span className="mb-4 grid h-[62px] w-[62px] place-items-center rounded-[18px] bg-[#edf4f1] text-[#376d5b] shadow-[inset_0_0_0_1px_#dce8e3]">
          <Upload size={26} />
        </span>
      )}
      <p className="max-w-xs truncate text-base font-semibold tracking-tight text-[#17221f]">
        {file ? file.name : title}
      </p>
      <p className="mt-1 text-[11px] text-[#89928e]">
        {file && isPdf ? "PDF — toutes les pages seront analysées" : t("formatsAcceptes")}
      </p>
      <p className="mt-3 text-[11px] text-[#69736f]">Déposez le fichier ici, ou cliquez pour le choisir</p>
      </div>
    </div>
  );
}
