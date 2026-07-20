/**
 * Canvas payload types — shared by world, state, and chrome.
 */

import type { CompNode, FlowTokens } from "../render";

export type FileListItem = {
  id: string;
  name: string;
  pageCount: number;
  updatedAt: string;
};

export type CanvasPage = {
  id: string;
  name: string;
  journeyId: string | null;
  journeyName: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  root: CompNode;
};

export type CanvasPayload = {
  fileId: string;
  fileName: string;
  tokens: FlowTokens;
  journeys: { id: string; name: string; y: number; pageIds: string[] }[];
  pages: CanvasPage[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
};

export const MIN_SCALE = 0.12;
export const MAX_SCALE = 2;
