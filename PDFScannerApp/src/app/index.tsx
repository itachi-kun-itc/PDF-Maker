import { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import * as ImagePicker from 'expo-image-picker';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';

import {
  scanDocumentImage,
} from '@/utils/document-scanner';

type ScanPage = {
  id: string;
  uri: string;
  fileName: string;
  fileSize: number;
  createdAt: number;
  mimeType?: string;
  width?: number;
  height?: number;
};

type CameraMode = 'scan' | 'photo';

type ScannedPageInput = {
  uri: string;
  width?: number;
  height?: number;
};

const isDesktopWeb = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof navigator === 'undefined') return false;
  return !/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

const isJpegPage = (page: ScanPage) => {
  const mimeType = page.mimeType?.toLowerCase() ?? '';
  const fileName = page.fileName.toLowerCase();
  return mimeType.includes('jpeg') || mimeType.includes('jpg') || /\.(jpe?g)$/i.test(fileName);
};

const getImageFormat = (page: ScanPage) => (isJpegPage(page) ? 'JPEG' : 'PNG');

const getImageDataUrl = async (page: ScanPage) => {
  const imageBase64 = await readImageBase64(page);
  const mimeType = isJpegPage(page) ? 'image/jpeg' : 'image/png';
  return `data:${mimeType};base64,${imageBase64}`;
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('BlobをBase64に変換できませんでした。'));
        return;
      }

      resolve(reader.result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('Blobの読み込みに失敗しました。'));
    reader.readAsDataURL(blob);
  });

const readImageBase64 = async (page: ScanPage) => {
  if (page.uri.startsWith('data:')) {
    return page.uri.split(',')[1] ?? '';
  }

  if (Platform.OS === 'web') {
    const response = await fetch(page.uri);
    if (!response.ok) {
      throw new Error(`画像を読み込めませんでした: ${response.status} ${page.fileName}`);
    }

    return blobToBase64(await response.blob());
  }

  const FileSystem = await import('expo-file-system/legacy');

  return FileSystem.readAsStringAsync(page.uri, {
    encoding: 'base64',
  });
};

