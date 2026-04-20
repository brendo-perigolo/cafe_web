type PdfTicketOptions = {
  title: string;
  filename: string;
  text: string;
};

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);

const isStandalonePwa = () => {
  // iOS Safari
  if (typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean") {
    return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  }
  // Other browsers
  return window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
};

const openUrlInNewTab = (url: string) => {
  const w = window.open(url, "_blank");
  if (w) return true;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
};

const escapeHtml = (input: unknown) =>
  String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const openPdfInPrintHost = (blob: Blob, title: string) => {
  const url = URL.createObjectURL(blob);

  const w = window.open("", "_blank");
  if (!w) {
    openUrlInNewTab(url);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
          header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e5e7eb; padding: 12px; display: flex; gap: 10px; align-items: center; }
          button { appearance: none; border: 0; border-radius: 10px; padding: 10px 14px; background: #111827; color: #fff; font-weight: 600; }
          .hint { color: #6b7280; font-size: 12px; line-height: 1.3; }
          iframe { width: 100%; height: calc(100vh - 58px); border: 0; }
        </style>
      </head>
      <body>
        <header>
          <button id="printBtn" type="button">Imprimir</button>
          <div class="hint">Se não aparecer o diálogo, toque em “Imprimir” novamente.</div>
        </header>
        <iframe id="pdfFrame" src="${url}" title="${escapeHtml(title)}"></iframe>
        <script>
          (function(){
            var frame = document.getElementById('pdfFrame');
            var btn = document.getElementById('printBtn');
            function tryPrint(){
              try {
                if (frame && frame.contentWindow) {
                  frame.contentWindow.focus();
                  frame.contentWindow.print();
                }
              } catch (e) {
                // ignore
              }
            }
            if (btn) btn.addEventListener('click', tryPrint);
            if (frame) frame.addEventListener('load', function(){ setTimeout(tryPrint, 250); });
            setTimeout(tryPrint, 800);
          })();
        </script>
      </body>
    </html>
  `;

  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const shouldPreferPdfForTicket = () => isIOS() && isStandalonePwa();

export const openPdfTicketFromPosText = async (opts: PdfTicketOptions) => {
  const { jsPDF } = await import("jspdf");

  const mmToPt = (mm: number) => (mm * 72) / 25.4;

  const rawLines = String(opts.text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, " "));

  // The POS text is generally built for 32-char width. Still, enforce wrapping
  // to keep everything inside 58mm even if a line comes longer.
  const wrapToWidth = (line: string, maxChars: number) => {
    const chunks: string[] = [];
    const s = String(line ?? "");
    for (let i = 0; i < s.length; i += maxChars) {
      chunks.push(s.slice(i, i + maxChars));
    }
    return chunks.length ? chunks : [""];
  };

  const maxCharsPerLine = 32;
  const lines = rawLines.flatMap((l) => wrapToWidth(l, maxCharsPerLine));

  const pageWidthMm = 58;
  const marginMm = 1.2;
  const fontSizePt = 8.5;
  const lineHeightMm = 3.4;

  const topPaddingMm = 2.2;
  const bottomPaddingMm = 2.2;

  const minHeightMm = 60;
  const contentHeightMm =
    marginMm * 2 + topPaddingMm + Math.max(1, lines.length) * lineHeightMm + bottomPaddingMm;
  const pageHeightMm = Math.max(minHeightMm, Math.ceil(contentHeightMm + 1));

  const pageWidthPt = mmToPt(pageWidthMm);
  const pageHeightPt = mmToPt(pageHeightMm);
  const marginPt = mmToPt(marginMm);
  const lineHeightPt = mmToPt(lineHeightMm);
  const startYPt = mmToPt(marginMm + topPaddingMm);

  // Use pt to avoid any ambiguity in custom page sizes on iOS viewers.
  const doc = new jsPDF({
    unit: "pt",
    format: [pageWidthPt, pageHeightPt],
  });

  // Hint some PDF viewers to open print dialog.
  // Not all viewers respect this (notably iOS), but it doesn't hurt.
  try {
    (doc as unknown as { autoPrint?: () => void }).autoPrint?.();
  } catch {
    // ignore
  }

  doc.setFont("courier", "normal");
  doc.setFontSize(fontSizePt);

  let y = startYPt;
  for (const line of lines) {
    if (y > pageHeightPt - marginPt) break;
    // IMPORTANT: don't allow jsPDF to re-wrap, otherwise we can cut lines.
    // We already wrapped to a fixed POS width above.
    doc.text(line, marginPt, y);
    y += lineHeightPt;
  }

  const blob = doc.output("blob");

  // Prefer Web Share (files) when supported: this makes it easy to send to OpenLabel.
  try {
    const file = new File([blob], opts.filename, { type: "application/pdf" });
    const nav = navigator as Navigator & {
      canShare?: (data: unknown) => boolean;
      share?: (data: unknown) => Promise<void>;
    };

    if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: [file] })) {
      await nav.share({ title: opts.title, files: [file] });
      return;
    }
  } catch {
    // fallthrough to opening the PDF
  }

  // iOS: opening a PDF directly often doesn't show a print prompt.
  // We open a small host page that embeds the PDF and provides an explicit "Imprimir" button.
  if (isIOS()) {
    openPdfInPrintHost(blob, opts.title);
    return;
  }

  const url = URL.createObjectURL(blob);
  openUrlInNewTab(url);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
