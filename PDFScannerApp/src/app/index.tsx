// import { PDFDocument } from 'pdf-lib';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Modal,
} from 'react-native';

import * as ImagePicker from 'expo-image-picker';

export default function HomeScreen() {
  const [pages, setPages] = useState<any[]>([]);
  const [previewVisible, setPreviewVisible] =
    useState(false);
  const [previewImage, setPreviewImage] =
    useState('');

  const scanDocument = async () => {
    const result =
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 1,
      });

    if (!result.canceled) {
      const newPages = result.assets.map(
        (asset) => ({
          uri: asset.uri,
          fileName:
            asset.fileName || '画像',
          fileSize:
            asset.fileSize || 0,
          creationTime:
            asset.creationTime ||
            Date.now(),
        })
      );

      setPages((prev) => [
        ...prev,
        ...newPages,
      ]);
    }
  };

  const createPdf = async () => {
  try {
    const pdfDoc =
      await PDFDocument.create();

    Alert.alert(
      '成功',
      'PDF作成成功'
    );
  } catch (e) {
    console.log(e);
  }
};

  const movePageUp = (index: number) => {
    if (index === 0) return;

    const newPages = [...pages];

    [newPages[index - 1], newPages[index]] = [
      newPages[index],
      newPages[index - 1],
    ];

    setPages(newPages);
  };

  const movePageDown = (index: number) => {
    if (index === pages.length - 1)
      return;

    const newPages = [...pages];

    [newPages[index + 1], newPages[index]] = [
      newPages[index],
      newPages[index + 1],
    ];

    setPages(newPages);
  };

  const openPageMenu = (
    index: number
  ) => {
    Alert.alert(
      'ページ操作',
      '実行する操作を選択してください',
      [
        {
          text: '↑ 上へ移動',
          onPress: () =>
            movePageUp(index),
        },
        {
          text: '↓ 下へ移動',
          onPress: () =>
            movePageDown(index),
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: () =>
            setPages(
              pages.filter(
                (_, i) => i !== index
              )
            ),
        },
        {
          text: 'キャンセル',
          style: 'cancel',
        },
      ]
    );
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={
          styles.container
        }
      >
        <Text style={styles.title}>
          PDFスキャナー
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={scanDocument}
        >
          <Text style={styles.buttonText}>
            📷 スキャン開始
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={createPdf}
        >
          <Text style={styles.buttonText}>
            📄 PDF生成
          </Text>
        </TouchableOpacity>

        <Text
          style={styles.sectionTitle}
        >
          撮影済みページ (
          {pages.length})
        </Text>

        {pages.map(
          (page, index) => (
            <View
              key={index}
              style={styles.pageCard}
            >
              <TouchableOpacity
                style={
                  styles.deleteButton
                }
                onPress={() =>
                  setPages(
                    pages.filter(
                      (_, i) =>
                        i !== index
                    )
                  )
                }
              >
                <Text
                  style={
                    styles.deleteText
                  }
                >
                  ✕
                </Text>
              </TouchableOpacity>

              <View
                style={
                  styles.pageNumber
                }
              >
                <Text
                  style={
                    styles.pageNumberText
                  }
                >
                  {index + 1}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setPreviewImage(
                    page.uri
                  );
                  setPreviewVisible(
                    true
                  );
                }}
              >
                <Image
                  source={{
                    uri: page.uri,
                  }}
                  style={
                    styles.thumbnail
                  }
                />
              </TouchableOpacity>

              <View
                style={styles.pageInfo}
              >
                <Text
                  style={
                    styles.fileName
                  }
                  numberOfLines={1}
                >
                  {page.fileName}
                </Text>

                <Text
                  style={styles.meta}
                >
                  {(
                    page.fileSize /
                    1024 /
                    1024
                  ).toFixed(2)} MB
                </Text>

                <Text
                  style={styles.meta}
                >
                  {new Date(
                    page.creationTime
                  ).toLocaleString()}
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.dragHandle
                }
                onPress={() =>
                  openPageMenu(index)
                }
              >
                <Text
                  style={
                    styles.dragText
                  }
                >
                  ≡
                </Text>
              </TouchableOpacity>
            </View>
          )
        )}
      </ScrollView>

      <Modal
        visible={previewVisible}
        transparent={true}
      >
        <View
          style={
            styles.previewContainer
          }
        >
          <TouchableOpacity
            style={
              styles.closePreview
            }
            onPress={() =>
              setPreviewVisible(false)
            }
          >
            <Text
              style={
                styles.closePreviewText
              }
            >
              ✕
            </Text>
          </TouchableOpacity>

          <Image
            source={{
              uri: previewImage,
            }}
            style={
              styles.previewImage
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#F5F5F5',
  },

  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },

  button: {
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 12,
    marginBottom: 20,
  },

  buttonText: {
    color: '#FFF',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },

  pageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DADADA',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    position: 'relative',
  },

  thumbnail: {
    width: 70,
    height: 90,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },

  pageInfo: {
    flex: 1,
  },

  fileName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },

  meta: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },

  dragHandle: {
    width: 50,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },

  dragText: {
    fontSize: 30,
    color: '#666',
    fontWeight: 'bold',
  },

  deleteButton: {
    position: 'absolute',
    top: -12,
    left: -12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },

  deleteText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: 'bold',
  },

  pageNumber: {
    position: 'absolute',
    top: -12,
    right: -12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#007AFF',
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
    backgroundColor: 'rgba(0,0,0,0.9)',
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
});