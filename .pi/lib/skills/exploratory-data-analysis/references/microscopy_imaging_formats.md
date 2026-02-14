---
template-type: reference
skill: exploratory-data-analysis
category: microscopy-imaging
description: 45以上の顕微鏡・イメージングファイル形式のリファレンス。顕微鏡画像、医療画像、全スライドイメージングを含む。
---

# 顕微鏡・イメージングファイル形式リファレンス

本リファレンスでは、顕微鏡、医療イメージング、リモートセンシング、科学画像解析で使用されるファイル形式について解説します。

## 顕微鏡専用形式

### .tif / .tiff - Tagged Image File Format
**説明:** 複数ページとメタデータをサポートする柔軟な画像形式
**典型的データ:** 顕微鏡画像、Zスタック、時系列、マルチチャンネル
**用途:** 蛍光顕微鏡、共焦点イメージング、バイオロジカルイメージング
**Pythonライブラリ:**
- `tifffile`: `tifffile.imread('file.tif')` - 顕微鏡TIFFサポート
- `PIL/Pillow`: `Image.open('file.tif')` - 基本的なTIFF
- `scikit-image`: `io.imread('file.tif')`
- `AICSImageIO`: マルチ形式顕微鏡リーダー
**EDAアプローチ:**
- 画像サイズとビット深度
- マルチページ/Zスタック解析
- メタデータ抽出（OME-TIFF）
- チャンネル解析と輝度分布
- 時間的ダイナミクス（タイムラプス）
- ピクセルサイズと空間キャリブレーション
- チャンネル別ヒストグラム解析
- ダイナミックレンジの利用率

### .nd2 - Nikon NIS-Elements
**説明:** Nikon顕微鏡の独自形式
**典型的データ:** 多次元顕微鏡データ（XYZCT）
**用途:** Nikon顕微鏡データ、共焦点、ワイドフィールド
**Pythonライブラリ:**
- `nd2reader`: `ND2Reader('file.nd2')`
- `pims`: `pims.ND2_Reader('file.nd2')`
- `AICSImageIO`: 汎用リーダー
**EDAアプローチ:**
- 実験メタデータ抽出
- チャンネル構成
- タイムラプスフレーム解析
- Zスタック深度と間隔
- XYステージ位置
- レーザー設定と出力
- ピクセルビニング情報
- 取得タイムスタンプ

### .lif - Leica Image Format
**説明:** Leica顕微鏡の独自形式
**典型的データ:** 複数実験、多次元画像
**用途:** Leica共焦点およびワイドフィールドデータ
**Pythonライブラリ:**
- `readlif`: `readlif.LifFile('file.lif')`
- `AICSImageIO`: LIFサポート
- `python-bioformats`: Bio-Formats経由
**EDAアプローチ:**
- 複数実験の検出
- 画像シリーズの列挙
- 実験ごとのメタデータ
- チャンネルとタイムポイント構造
- 物理寸法の抽出
- 対物レンズと検出器情報
- スキャン設定の解析

### .czi - Carl Zeiss Image
**説明:** Zeiss顕微鏡形式
**典型的データ:** 豊富なメタデータを含む多次元顕微鏡データ
**用途:** Zeiss共焦点、ライトシート、ワイドフィールド
**Pythonライブラリ:**
- `czifile`: `czifile.CziFile('file.czi')`
- `AICSImageIO`: CZIサポート
- `pylibCZIrw`: Zeiss公式ライブラリ
**EDAアプローチ:**
- シーンと位置の解析
- モザイクタイル構造
- チャンネル波長情報
- 取得モードの検出
- スケーリングとキャリブレーション
- 機器構成
- ROI定義

### .oib / .oif - Olympus Image Format
**説明:** Olympus顕微鏡形式
**典型的データ:** 共焦点および多光子イメージング
**用途:** Olympus FluoViewデータ
**Pythonライブラリ:**
- `AICSImageIO`: OIB/OIFサポート
- `python-bioformats`: Bio-Formats経由
**EDAアプローチ:**
- ディレクトリ構造の検証（OIF）
- メタデータファイルのパース
- チャンネル構成
- スキャンパラメータ
- 対物レンズとフィルター情報
- PMT設定

### .vsi - Olympus VSI
**説明:** Olympusスライドスキャナー形式
**典型的データ:** 全スライドイメージング、大規模モザイク
**用途:** バーチャル顕微鏡、病理学
**Pythonライブラリ:**
- `openslide-python`: `openslide.OpenSlide('file.vsi')`
- `AICSImageIO`: VSIサポート
**EDAアプローチ:**
- ピラミッドレベル解析
- タイル構造とオーバーラップ
- マクロおよびラベル画像
- 倍率レベル
- 全スライド統計
- 領域検出