const createImagePdf = async (pages: ScanPage[]) => {
  console.log('[PDF] creating image PDF with jsPDF', { count: pages.length });

  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const firstPage = pages[0];
  const firstWidth = firstPage.width ?? 595;
  const firstHeight = firstPage.height ?? 842;
  const document = new jsPDF({
    orientation: firstWidth > firstHeight ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [firstWidth, firstHeight],
    compress: true,
  });

  for (const [index, page] of pages.entries()) {
    const width = page.width ?? firstWidth;
    const height = page.height ?? firstHeight;
    const imageDataUrl = await getImageDataUrl(page);

    if (index > 0) {
      document.addPage([width, height], width > height ? 'landscape' : 'portrait');
    }

    document.addImage(imageDataUrl, getImageFormat(page), 0, 0, width, height);
    console.log('[PDF] added image page', {
      index: index + 1,
      fileName: page.fileName,
      width,
      height,
    });
  }

  return document;
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [cameraModeVisible, setCameraModeVisible] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const addPage = (asset: ImagePicker.ImagePickerAsset) => {
    setPages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        fileName: asset.fileName ?? `scan_${Date.now()}.jpg`,
        fileSize: asset.fileSize ?? 0,
        createdAt: Date.now(),
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      },
    ]);
  };

  const addScannedPages = (scannedPages: ScannedPageInput[]) => {
    const createdAt = Date.now();

    setPages((prev) => [
      ...prev,
      ...scannedPages.map((page, index) => ({
        id: `${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        uri: page.uri,
        fileName: `document_scan_${createdAt}_${index + 1}.jpg`,
        fileSize: 0,
        createdAt,
        mimeType: 'image/jpeg',
        width: page.width,
        height: page.height,
      })),
    ]);
  };

  const launchDocumentScan = async () => {
    try {
      setStatusMessage('');
      setStatusMessage('書類画像を選択してください。選択後に自動で書類部分を切り出します。');

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (result.canceled) {
        setStatusMessage('書類スキャンがキャンセルされました。');
        return;
      }

      const pagesWithDimensions = await Promise.all(
        result.assets.map(async (asset) => {
          const scannedPage = await scanDocumentImage(asset.uri);

          return {
            uri: scannedPage.uri,
            width: scannedPage.width,
            height: scannedPage.height,
          };
        })
      );

      addScannedPages(pagesWithDimensions);
      setStatusMessage(`${pagesWithDimensions.length}枚の書類スキャンを追加しました。`);
    } catch (error) {
      console.error('[Scanner] failed to scan document', error);
      setStatusMessage('書類スキャンに失敗しました。写真から追加または通常の撮影を試してください。');
      Alert.alert('書類スキャンエラー', error instanceof Error ? error.message : String(error));
    }
  };

  const createAndSharePdf = async () => {
    if (pages.length === 0) {
      Alert.alert('PDF作成', '先に1枚以上の画像を追加してください。');
      return;
    }

    try {
      console.log('[PDF] start', { pageCount: pages.length, platform: Platform.OS });
      setStatusMessage(`PDF作成中... (${pages.length}枚)`);

      const pdf = await createImagePdf(pages);
      const fileName = `scan_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;

      if (Platform.OS === 'web') {
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        setStatusMessage(`PDFを作成しました: ${fileName}`);
        console.log('[PDF] downloaded', { fileName, bytes: blob.size });
        return;
      }

      const FileSystem = await import('expo-file-system/legacy');
      const Sharing = await import('expo-sharing');
      const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? '';
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: 'base64',
      });

      console.log('[PDF] written', { fileUri });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setStatusMessage(`PDFを作成しました: ${fileUri}`);
        Alert.alert('PDF作成', `PDFを作成しました。\n${fileUri}`);
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'PDFを共有',
        UTI: 'com.adobe.pdf',
      });

      setStatusMessage(`PDFを作成しました: ${fileName}`);
      console.log('[PDF] shared', { fileUri });
    } catch (error) {
      console.error('[PDF] failed to create or merge PDF', error);
      setStatusMessage('PDF作成でエラーが発生しました。consoleを確認してください。');
      Alert.alert('PDF作成エラー', error instanceof Error ? error.message : String(error));
    }
  };

  const launchCamera = async (mode: CameraMode) => {
    try {
      setStatusMessage('');

      if (isDesktopWeb()) {
        setStatusMessage('PCブラウザではカメラの起動を省略して、写真の追加に切り替えます。');
        await launchLibrary();
        return;
      }

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setStatusMessage('カメラの権限がありません。');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: mode === 'scan' ? 1 : 0.92,
        allowsEditing: mode === 'scan',
        aspect: mode === 'scan' ? [3, 4] : undefined,
      });

      if (!result.canceled) {
        addPage(result.assets[0]);
      }
    } catch {
      setStatusMessage('カメラを起動できませんでした。');
    }
  };

  const launchLibrary = async () => {
    try {
      setStatusMessage('');

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled) {
        result.assets.forEach(addPage);
      }
    } catch {
      setStatusMessage('ライブラリを開けませんでした。');
    }
  };

  const startScanFlow = () => {
    setCameraModeVisible(true);
  };

  const renderPage = ({
    item,
    drag,
    getIndex,
    isActive,
  }: RenderItemParams<ScanPage>) => {
    const index = getIndex() ?? 0;

    return (
      <View style={[styles.pageCard, isActive && styles.pageCardActive]}>
        <Pressable
          style={styles.deleteButton}
          onPress={() => setPages((prev) => prev.filter((page) => page.id !== item.id))}
        >
          <Text style={styles.deleteText}>×</Text>
        </Pressable>

        <View style={styles.pageNumber}>
          <Text style={styles.pageNumberText}>{index + 1}</Text>
        </View>

        <Pressable
          onPress={() => {
            setPreviewImage(item.uri);
            setPreviewVisible(true);
          }}
        >
          <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        </Pressable>

        <View style={styles.pageInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.fileName}
          </Text>
          <Text style={styles.meta}>
            {(item.fileSize / 1024 / 1024).toFixed(2)} MB
          </Text>
          <Text style={styles.meta}>
            {new Date(item.createdAt).toLocaleString()}
          </Text>
        </View>

        <Pressable
          style={styles.dragHandle}
          onLongPress={drag}
          delayLongPress={120}
          accessibilityRole="button"
          accessibilityLabel="順序を入れ替える"
        >
          <Text style={styles.dragText}>⋮⋮⋮</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <DraggableFlatList
        data={pages}
        keyExtractor={(item) => item.id}
        renderItem={renderPage}
        onDragEnd={({ data }) => setPages(data)}
        activationDistance={4}
        style={styles.list}
        containerStyle={styles.list}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 72,
          },
        ]}
        scrollEnabled
        nestedScrollEnabled
        alwaysBounceVertical={pages.length > 0}
        persistentScrollbar
        scrollIndicatorInsets={{ top: insets.top + 16, bottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.buttonRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.scanButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={startScanFlow}
              >
                <Text style={styles.buttonText}>スキャン開始</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.pdfButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => {
                  void createAndSharePdf();
                }}
              >
                <Text style={styles.buttonText}>PDFを作成して共有</Text>
              </Pressable>
            </View>

            {statusMessage ? (
              <Text style={styles.statusText}>{statusMessage}</Text>
            ) : null}

            <Text style={styles.sectionTitle}>スキャン済みページ ({pages.length})</Text>

            {pages.length === 0 ? (
              <Text style={styles.emptyText}>
                まだページがありません。スキャン開始から写真を追加してください。
              </Text>
            ) : null}
          </View>
        }
      />

      <Modal
        visible={cameraModeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCameraModeVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCameraModeVisible(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>撮影方法を選択</Text>

            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={async () => {
                setCameraModeVisible(false);
                await launchDocumentScan();
              }}
            >
              <Text style={styles.modalButtonText}>スキャンとして撮影</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                styles.modalButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
              onPress={async () => {
                setCameraModeVisible(false);
                await launchCamera('photo');
              }}
            >
              <Text style={styles.modalButtonText}>通常の撮影</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                styles.modalButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
              onPress={async () => {
                setCameraModeVisible(false);
                await launchLibrary();
              }}
            >
              <Text style={styles.modalButtonText}>写真から追加</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.modalCancelButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => setCameraModeVisible(false)}
            >
              <Text style={styles.modalCancelText}>キャンセル</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={previewVisible} transparent animationType="fade">
        <View style={styles.previewContainer}>
          <Pressable
            style={styles.closePreview}
            onPress={() => setPreviewVisible(false)}
          >
            <Text style={styles.closePreviewText}>×</Text>
          </Pressable>

          <Image source={{ uri: previewImage }} style={styles.previewImage} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#06152A',
  },
  list: {
    flex: 1,
  },
  container: {
    padding: 20,
    backgroundColor: '#06152A',
    flexGrow: 1,
  },
  header: {
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  button: {
    flex: 1,
    minHeight: 56,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  scanButton: {
    backgroundColor: '#123B73',
  },
  pdfButton: {
    backgroundColor: '#1B2A45',
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: '#FFF',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '700',
    lineHeight: 18,
  },
  statusText: {
    marginBottom: 12,
    color: '#8FB8FF',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#EAF1FF',
  },
  emptyText: {
    color: '#AAB8D1',
    fontSize: 14,
    marginBottom: 12,
  },
  pageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10243F',
    borderWidth: 1,
    borderColor: '#243B5F',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    position: 'relative',
  },
  pageCardActive: {
    opacity: 0.92,
    transform: [{ scale: 1.01 }],
  },
  thumbnail: {
    width: 70,
    height: 90,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#2E4A72',
  },
  pageInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    color: '#F5F9FF',
  },
  meta: {
    color: '#B8C7E0',
    fontSize: 12,
    marginTop: 2,
  },
  dragHandle: {
    width: 36,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragText: {
    fontSize: 18,
    color: '#C8D6EE',
    fontWeight: 'bold',
    letterSpacing: 0,
  },
  deleteButton: {
    position: 'absolute',
    top: -12,
    left: -12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0C1B2F',
    borderWidth: 1.5,
    borderColor: '#2D456C',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  deleteText: {
    color: '#FF7B7B',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 18,
  },
  pageNumber: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#123B73',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  pageNumberText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: 'rgba(3,10,20,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '95%',
    height: '80%',
    resizeMode: 'contain',
  },
  closePreview: {
    position: 'absolute',
    top: 60,
    right: 30,
    zIndex: 999,
  },
  closePreviewText: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,10,20,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: '#10243F',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A4368',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
    color: '#F5F9FF',
  },
  modalButton: {
    backgroundColor: '#123B73',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
  },
  modalButtonSecondary: {
    backgroundColor: '#1B2A45',
  },
  modalButtonText: {
    color: '#FFF',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  modalCancelButton: {
    paddingVertical: 14,
  },
  modalCancelText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#C8D6EE',
    fontWeight: '600',
  },
});
