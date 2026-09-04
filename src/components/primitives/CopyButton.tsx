'use client';

import { useState } from 'react';

export function CopyButton({ value, label = 'Copy', className = '' }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure origin, permissions) — control stays inert */
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `${label} to clipboard`} className={`btn btn-sm btn-quiet ${className}`}>
      <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
      <span className="label-sm" style={{ color: 'inherit' }}>{copied ? 'Copied' : label}</span>
    </button>
  );
}
