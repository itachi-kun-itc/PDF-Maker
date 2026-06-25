export type ScannedDocumentPage = {
  uri: string;
  width?: number;
  height?: number;
};

export const scanDocumentImage = async (uri: string): Promise<ScannedDocumentPage> => ({
  uri,
});
