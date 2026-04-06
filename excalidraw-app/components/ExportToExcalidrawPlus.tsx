import React, { useState } from "react";

import { Card } from "@excalidraw/excalidraw/components/Card";
import { ToolButton } from "@excalidraw/excalidraw/components/ToolButton";
import { exportToCanvas } from "@excalidraw/excalidraw";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import { AimtutorWordmark } from "./AimtutorWordmark";

// ── PDF export helper ─────────────────────────────────────────────────────────
const downloadAsPdf = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
) => {
  const canvas = await exportToCanvas({
    elements,
    appState: {
      ...appState,
      exportBackground: true,
    },
    files,
    getDimensions: (width: number, height: number) => ({
      width,
      height,
      scale: 2, // 2× for crisp print quality
    }),
  });

  const dataUrl = canvas.toDataURL("image/png");

  // Open a minimal HTML page and trigger the browser's native print/Save-as-PDF dialog
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // Fallback: direct image download if popup blocked
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${name || "board"}.png`;
    a.click();
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${name || "AimTutor Board"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 0; size: auto; }
    html, body {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      background: #fff;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
    }
  </style>
</head>
<body>
  <img src="${dataUrl}" />
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 250);
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
};

// ── Re-exported for legacy callers (now a no-op Firebase stub) ────────────────
export const exportToExcalidrawPlus = async (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  name: string,
) => {
  await downloadAsPdf(elements, appState, files, name);
};

// ── Component ─────────────────────────────────────────────────────────────────
export const ExportToExcalidrawPlus: React.FC<{
  elements: readonly NonDeletedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  name: string;
  /** Passed when on a cloud board (unused here but accepted for compat). */
  boardId?: string | null;
  onError: (error: Error) => void;
  onSuccess: () => void;
}> = ({ elements, appState, files, name, onError, onSuccess }) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const btnLabel = done ? "✓ PDF ready!" : busy ? "Preparing PDF…" : "Download as PDF";

  const handleExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await downloadAsPdf(elements, appState, files, name);
      setDone(true);
      setTimeout(() => setDone(false), 3000);
      onSuccess();
    } catch (error: any) {
      console.error(error);
      onError(new Error("Could not export to PDF. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card color="primary">
      <div className="Card-icon">
        <AimtutorWordmark variant="card" onPrimary />
      </div>
      <h2>aimtutor.ai+</h2>
      <div className="Card-details">
        Download your board as a PDF via the browser print dialog.
      </div>
      <ToolButton
        className="Card-button"
        type="button"
        title={btnLabel}
        aria-label={btnLabel}
        showAriaLabel={true}
        onClick={handleExport}
      />
    </Card>
  );
};
