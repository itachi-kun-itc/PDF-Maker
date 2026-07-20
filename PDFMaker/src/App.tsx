import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { WebDocumentScanner } from './components/WebDocumentScanner';

type SourceType = 'image' | 'pdf';

type SourcePage = {
  id: string;
  sourceType: SourceType;
  fileName: string;
  fileSize: number;
  dataUri: string;
  previewUri?: string;
  width?: number;
  height?: number;
  pageCount: number;
};

type HistoryItem = {
  id: string;
  fileName: string;
  dataUri: string;
  previewUri?: string;
  createdAt: number;
  pageCount: number;
  fileSize: number;
};

type StoredHistoryItem = Omit<HistoryItem, 'dataUri'> & {
  dataUri?: string;
  uri?: string;
};

type PdfJsViewport = { width: number; height: number };
type PdfJsPage = {
  getViewport: (options: { scale: number }) => PdfJsViewport;
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsViewport;
  }) => { promise: Promise<void> };
};
type PdfJsDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
};
type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfJsDocument> };
};

const HISTORY_DB_NAME = 'pdfscanner.history.db';
const HISTORY_STORE_NAME = 'pdfHistory';
const HISTORY_RECORD_KEY = 'items';
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PDFJS_VERSION = '3.11.174';
const PDFJS_SCRIPT_ID = 'pdfjs-preview-renderer';
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 36;

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);

const defaultPdfName = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `PDF_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.pdf`;
};

const safePdfName = (name: string) => {
  const normalized = name.trim().replace(/[\\/:*?"<>|]/g, '_') || defaultPdfName();
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
};

const fileToDataUri = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('ファイルを読み込めませんでした。'));
    reader.onerror = () => reject(reader.error ?? new Error('ファイルを読み込めませんでした。'));
    reader.readAsDataURL(file);
  });

const dataUriToBytes = (dataUri: string) => {
  const base64 = dataUri.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const dataUriToBlob = (dataUri: string) => {
  const [header, body = ''] = dataUri.split(',');
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  return new Blob([dataUriToBytes(`data:${mimeType};base64,${body}`)], { type: mimeType });
};

const estimateDataUriBytes = (dataUri: string) => Math.ceil(((dataUri.split(',')[1]?.length ?? 0) * 3) / 4);

const loadImageSize = (uri: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    image.src = uri;
  });

const loadPdfJs = () =>
  new Promise<PdfJsLib>((resolve, reject) => {
    const pdfWindow = window as typeof window & { pdfjsLib?: PdfJsLib };
    if (pdfWindow.pdfjsLib) {
      resolve(pdfWindow.pdfjsLib);
      return;
    }

    const existing = document.getElementById(PDFJS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () =>
        pdfWindow.pdfjsLib ? resolve(pdfWindow.pdfjsLib) : reject(new Error('PDFプレビューを初期化できません。')),
      );
      existing.addEventListener('error', () => reject(new Error('PDF.jsを読み込めません。')));
      return;
    }

    const script = document.createElement('script');
    script.id = PDFJS_SCRIPT_ID;
    script.src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
    script.async = true;
    script.onload = () =>
      pdfWindow.pdfjsLib ? resolve(pdfWindow.pdfjsLib) : reject(new Error('PDFプレビューを初期化できません。'));
    script.onerror = () => reject(new Error('PDF.jsを読み込めません。'));
    document.head.appendChild(script);
  });

const inspectPdf = async (dataUri: string) => {
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;
  const pdf = await pdfjs.getDocument({ data: dataUriToBytes(dataUri) }).promise;
  const firstPage = await pdf.getPage(1);
  const baseViewport = firstPage.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.max(0.5, 360 / baseViewport.width));
  const viewport = firstPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) return { pageCount: pdf.numPages, previewUri: undefined };
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await firstPage.render({ canvasContext: context, viewport }).promise;
  return { pageCount: pdf.numPages, previewUri: canvas.toDataURL('image/jpeg', 0.86) };
};

const openHistoryDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        request.result.createObjectStore(HISTORY_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('履歴を開けませんでした。'));
  });

const readHistory = async () => {
  const database = await openHistoryDb();
  try {
    return await new Promise<HistoryItem[]>((resolve, reject) => {
      const request = database
        .transaction(HISTORY_STORE_NAME, 'readonly')
        .objectStore(HISTORY_STORE_NAME)
        .get(HISTORY_RECORD_KEY);
      request.onsuccess = () => {
        const stored = (Array.isArray(request.result) ? request.result : []) as StoredHistoryItem[];
        resolve(
          stored.flatMap((item) => {
            const dataUri = item.dataUri ?? item.uri;
            return dataUri ? [{ ...item, dataUri }] : [];
          }),
        );
      };
      request.onerror = () => reject(request.error ?? new Error('履歴を読み込めませんでした。'));
    });
  } finally {
    database.close();
  }
};

