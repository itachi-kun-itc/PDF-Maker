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

const OPENCV_SCRIPT_ID = 'opencv-js-document-scanner';
const JSCANIFY_SCRIPT_ID = 'jscanify-document-scanner';
const OPENCV_URL = 'https://cdn.jsdelivr.net/npm/jscanify@1.4.2/src/opencv.js';
const JSCANIFY_URL = 'https://cdn.jsdelivr.net/npm/jscanify@1.4.2/src/jscanify.js';

type OpenCvMat = {
  delete: () => void;
};

type ScannerWindow = Window &
  typeof globalThis & {
    cv?: unknown;
    jscanify?: new () => {
      findPaperContour: (image: OpenCvMat) => (OpenCvMat & { data32S: Int32Array }) | null;
      getCornerPoints: (contour: OpenCvMat) => Partial<DocumentCorners>;
      extractPaper: (
        image: HTMLImageElement | HTMLCanvasElement,
        resultWidth: number,
        resultHeight: number,
        cornerPoints?: DocumentCorners
      ) => HTMLCanvasElement | null;
    };
    Module?: {
      onRuntimeInitialized?: () => void;
    };
  };

const loadScript = (id: string, src: string) =>
  new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(id) as HTMLScriptElement | null;
    if (existingScript?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`${src} の読み込みに失敗しました。`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`${src} の読み込みに失敗しました。`));
    document.head.appendChild(script);
  });

const loadOpenCv = async () => {
  const scannerWindow = window as ScannerWindow;
  if (scannerWindow.cv) return;

  await new Promise<void>((resolve, reject) => {
    scannerWindow.Module = {
      onRuntimeInitialized: () => resolve(),
    };

    loadScript(OPENCV_SCRIPT_ID, OPENCV_URL).catch(reject);
  });
};

const loadJscanify = async () => {
  const scannerWindow = window as ScannerWindow;
  if (scannerWindow.jscanify) return;

  await loadScript(JSCANIFY_SCRIPT_ID, JSCANIFY_URL);
};

export const loadDocumentScannerLibraries = async () => {
  await loadOpenCv();
  await loadJscanify();
};

export const createDocumentScanner = async () => {
  await loadDocumentScannerLibraries();

  const scannerWindow = window as ScannerWindow;
  if (!scannerWindow.jscanify) {
    throw new Error('書類スキャナーを初期化できませんでした。');
  }

  return new scannerWindow.jscanify();
};

const loadImage = (uri: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = uri;
  });

export const scanDocumentImage = async (uri: string): Promise<ScannedDocumentPage> => {
  const scanner = await createDocumentScanner();
  const image = await loadImage(uri);
  const width = image.naturalWidth || image.width || 1240;
  const height = image.naturalHeight || image.height || 1754;
  const canvas = scanner.extractPaper(image, width, height);

  if (!canvas) {
    return {
      uri,
      width,
      height,
    };
  }

  return {
    uri: canvas.toDataURL('image/jpeg', 0.95),
    width: canvas.width,
    height: canvas.height,
  };
};
