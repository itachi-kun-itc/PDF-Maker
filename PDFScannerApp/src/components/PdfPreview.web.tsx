import { createElement, type CSSProperties } from 'react';

type PdfPreviewProps = {
  uri: string;
  variant: 'page' | 'history';
};

const getPreviewUri = (uri: string) => {
  const separator = uri.includes('#') ? '&' : '#';
  return `${uri}${separator}page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit`;
};

export function PdfPreview({ uri, variant }: PdfPreviewProps) {
  const isPagePreview = variant === 'page';
  const style: CSSProperties = {
    width: isPagePreview ? 70 : 58,
    height: isPagePreview ? 90 : 74,
    borderRadius: 8,
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: '#F4F6FA',
    border: '1px solid #526A91',
    pointerEvents: 'none',
  };

  return createElement('iframe', {
    src: getPreviewUri(uri),
    title: 'PDF preview',
    style,
  });
}