const writeHistory = async (items: HistoryItem[]) => {
  const database = await openHistoryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(HISTORY_STORE_NAME, 'readwrite');
      transaction.objectStore(HISTORY_STORE_NAME).put(items, HISTORY_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('履歴を保存できませんでした。'));
    });
  } finally {
    database.close();
  }
};

const createMergedPdf = async (pages: SourcePage[], onProgress: (value: number) => void) => {
  const { PDFDocument } = await import('pdf-lib');
  const output = await PDFDocument.create();
  let previewUri: string | undefined;

  for (const [index, page] of pages.entries()) {
    onProgress(Math.round((index / pages.length) * 90));
    if (page.sourceType === 'pdf') {
      const source = await PDFDocument.load(dataUriToBytes(page.dataUri), { ignoreEncryption: true });
      const copied = await output.copyPages(source, source.getPageIndices());
      copied.forEach((copiedPage) => output.addPage(copiedPage));
    } else {
      const bytes = dataUriToBytes(page.dataUri);
      const image = /image\/jpe?g/i.test(page.dataUri)
        ? await output.embedJpg(bytes)
        : await output.embedPng(bytes);
      const imageWidth = page.width ?? image.width;
      const imageHeight = page.height ?? image.height;
      const landscape = imageWidth > imageHeight;
      const pageWidth = landscape ? A4_HEIGHT : A4_WIDTH;
      const pageHeight = landscape ? A4_WIDTH : A4_HEIGHT;
      const scale = Math.min(
        (pageWidth - PAGE_MARGIN * 2) / imageWidth,
        (pageHeight - PAGE_MARGIN * 2) / imageHeight,
      );
      const width = imageWidth * scale;
      const height = imageHeight * scale;
      const pdfPage = output.addPage([pageWidth, pageHeight]);
      pdfPage.drawImage(image, {
        x: (pageWidth - width) / 2,
        y: (pageHeight - height) / 2,
        width,
        height,
      });
    }
    previewUri ??= page.previewUri;
  }

  onProgress(94);
  const dataUri = await output.saveAsBase64({ dataUri: true });
  onProgress(100);
  return { dataUri, previewUri, pageCount: output.getPageCount() };
};