### .ims - Imaris Format
**説明:** Bitplane ImarisのHDF5ベース形式
**典型的データ:** 大規模3D/4D顕微鏡データセット
**用途:** 3Dレンダリング、タイムラプス解析
**Pythonライブラリ:**
- `h5py`: HDF5への直接アクセス
- `imaris_ims_file_reader`: 専用リーダー
**EDAアプローチ:**
- 解像度レベル解析
- タイムポイント構造
- チャンネル編成
- データセット階層
- サムネイル生成
- メモリマップトアクセス戦略
- チャンキング最適化

### .lsm - Zeiss LSM
**説明:** 従来のZeiss共焦点形式
**典型的データ:** 共焦点レーザー走査顕微鏡
**用途:** 古いZeiss共焦点データ
**Pythonライブラリ:**
- `tifffile`: LSMサポート（TIFFベース）
- `python-bioformats`: LSM読み込み
**EDAアプローチ:**
- TIFFと同様、LSM固有メタデータ付き
- スキャンスピードと解像度
- レーザーラインと出力
- 検出器ゲインとオフセット
- LUT情報

### .stk - MetaMorph Stack
**説明:** MetaMorph画像スタック形式
**典型的データ:** タイムラプスまたはZスタックシーケンス
**用途:** MetaMorphソフトウェア出力
**Pythonライブラリ:**
- `tifffile`: STKはTIFFベース
- `python-bioformats`: STKサポート
**EDAアプローチ:**
- スタック次元数
- プレーンメタデータ
- タイミング情報
- ステージ位置
- UICタグのパース

### .dv - DeltaVision
**説明:** Applied Precision DeltaVision形式
**典型的データ:** デコンボリューション顕微鏡
**用途:** DeltaVision顕微鏡データ
**Pythonライブラリ:**
- `mrc`: DV読み込み可能（MRC関連）
- `AICSImageIO`: DVサポート
**EDAアプローチ:**
- ウェーブ情報（チャンネル）
- 拡張ヘッダー解析
- レンズと倍率
- デコンボリューション状態
- セクションごとのタイムスタンプ

### .mrc - Medical Research Council
**説明:** 電子顕微鏡形式
**典型的データ:** EM画像、クライオEM、トモグラフィー
**用途:** 構造生物学、電子顕微鏡
**Pythonライブラリ:**
- `mrcfile`: `mrcfile.open('file.mrc')`
- `EMAN2`: EM専用ツール
**EDAアプローチ:**
- ボリューム寸法
- ボクセルサイズと単位
- 原点とマップ統計
- 対称性情報
- 拡張ヘッダー解析
- 密度統計
- ヘッダー整合性検証

### .dm3 / .dm4 - Gatan Digital Micrograph
**説明:** Gatan TEM/STEM形式
**典型的データ:** 透過型電子顕微鏡
**用途:** TEMイメージングと解析
**Pythonライブラリ:**
- `hyperspy`: `hs.load('file.dm3')`
- `ncempy`: `ncempy.io.dm.dmReader('file.dm3')`
**EDAアプローチ:**
- 顕微鏡パラメータ
- エネルギー分散分光データ
- 回折パターン
- キャリブレーション情報
- タグ構造解析
- 画像シリーズ処理

### .eer - Electron Event Representation
**説明:** 直接電子検出器形式
**典型的データ:** 検出器からの電子カウンティングデータ
**用途:** クライオEMデータ収集
**Pythonライブラリ:**
- `mrcfile`: 一部EERサポート
- ベンダー固有ツール（Gatan, TFS）
**EDAアプローチ:**
- イベントカウンティング統計
- フレームレートと線量
- 検出器構成
- モーション補正評価
- ゲインリファレンス検証

### .ser - TIA Series
**説明:** FEI/TFS TIA形式
**典型的データ:** EM画像シリーズ
**用途:** FEI/Thermo Fisher EMデータ
**Pythonライブラリ:**
- `hyperspy`: SERサポート
- `ncempy`: TIAリーダー
**EDAアプローチ:**
- シリーズ構造
- キャリブレーションデータ
- 取得メタデータ
- タイムスタンプ
- 多次元データ編成

## 医療・バイオロジカルイメージング

