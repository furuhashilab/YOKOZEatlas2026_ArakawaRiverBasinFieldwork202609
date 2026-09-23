# データ説明

## 概要

2026年9月21日・22日の荒川流域圏構想フィールドワークで記録した20地点を収録しています。そのうち10地点にはCode for Groundの測定結果を名称、測定時刻、座標によって統合しています。

- 空間参照系: WGS 84 / OGC CRS84
- 幾何形状: Point
- 地点数: 20
- 横瀬町内: 5
- 秩父市内: 15
- 現地水質測定あり: 13
- Code for Ground測定統合あり: 10

## 主な属性

| 属性 | 内容 |
| --- | --- |
| `feature_id` | 統合後の一意ID |
| `name` | 地図表示用の地点名 |
| `feature_class` | `water_quality_sample`、`water_feature`、`other_observation` |
| `feature_type` | 雨水、湧水、井戸、水路、地質などの細分類 |
| `observed_at` | 現地調査の記録日時 |
| `longitude`, `latitude` | 地図表示用座標 |
| `in_yokoze_town` | 横瀬町内かどうか |
| `water_temp_field_c` | 現地調査側の水温（℃） |
| `conductivity_field_us_cm` | 現地調査側の電気伝導度（μS/cm） |
| `ph_field`, `rph_field` | 現地調査側のpHとRpH |
| `nitrate_mg_l` | Code for Ground側のNO3濃度（mg/L） |
| `conductivity_cfg_us_cm` | Code for Ground側の電気伝導度（μS/cm） |
| `ph_cfg`, `ph_cfg_retest` | Code for Ground側のpHと再測定値 |
| `orp_mv` | Code for Ground側のORP（mV） |
| `qc_flags` | 範囲・欠測・地点統合の確認情報 |

すべての属性定義はXLSXの `Guide_QC` シートに収録しています。

## クレンジング

- 名称のアンダースコアと全角空白を統一
- 日時、数値、IDの型を統一
- 現地調査側のECを `mS/m` から `μS/cm` へ変換し、原値も保持
- `RpH - pH` を再計算
- メモに記載されたCode for GroundのpH再測定値を数値化
- 測定機器の値は上書きせず、`field` と `cfg` の別属性に保持

## 品質確認上の注意

- Code for Groundとの統合距離が50mを超える地点が2件あります。名称と測定時刻を併用して統合しています。
- 2種類の測定機器の標高値に40m前後の系統差があるため、両方の原値を保持しています。
- 横瀬町外の観察は流域調査の一部として削除せず、`in_yokoze_town` で識別できます。
- 地点の詳細な判断根拠はXLSXの `Guide_QC` シートを参照してください。

## ライセンス

**データライセンス確認中**

リポジトリの [`LICENSE`](../LICENSE) はウェブマップのコードに適用され、調査データのライセンスには適用されません。
