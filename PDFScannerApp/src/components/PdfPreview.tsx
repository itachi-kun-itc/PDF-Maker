import { StyleSheet, Text, View } from 'react-native';

type PdfPreviewProps = {
  uri: string;
  variant: 'page' | 'history';
};

export function PdfPreview({ variant }: PdfPreviewProps) {
  return (
    <View style={[styles.frame, variant === 'page' ? styles.pageFrame : styles.historyFrame]}>
      <Text style={styles.text}>PDF</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
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
  text: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
