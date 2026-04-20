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

export const shouldPreferPdfForTicket = () => isIOS() && isStandalonePwa();

export const openPdfTicketFromPosText = async (opts: PdfTicketOptions) => {
  const { jsPDF } = await import("jspdf");

  const lines = String(opts.text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, " "));

  const pageWidthMm = 58;
  const marginMm = 2;
  const fontSizePt = 10;
  const lineHeightMm = 4;

  const minHeightMm = 60;
  const contentHeightMm = marginMm * 2 + Math.max(1, lines.length) * lineHeightMm;
  const pageHeightMm = Math.max(minHeightMm, Math.ceil(contentHeightMm));

  const doc = new jsPDF({
    unit: "mm",
    format: [pageWidthMm, pageHeightMm],
  });

  doc.setFont("courier", "normal");
  doc.setFontSize(fontSizePt);

  let y = marginMm + 4;
  for (const line of lines) {
    if (y > pageHeightMm - marginMm) break;
    doc.text(line, marginMm, y);
    y += lineHeightMm;
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

  const url = URL.createObjectURL(blob);
  openUrlInNewTab(url);

  // Keep the blob URL alive briefly for iOS.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
