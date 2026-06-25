import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Pdf from 'react-native-pdf';

type PdfPreviewProps = {
  uri: string;
  variant: 'page' | 'history';
};

export function PdfPreview({ uri, variant }: PdfPreviewProps) {
  const [hasError, setHasError] = useState(false);
  const frameStyle = variant === 'page' ? styles.pageFrame : styles.historyFrame;

  if (hasError) {
    return (
      <View style={[styles.fallbackFrame, frameStyle]}>
        <Text style={styles.fallbackText}>PDF</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, frameStyle]}>
      <Pdf
        source={{ uri }}
        page={1}
        singlePage
        spacing={0}
        fitPolicy={2}
        scrollEnabled={false}
        enableDoubleTapZoom={false}
        trustAllCerts={false}
        renderActivityIndicator={() => <View />}
        onError={(error) => {
          console.warn('[PDF] failed to render preview', error);
          setHasError(true);
        }}
        style={styles.document}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F4F6FA',
    borderWidth: 1,
    borderColor: '#526A91',
  },
  fallbackFrame: {
    borderRadius: 8,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8F1D2C',
    borderWidth: 1,
    borderColor: '#C55262',
  },
  pageFrame: {
    width: 70,
    height: 90,
  },
  historyFrame: {
    width: 58,
    height: 74,
  },
  document: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F4F6FA',
  },
  fallbackText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