### .dcm - DICOM
**説明:** Digital Imaging and Communications in Medicine
**典型的データ:** 患者/スタディメタデータ付き医療画像
**用途:** 臨床イメージング、放射線科、CT、MRI、PET
**Pythonライブラリ:**
- `pydicom`: `pydicom.dcmread('file.dcm')`
- `SimpleITK`: `sitk.ReadImage('file.dcm')`
- `nibabel`: 限定的DICOMサポート
**EDAアプローチ:**
- 患者メタデータ抽出（匿名化チェック）
- モダリティ固有解析
- シリーズとスタディの編成
- スライス厚と間隔
- ウィンドウ/レベル設定
- ハウンスフィールド単位（CT）
- 画像方向と位置
- マルチフレーム解析

### .nii / .nii.gz - NIfTI
**説明:** Neuroimaging Informatics Technology Initiative
**典型的データ:** 脳イメージング、fMRI、構造MRI
**用途:** 神経イメージング研究、脳解析
**Pythonライブラリ:**
- `nibabel`: `nibabel.load('file.nii')`
- `nilearn`: 機械学習付き神経イメージング
- `SimpleITK`: NIfTIサポート
**EDAアプローチ:**
- ボリューム寸法とボクセルサイズ
- アフィン変換行列
- 時系列解析（fMRI）
- 輝度分布
- 脳抽出品質
- レジストレーション評価
- 方向検証
- ヘッダー情報整合性

### .mnc - MINC Format
**説明:** Medical Image NetCDF
**典型的データ:** 医療イメージング（NIfTIの前身）
**用途:** 従来の神経イメージングデータ
**Pythonライブラリ:**
- `pyminc`: MINC専用ツール
- `nibabel`: MINCサポート
**EDAアプローチ:**
- NIfTIと同様
- NetCDF構造探索
- 次元順序
- メタデータ抽出

### .nrrd - Nearly Raw Raster Data
**説明:** 分離ヘッダー付き医療イメージング形式
**典型的データ:** 医療画像、研究用イメージング
**用途:** 3D Slicer、ITKベースアプリケーション
**Pythonライブラリ:**
- `pynrrd`: `nrrd.read('file.nrrd')`
- `SimpleITK`: NRRDサポート
**EDAアプローチ:**
- ヘッダーフィールド解析
- エンコーディング形式
- 寸法と間隔
- 方向行列
- 圧縮評価
- エンディアン処理

### .mha / .mhd - MetaImage
**説明:** MetaImage形式（ITK）
**典型的データ:** 医療/科学3D画像
**用途:** ITK/SimpleITKアプリケーション
**Pythonライブラリ:**
- `SimpleITK`: ネイティブMHA/MHDサポート
- `itk`: ITK直接統合
**EDAアプローチ:**
- ヘッダー-データファイルペアリング（MHD）
- 変換行列
- 要素間隔
- 圧縮形式
- データ型と寸法

### .hdr / .img - Analyze Format
**説明:** 従来の医療イメージング形式
**典型的データ:** 脳イメージング（NIfTI以前）
**用途:** 古い神経イメージングデータセット
**Pythonライブラリ:**
- `nibabel`: Analyzeサポート
- NIfTIへの変換を推奨
**EDAアプローチ:**
- ヘッダー-画像ペアリング検証
- バイトオーダーの問題
- モダン形式への変換
- メタデータの制限

## 科学画像形式

### .png - Portable Network Graphics
**説明:** 可逆圧縮画像形式
**典型的データ:** 2D画像、スクリーンショット、処理済みデータ
**用途:** 出版図表、可逆ストレージ
**Pythonライブラリ:**
- `PIL/Pillow`: `Image.open('file.png')`
- `scikit-image`: `io.imread('file.png')`
- `imageio`: `imageio.imread('file.png')`
**EDAアプローチ:**
- ビット深度解析（8ビット、16ビット）
- カラーモード（グレースケール、RGB、パレット）
- メタデータ（PNGチャンク）
- 透明度処理
- 圧縮効率
- ヒストグラム解析

### .jpg / .jpeg - Joint Photographic Experts Group
**説明:** 非可逆圧縮画像形式
**典型的データ:** 自然画像、写真
**用途:** 可視化、Webグラフィックス（生データには不適）
**Pythonライブラリ:**
- `PIL/Pillow`: 標準JPEGサポート
- `scikit-image`: JPEG読み込み
**EDAアプローチ:**
- 圧縮アーティファクト検出
- 品質係数推定
- 色空間（RGB、グレースケール）
- EXIFメタデータ
- 量子化テーブル解析
- 注意: 定量解析には不適

### .bmp - Bitmap Image
**説明:** 非圧縮ラスター画像
**典型的データ:** 単純な画像、スクリーンショット
**用途:** 互換性、単純なストレージ
**Pythonライブラリ:**
- `PIL/Pillow`: BMPサポート
- `scikit-image`: BMP読み込み
**EDAアプローチ:**
- 色深度
- パレット解析（インデックスカラーの場合）
- ファイルサイズ効率
- ピクセルフォーマット検証

