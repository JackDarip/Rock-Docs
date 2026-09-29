"use client";
import { useId, useState } from "react";

/** A consistent file chooser: a button plus the chosen file name(s), instead of the raw browser control. */
export function FilePicker({ name, accept, multiple = false, required = false, disabled = false, label = "Choose file" }: {
  name: string; accept?: string; multiple?: boolean; required?: boolean; disabled?: boolean; label?: string;
}) {
  const id = useId();
  const [chosen, setChosen] = useState("");
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2">
      <label htmlFor={id} className={`btn btn-secondary btn-sm cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}>
        {label}
        <input id={id} type="file" name={name} accept={accept} multiple={multiple} required={required} disabled={disabled} className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            setChosen(files.length > 1 ? `${files.length} files` : files[0]?.name ?? "");
          }} />
      </label>
      <span className="min-w-0 truncate text-xs text-muted" title={chosen}>{chosen || (multiple ? "No files selected" : "No file selected")}</span>
    </span>
  );
}
