# PDF Maker

写真・画像・既存のPDFをブラウザ内で取り込み、ページを並べ替えて、1つのPDFとして保存・共有できるWebアプリです。

## Webアプリ

https://itachi-kun-itc.github.io/PDF-Maker/

## 主な機能

- ブラウザのカメラで書類をスキャン
- スマートフォンのカメラで撮影
- JPEG・PNG・PDFを複数追加
- ドラッグ＆ドロップまたはボタンで順番を変更
- 画像と既存PDFを1つのPDFへ結合
- 作成したPDFのプレビュー、ダウンロード、共有
- 作成履歴をブラウザ内に30日間保存
- スマートフォン・タブレット・PCのブラウザに対応

ファイルの読み込みとPDF生成はブラウザ内で行われます。

## 技術構成

- React
- TypeScript
- Vite
- pdf-lib
- IndexedDB
- GitHub Pages

## セットアップ

Node.js 22以降とnpmを用意します。

```bash
git clone https://github.com/itachi-kun-itc/PDF-Maker.git
cd PDF-Maker
npm --prefix PDFMaker ci
npm run web
```

## 品質チェック

```bash
npm run lint
npm run build
```

## デプロイ

`main`ブランチへpushすると、GitHub ActionsがViteの静的サイトをビルドし、GitHub Pagesへ直接デプロイします。

GitHub Pages用の公開ベースパスは`/PDF-Maker/`です。

## ディレクトリ構成

```text
.
├─ .github/workflows/deploy-pages.yml
├─ PDFMaker/
│  ├─ public/
│  ├─ src/
│  │  ├─ components/WebDocumentScanner.tsx
│  │  ├─ utils/document-scanner.web.ts
│  │  ├─ App.tsx
│  │  ├─ main.tsx
│  │  └─ styles.css
│  ├─ index.html
│  ├─ package.json
│  └─ vite.config.ts
└─ README.md
```

## 注意事項

- 作成履歴はブラウザのIndexedDBへ保存され、30日後に自動削除されます。
- ブラウザのサイトデータを削除すると履歴も削除されます。
- 暗号化またはパスワード保護されたPDFは処理できない場合があります。
- Web書類スキャンとPDFプレビューでは外部CDNからライブラリを読み込みます。
- 重要なPDFは作成後にダウンロードしてください。

## Wiki

https://github.com/itachi-kun-itc/PDF-Maker/wiki

## ライセンス

[MIT License](PDFMaker/LICENSE)