### .gif - Graphics Interchange Format
**説明:** アニメーション対応画像形式
**典型的データ:** アニメーション画像、単純なグラフィックス
**用途:** アニメーション、タイムラプス可視化
**Pythonライブラリ:**
- `PIL/Pillow`: GIFサポート
- `imageio`: GIFアニメーションの強化サポート
**EDAアプローチ:**
- フレーム数とタイミング
- パレット制限（256色）
- ループ回数
- ディスポーザルメソッド
- 透明度処理

### .svg - Scalable Vector Graphics
**説明:** XMLベースのベクターグラフィックス
**典型的データ:** ベクター図面、プロット、ダイアグラム
**用途:** 出版品質図表、プロット
**Pythonライブラリ:**
- `svgpathtools`: パス操作
- `cairosvg`: ラスタライズ
- `lxml`: XMLパース
**EDAアプローチ:**
- 要素構造解析
- スタイル情報
- ビューボックスと寸法
- パス複雑度
- テキスト要素抽出
- レイヤー編成

### .eps - Encapsulated PostScript
**説明:** ベクターグラフィックス形式
**典型的データ:** 出版図表
**用途:** 従来の出版グラフィックス
**Pythonライブラリ:**
- `PIL/Pillow`: 基本的EPSラスタライズ
- `ghostscript` via subprocess
**EDAアプローチ:**
- バウンディングボックス情報
- プレビュー画像検証
- フォント埋め込み
- モダン形式への変換

### .pdf (Images)
**説明:** 画像を含むPortable Document Format
**典型的データ:** 出版図表、複数ページドキュメント
**用途:** 出版、データプレゼンテーション
**Pythonライブラリ:**
- `PyMuPDF/fitz`: `fitz.open('file.pdf')`
- `pdf2image`: ラスタライズ
- `pdfplumber`: テキストとレイアウト抽出
**EDAアプローチ:**
- ページ数
- 画像抽出
- 解像度とDPI
- 埋め込みフォントとメタデータ
- 圧縮メソッド
- 画像とベクターコンテンツの区別

### .fig - MATLAB Figure
**説明:** MATLABフィギュアファイル
**典型的データ:** MATLABプロットと図表
**用途:** MATLABデータ可視化
**Pythonライブラリ:**
- カスタムパーサー（MATファイル構造）
- 他形式への変換
**EDAアプローチ:**
- フィギュア構造
- プロットからのデータ抽出
- 軸とラベル情報
- プロットタイプ識別

### .hdf5 (Imaging Specific)
**説明:** 大規模イメージングデータセット用HDF5
**典型的データ:** ハイコンテンツスクリーニング、大規模顕微鏡
**用途:** BigDataViewer、大規模イメージング
**Pythonライブラリ:**
- `h5py`: 汎用HDF5アクセス
- イメージング専用リーダー（BigDataViewer）
**EDAアプローチ:**
- データセット階層
- チャンクと圧縮戦略
- マルチレゾリューションピラミッド
- メタデータ編成
- メモリマップトアクセス
- 並列I/Oパフォーマンス

### .zarr - Chunked Array Storage
**説明:** クラウド最適化配列ストレージ
**典型的データ:** 大規模イメージングデータセット、OME-ZARR
**用途:** クラウド顕微鏡、大規模解析
**Pythonライブラリ:**
- `zarr`: `zarr.open('file.zarr')`
- `ome-zarr-py`: OME-ZARRサポート
**EDAアプローチ:**
- チャンクサイズ最適化
- 圧縮コーデック解析
- マルチスケール表現
- 配列寸法とdtype
- メタデータ構造（OME）
- クラウドアクセスパターン

### .raw - Raw Image Data
**説明:** 非フォーマットバイナリピクセルデータ
**典型的データ:** 生検出器出力
**用途:** カスタムイメージングシステム
**Pythonライブラリ:**
- `numpy`: `np.fromfile()` with dtype
- `imageio`: Raw形式プラグイン
**EDAアプローチ:**
- 寸法決定（外部情報が必要）
- バイトオーダーとデータ型
- ヘッダー存在検出
- ピクセル値範囲
- ノイズ特性

### .bin - Binary Image Data
**説明:** 汎用バイナリ画像形式
**典型的データ:** 生またはカスタムフォーマット画像
**用途:** 機器固有出力
**Pythonライブラリ:**
- `numpy`: カスタムバイナリ読み込み
- `struct`: 構造化バイナリデータ用
**EDAアプローチ:**
- 形式仕様が必要
- ヘッダーパース（存在する場合）
- データ型推論
- 寸法抽出
- 既知パラメータでの検証

