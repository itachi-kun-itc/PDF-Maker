import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type ScannedDocumentPage = {
  uri: string;
  width?: number;
  height?: number;
};

export type DocumentPoint = {
  x: number;
  y: number;
};

export type DocumentCorners = {
  topLeftCorner: DocumentPoint;
  topRightCorner: DocumentPoint;
  bottomLeftCorner: DocumentPoint;
  bottomRightCorner: DocumentPoint;
};

type FallbackScanner = {
  findPaperContour: (image: { delete: () => void }) => ({ delete: () => void } & { data32S: Int32Array }) | null;
  getCornerPoints: (contour: { delete: () => void }) => Partial<DocumentCorners>;
  extractPaper: (
    image: HTMLImageElement | HTMLCanvasElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints?: DocumentCorners
  ) => HTMLCanvasElement | null;
};

export const createDocumentScanner = async (): Promise<FallbackScanner> => ({
  findPaperContour: () => null,
  getCornerPoints: () => ({}),
  extractPaper: () => null,
});

export const scanDocumentImage = async (uri: string): Promise<ScannedDocumentPage> => {
  const image = await ImageManipulator.manipulate(uri).renderAsync();
  const result = await image.saveAsync({
    compress: 1,
    format: SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
};
