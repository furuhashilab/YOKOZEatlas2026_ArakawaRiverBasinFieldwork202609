# YOKOZEatlas2026 Arakawa River Basin Fieldwork 202609

2026年9月21日・22日に実施した「荒川流域圏構想フィールドワーク」の水質測定と水環境観察を可視化するウェブマップです。

## ウェブマップ

<https://mapconcierge.github.io/YOKOZEatlas2026_ArakawaRiverBasinFieldwork202609/>

## 主な機能

- MapLibre GL JSによるGlobe表示
- OpenFreeMapと地理院地図の切り替え
- 名称、住所、備考の検索
- 横瀬町・秩父市、地点分類、水質測定の有無による絞り込み
- 地点一覧を鳥瞰視点のカメラワークで巡回し、ポップアップ表示するストーリーモード
- 現地調査とCode for Groundの測定値を地点ごとに表示
- GeoJSON、CSVのダウンロード

## データ

`data/` に次のファイルを格納しています。

- `YOKOZEatlas2026_morigawa_water_quality_v0.1.0.geojson`: ウェブマップ用ポイントデータ
- `YOKOZEatlas2026_morigawa_water_quality_v0.1.0.csv`: 全属性のCSV
- `YOKOZEatlas2026_morigawa_water_quality_v0.1.0.xlsx`: 統合・品質確認用ワークブック

データの構造と注意点は [`data/README.md`](./data/README.md) を参照してください。

## ローカルでの確認

GeoJSONを `fetch` で読み込むため、ファイルを直接開かずHTTPサーバー経由で確認します。

```bash
python3 -m http.server 8000
```

起動後、<http://localhost:8000> を開いてください。

## GitHub Pages

GitHubの `Settings` → `Pages` で次のように設定します。

1. `Build and deployment` のSourceを `Deploy from a branch` にする
2. Branchを `main`、フォルダを `/ (root)` にする
3. `Save` する

## YOKOZE Atlasの方針

- [YOKOZE Atlas 2026](https://github.com/furuhashilab/YOKOZEatlas2026)
- [MORIGAWA流域マップ](https://github.com/furuhashilab/YOKOZEatlas2026/issues/3)
- [YOKOZE Atlas データ整備ルール v0.5.1](https://github.com/furuhashilab/YOKOZEatlas2026/issues/16)
- [ウェブマップ構築プロンプト例・命名例](https://github.com/furuhashilab/YOKOZEatlas2026/issues/19)

## 出典とライセンス

- ウェブマップのコード: [CC0 1.0 Universal](./LICENSE)
- 調査データ: **データライセンス確認中**
- 背景地図: [OpenFreeMap](https://openfreemap.org/) / [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- 切り替え背景地図: [地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)
