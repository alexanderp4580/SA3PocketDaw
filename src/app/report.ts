import { buildReport } from './services';
import { reportFileName } from './format';

export async function reportJson(): Promise<string> {
  return JSON.stringify(await buildReport(), null, 2);
}

/** Copies text to the clipboard; falls back to a hidden textarea where the async API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
}

export async function copyReport(): Promise<boolean> {
  return copyText(await reportJson());
}

export async function downloadReport(): Promise<void> {
  const blob = new Blob([await reportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = reportFileName(new Date().toISOString());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