const downloadPdf = (item: Pick<HistoryItem, 'dataUri' | 'fileName'>) => {
  const url = URL.createObjectURL(dataUriToBlob(item.dataUri));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = item.fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [pages, setPages] = useState<SourcePage[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; type: SourceType } | null>(null);
  const [pendingPdf, setPendingPdf] = useState<Omit<HistoryItem, 'fileName'> | null>(null);
  const [fileName, setFileName] = useState(defaultPdfName());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const cutoff = Date.now() - HISTORY_RETENTION_MS;
        const stored = await readHistory();
        const current = stored.filter((item) => item.createdAt >= cutoff);
        setHistory(current);
        if (current.length !== stored.length) await writeHistory(current);
      } catch (error) {
        console.warn(error);
        setStatus('作成履歴を読み込めませんでした。');
      }
    })();
  }, []);

  useEffect(() => {
    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    const preventKeyboardZoom = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        ['+', '-', '=', '0'].includes(event.key)
      ) {
        event.preventDefault();
      }
    };
    const preventGestureZoom = (event: Event) => event.preventDefault();

    window.addEventListener('wheel', preventWheelZoom, { passive: false });
    window.addEventListener('keydown', preventKeyboardZoom);
    document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
    document.addEventListener('gesturechange', preventGestureZoom, { passive: false });

    return () => {
      window.removeEventListener('wheel', preventWheelZoom);
      window.removeEventListener('keydown', preventKeyboardZoom);
      document.removeEventListener('gesturestart', preventGestureZoom);
      document.removeEventListener('gesturechange', preventGestureZoom);
    };
  }, []);

  const addFiles = async (files: File[]) => {
    const supported = files.filter((file) =>
      /\.(jpe?g|png|pdf)$/i.test(file.name) || /^(image\/(jpe?g|png)|application\/pdf)$/i.test(file.type),
    );
    if (!supported.length) {
      setStatus('JPEG・PNG・PDFファイルを選択してください。');
      return;
    }

    setIsBusy(true);
    setStatus('ファイルを読み込んでいます…');
    try {
      const additions: SourcePage[] = [];
      for (const file of supported) {
        const dataUri = await fileToDataUri(file);
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          const inspection = await inspectPdf(dataUri);
          additions.push({
            id: makeId(),
            sourceType: 'pdf',
            fileName: file.name,
            fileSize: file.size,
            dataUri,
            previewUri: inspection.previewUri,
            pageCount: inspection.pageCount,
          });
        } else {
          const size = await loadImageSize(dataUri);
          additions.push({
            id: makeId(),
            sourceType: 'image',
            fileName: file.name,
            fileSize: file.size,
            dataUri,
            previewUri: dataUri,
            pageCount: 1,
            ...size,
          });
        }
      }
      setPages((current) => [...current, ...additions]);
      setStatus(`${additions.length}件のファイルを追加しました。`);
    } catch (error) {
      console.error(error);
      setStatus('ファイルを追加できませんでした。PDFの破損やパスワードを確認してください。');
    } finally {
      setIsBusy(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    void addFiles(selected);
  };

  const addScannedPage = async (page: { uri: string; width?: number; height?: number }) => {
    const item: SourcePage = {
      id: makeId(),
      sourceType: 'image',
      fileName: `scan_${Date.now()}.jpg`,
      fileSize: estimateDataUriBytes(page.uri),
      dataUri: page.uri,
      previewUri: page.uri,
      width: page.width,
      height: page.height,
      pageCount: 1,
    };
    setPages((current) => [...current, item]);
    setScannerOpen(false);
    setStatus('スキャン画像を追加しました。');
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    setPages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const dropPage = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    setPages((current) => {
      const next = [...current];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedIndex(null);
  };

  const buildPdf = async () => {
    if (!pages.length) {
      setStatus('画像またはPDFを追加してください。');
      return;
    }
    setIsBusy(true);
    setProgress(1);
    setStatus('PDFを作成しています…');
    try {
      const result = await createMergedPdf(pages, setProgress);
      setPendingPdf({
        id: makeId(),
        dataUri: result.dataUri,
        previewUri: result.previewUri,
        createdAt: Date.now(),
        pageCount: result.pageCount,
        fileSize: estimateDataUriBytes(result.dataUri),
      });
      setFileName(defaultPdfName());
      setStatus('PDFを作成しました。ファイル名を確認してください。');
    } catch (error) {
      console.error(error);
      setStatus('PDFを作成できませんでした。ファイル形式や容量を確認してください。');
    } finally {
      setIsBusy(false);
      setProgress(0);
    }
  };

  const savePendingPdf = async () => {
    if (!pendingPdf) return;
    const item: HistoryItem = { ...pendingPdf, fileName: safePdfName(fileName) };
    const next = [item, ...history];
    try {
      await writeHistory(next);
      setHistory(next);
      downloadPdf(item);
      setPendingPdf(null);
      setStatus(`${item.fileName}を保存しました。`);
      setActiveTab('history');
    } catch (error) {
      console.error(error);
      setStatus('履歴を保存できませんでした。ブラウザの空き容量を確認してください。');
    }
  };

  const sharePdf = async (item: HistoryItem) => {
    const file = new File([dataUriToBlob(item.dataUri)], item.fileName, { type: 'application/pdf' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ files: [file], title: item.fileName });
      return;
    }
    downloadPdf(item);
  };

  const deleteHistoryItem = async (id: string) => {
    const next = history.filter((item) => item.id !== id);
    await writeHistory(next);
    setHistory(next);
  };

  const totalPages = pages.reduce((sum, page) => sum + page.pageCount, 0);

  return (
    <div className="app-shell">
      <main>
        <nav className="tabs" aria-label="画面切り替え">
          <button className={activeTab === 'create' ? 'active' : ''} onClick={() => setActiveTab('create')}>
            PDFを作る <span>{pages.length}</span>
          </button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
            作成済み <span>{history.length}</span>
          </button>
        </nav>

        {activeTab === 'create' ? (
          <section className="workspace">
            <div className="action-grid">
              <button className="action-card scanner" onClick={() => setScannerOpen(true)} disabled={isBusy}>
                <strong>書類をスキャン</strong>
                <span>カメラで傾きを補正して取り込み</span>
              </button>
              <button className="action-card camera" onClick={() => cameraInputRef.current?.click()} disabled={isBusy}>
                <strong>カメラで撮影</strong>
                <span>スマートフォンのカメラを起動</span>
              </button>
              <button className="action-card files" onClick={() => fileInputRef.current?.click()} disabled={isBusy}>
                <strong>ファイルを選択</strong>
                <span>JPEG・PNG・PDF、複数選択可</span>
              </button>
            </div>

            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" multiple hidden onChange={onFileChange} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={onFileChange} />

            {status ? <div className="status" role="status">{status}</div> : null}
            {isBusy && progress > 0 ? (
              <div className="progress" aria-label={`PDF作成 ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
              </div>
            ) : null}

            <div className="section-heading">
              <div>
                <p className="eyebrow">DOCUMENT QUEUE</p>
                <h3>追加済みファイル</h3>
              </div>
              <span>{pages.length}ファイル・{totalPages}ページ</span>
            </div>

            {pages.length === 0 ? (
              <button className="drop-zone" onClick={() => fileInputRef.current?.click()}>
                <span className="drop-icon">＋</span>
                <strong>画像やPDFを追加</strong>
                <small>ここからファイルを選択してください</small>
              </button>
            ) : (
              <div className="page-list">
                {pages.map((page, index) => (
                  <article
                    className="page-card"
                    key={page.id}
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropPage(event, index)}
                  >
                    <button
                      className={`thumbnail ${page.sourceType}`}
                      onClick={() => setPreview({ uri: page.dataUri, type: page.sourceType })}
                      aria-label={`${page.fileName}をプレビュー`}
                    >
                      {page.previewUri ? <img src={page.previewUri} alt="" /> : <span>PDF</span>}
                    </button>
                    <div className="page-details">
                      <span className="sequence">{String(index + 1).padStart(2, '0')}</span>
                      <h4>{page.fileName}</h4>
                      <p>{page.pageCount}ページ · {formatBytes(page.fileSize)}</p>
                    </div>
                    <div className="card-actions">
                      <button onClick={() => movePage(index, -1)} disabled={index === 0} aria-label="上へ移動">↑</button>
                      <button onClick={() => movePage(index, 1)} disabled={index === pages.length - 1} aria-label="下へ移動">↓</button>
                      <button className="remove" onClick={() => setPages((current) => current.filter((item) => item.id !== page.id))} aria-label="削除">×</button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="create-bar">
              <div>
                <strong>{totalPages}ページ</strong>
                <span>を1つのPDFに結合</span>
              </div>
              <button className="primary-button" onClick={() => void buildPdf()} disabled={isBusy || !pages.length}>
                {isBusy ? '処理中…' : 'PDFを作成'}
              </button>
            </div>
          </section>
        ) : (
          <section className="workspace">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LOCAL HISTORY</p>
                <h3>作成済みPDF</h3>
              </div>
              <span>30日後に自動削除</span>
            </div>
            {history.length === 0 ? (
              <div className="empty-history">まだ作成済みPDFはありません。</div>
            ) : (
              <div className="history-grid">
                {history.map((item) => (
                  <article className="history-card" key={item.id}>
                    <button className="history-preview" onClick={() => setPreview({ uri: item.dataUri, type: 'pdf' })}>
                      {item.previewUri ? <img src={item.previewUri} alt="" /> : <span>PDF</span>}
                    </button>
                    <div>
                      <h4>{item.fileName}</h4>
                      <p>{item.pageCount}ページ · {formatBytes(item.fileSize)}</p>
                      <time>{formatDate(item.createdAt)}</time>
                    </div>
                    <div className="history-actions">
                      <button onClick={() => downloadPdf(item)}>保存</button>
                      <button onClick={() => void sharePdf(item)}>共有</button>
                      <button className="danger" onClick={() => void deleteHistoryItem(item.id)}>削除</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer>
        <span>PDF Maker · Web only</span>
        <span>ファイル処理はブラウザ内で実行されます</span>
      </footer>

      <div className="landscape-blocker" role="alert" aria-live="assertive">
        <div className="rotate-device-icon" aria-hidden="true">↻</div>
        <strong>横画面には対応していません</strong>
        <span>端末を縦向きにしてご利用ください</span>
      </div>

      {pendingPdf ? (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="filename-title">
            <p className="eyebrow">READY TO SAVE</p>
            <h3 id="filename-title">PDFのファイル名</h3>
            <input value={fileName} onChange={(event) => setFileName(event.target.value)} autoFocus />
            <div className="dialog-actions">
              <button onClick={() => setPendingPdf(null)}>キャンセル</button>
              <button className="primary-button" onClick={() => void savePendingPdf()}>保存してダウンロード</button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="preview-modal" role="dialog" aria-modal="true">
          <button className="preview-close" onClick={() => setPreview(null)} aria-label="プレビューを閉じる">×</button>
          {preview.type === 'pdf' ? <iframe src={preview.uri} title="PDFプレビュー" /> : <img src={preview.uri} alt="プレビュー" />}
        </div>
      ) : null}

      <WebDocumentScanner
        visible={scannerOpen}
        onCancel={() => setScannerOpen(false)}
        onCapture={(page) => void addScannedPage(page)}
        onError={(message) => setStatus(`スキャンに失敗しました: ${message}`)}
      />
    </div>
  );
}