## 画像解析形式

### .roi - ImageJ ROI
**説明:** ImageJ関心領域形式
**典型的データ:** 幾何学的ROI、選択範囲
**用途:** ImageJ/Fiji解析ワークフロー
**Pythonライブラリ:**
- `read-roi`: `read_roi.read_roi_file('file.roi')`
- `roifile`: ROI操作
**EDAアプローチ:**
- ROIタイプ解析（矩形、ポリゴン等）
- 座標抽出
- ROIプロパティ（面積、周長）
- グループ解析（ROIセット）
- Z位置と時間情報

### .zip (ROI sets)
**説明:** ImageJ ROIのZIPアーカイブ
**典型的データ:** 複数ROIファイル
**用途:** バッチROI解析
**Pythonライブラリ:**
- `read-roi`: `read_roi.read_roi_zip('file.zip')`
- 標準`zipfile`モジュール
**EDAアプローチ:**
- セット内ROI数
- ROIタイプ分布
- 空間分布
- オーバーラップROI検出
- 命名規則

### .ome.tif / .ome.tiff - OME-TIFF
**説明:** OME-XMLメタデータ付きTIFF
**典型的データ:** 豊富なメタデータを持つ標準化顕微鏡データ
**用途:** Bio-Formats互換ストレージ
**Pythonライブラリ:**
- `tifffile`: OME-TIFFサポート
- `AICSImageIO`: OME読み込み
- `python-bioformats`: Bio-Formats統合
**EDAアプローチ:**
- OME-XML検証
- 物理寸法抽出
- チャンネル命名と波長
- プレーン位置（Z, C, T）
- 機器メタデータ
- Bio-Formats互換性

### .ome.zarr - OME-ZARR
**説明:** ZARR上のOME-NGFF仕様
**典型的データ:** 次世代バイオイメージングファイル形式
**用途:** クラウドネイティブイメージング、大規模データセット
**Pythonライブラリ:**
- `ome-zarr-py`: 公式実装
- `zarr`: 基盤配列ストレージ
**EDAアプローチ:**
- マルチスケール解像度レベル
- OME-NGFF仕様へのメタデータ準拠
- 座標変換
- ラベルとROI処理
- クラウドストレージ最適化
- チャンクアクセスパターン

### .klb - Keller Lab Block
**説明:** 大規模データ用高速顕微鏡形式
**典型的データ:** ライトシート顕微鏡、タイムラプス
**用途:** ハイスループットイメージング
**Pythonライブラリ:**
- `pyklb`: KLB読み書き
**EDAアプローチ:**
- 圧縮効率
- ブロック構造
- マルチレゾリューションサポート
- 読み込みパフォーマンスベンチマーク
- メタデータ抽出

### .vsi - Whole Slide Imaging
**説明:** バーチャルスライド形式（複数ベンダー対応）
**典型的データ:** 病理スライド、大規模モザイク
**用途:** デジタル病理学
**Pythonライブラリ:**
- `openslide-python`: マルチ形式WSI
- `tiffslide`: Pure Python代替
**EDAアプローチ:**
- ピラミッドレベル数
- ダウンサンプリング係数
- 関連画像（マクロ、ラベル）
- タイルサイズとオーバーラップ
- MPP（ミクロン/ピクセル）
- 背景検出
- 組織セグメンテーション

### .ndpi - Hamamatsu NanoZoomer
**説明:** Hamamatsuスライドスキャナー形式
**典型的データ:** 全スライド病理画像
**用途:** デジタル病理学ワークフロー
**Pythonライブラリ:**
- `openslide-python`: NDPIサポート
**EDAアプローチ:**
- マルチレゾリューションピラミッド
- レンズと対物レンズ情報
- スキャンエリアと倍率
- 焦点面情報
- 組織検出

### .svs - Aperio ScanScope
**説明:** Aperio全スライド形式
**典型的データ:** デジタル病理スライド
**用途:** 病理画像解析
**Pythonライブラリ:**
- `openslide-python`: SVSサポート
**EDAアプローチ:**
- ピラミッド構造
- MPPキャリブレーション
- ラベルとマクロ画像
- 圧縮品質
- サムネイル生成

### .scn - Leica SCN
**説明:** Leicaスライドスキャナー形式
**典型的データ:** 全スライドイメージング
**用途:** デジタル病理学
**Pythonライブラリ:**
- `openslide-python`: SCNサポート
**EDAアプローチ:**
- タイル構造解析
- コレクション編成
- メタデータ抽出
- 倍率レベル
