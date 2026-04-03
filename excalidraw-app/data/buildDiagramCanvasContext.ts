import type {
  ExcalidrawMagicFrameElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

/**
 * Compact, non-sensitive summary of the frame export for AI (diagram-to-code).
 * Helps the model infer layout intent beyond the raster image alone.
 */
export type DiagramCanvasContext = {
  frame: {
    width: number;
    height: number;
    name: string | null;
  };
  scene: {
    theme: string;
    viewBackgroundColor: string | null;
    /** Editor zoom when the request was made (not export scale). */
    zoom: number;
  };
  contents: {
    elementCount: number;
    countsByType: Record<string, number>;
    hasArrows: boolean;
    hasImages: boolean;
    hasEmbeds: boolean;
  };
};

export function buildDiagramCanvasContext(
  frame: ExcalidrawMagicFrameElement,
  children: readonly NonDeletedExcalidrawElement[],
  appState: AppState,
): DiagramCanvasContext {
  const countsByType: Record<string, number> = {};
  let hasArrows = false;
  let hasImages = false;
  let hasEmbeds = false;

  for (const el of children) {
    countsByType[el.type] = (countsByType[el.type] ?? 0) + 1;
    if (el.type === "arrow") {
      hasArrows = true;
    }
    if (el.type === "image") {
      hasImages = true;
    }
    if (el.type === "embeddable" || el.type === "iframe") {
      hasEmbeds = true;
    }
  }

  return {
    frame: {
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      name: frame.name,
    },
    scene: {
      theme: appState.theme,
      viewBackgroundColor: appState.viewBackgroundColor ?? null,
      zoom: appState.zoom.value,
    },
    contents: {
      elementCount: children.length,
      countsByType,
      hasArrows,
      hasImages,
      hasEmbeds,
    },
  };
}
