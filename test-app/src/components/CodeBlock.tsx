import { useState } from "react";

export function CodeBlock({
  code,
  filename,
}: {
  code: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-[#1a1a1a] overflow-hidden">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-stone-800 text-[11px] text-stone-500">
          <span>{filename}</span>
        </div>
      )}
      <div className="relative p-4 xl:text-[#6E1313] xl:text-[#892323] xl:text-[#C47070]">
        <button
          onClick={copy}
          className="absolute top-3 right-3 px-2 py-1 rounded text-[11px] text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <pre className="font-mono text-[13px] leading-relaxed text-[#FFF0E6] overflow-x-auto whitespace-pre text-[#FFFFFF]">
          {code}
        </pre>
      </div>
    </div>
  );
}
