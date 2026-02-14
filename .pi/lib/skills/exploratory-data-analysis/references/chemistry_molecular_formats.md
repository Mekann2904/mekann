---
template-type: reference
skill: exploratory-data-analysis
category: chemistry-molecular
description: 60以上の化学・分子ファイル形式のリファレンス。構造ファイル、計算化学出力、分子動力学トラジェクトリを含む。
---

# 化学および分子ファイル形式リファレンス

本リファレンスは、計算化学、ケモインフォマティクス、分子モデリング、および関連分野で一般的に使用されるファイル形式を網羅しています。

## 構造ファイル形式

### .pdb - Protein Data Bank
**説明:** 生物巨大分子の3D構造に関する標準フォーマット
**典型的データ:** 原子座標、残基情報、二次構造、結晶構造データ
**使用例:** タンパク質構造解析、分子可視化、ドッキング研究
**Pythonライブラリ:**
- `Biopython`: `Bio.PDB`
- `MDAnalysis`: `MDAnalysis.Universe('file.pdb')`
- `PyMOL`: `pymol.cmd.load('file.pdb')`
- `ProDy`: `prody.parsePDB('file.pdb')`
**EDAアプローチ:**
- 構造検証（結合長、角度、立体障害）
- 二次構造解析
- B因子分布
- 欠損残基/原子の検出
- Ramachandranプロットによる検証
- 表面積と体積の計算

### .cif - Crystallographic Information File
**説明:** 結晶学的情報のための構造化データフォーマット
**典型的データ:** 単位格子パラメータ、原子座標、対称操作、実験データ
**使用例:** 結晶構造決定、構造生物学、材料科学
**Pythonライブラリ:**
- `gemmi`: `gemmi.cif.read_file('file.cif')`
- `PyCifRW`: `CifFile.ReadCif('file.cif')`
- `Biopython`: `Bio.PDB.MMCIFParser()`
**EDAアプローチ:**
- データ完全性チェック
- 分解能と品質メトリクス
- 単位格子パラメータ解析
- 対称群の検証
- 原子変位パラメータ
- R因子と検証メトリクス

### .mol - MDL Molfile
**説明:** MDL/Accelrysによる化学構造ファイルフォーマット
**典型的データ:** 2D/3D座標、原子タイプ、結合次数、電荷
**使用例:** 化学データベース保存、ケモインフォマティクス、創薬設計
**Pythonライブラリ:**
- `RDKit`: `Chem.MolFromMolFile('file.mol')`
- `Open Babel`: `pybel.readfile('mol', 'file.mol')`
- `ChemoPy`: 記述子計算用
**EDAアプローチ:**
- 分子特性計算（分子量、logP、TPSA）
- 官能基解析
- 環系検出
- 立体化学検証
- 2D/3D座標の一貫性
- 原子価と電荷の検証

### .mol2 - Tripos Mol2
**説明:** 原子タイピングを含む完全な3D分子構造フォーマット
**典型的データ:** 座標、SYBYL原子タイプ、結合タイプ、電荷、部分構造
**使用例:** 分子ドッキング、QSAR研究、創薬
**Pythonライブラリ:**
- `RDKit`: `Chem.MolFromMol2File('file.mol2')`
- `Open Babel`: `pybel.readfile('mol2', 'file.mol2')`
- `MDAnalysis`: mol2トポロジーの解析が可能
**EDAアプローチ:**
- 原子タイプ分布
- 部分電荷解析
- 結合タイプ統計
- 部分構造同定
- コンホメーション解析
- エネルギー最小化状態の確認

### .sdf - Structure Data File
**説明:** 関連データを含む複数構造ファイルフォーマット
**典型的データ:** プロパティ/注釈付きの複数分子構造
**使用例:** 化学データベース、バーチャルスクリーニング、化合物ライブラリ
**Pythonライブラリ:**
- `RDKit`: `Chem.SDMolSupplier('file.sdf')`
- `Open Babel`: `pybel.readfile('sdf', 'file.sdf')`
- `PandasTools` (RDKit): DataFrame統合用
**EDAアプローチ:**
- データセットサイズと多様性メトリクス
- 特性分布解析（分子量、logP等）
- 構造多様性（Tanimoto類似度）
- 欠損データ評価
- 特性の外れ値検出
- スキャフォールド解析

### .xyz - XYZ Coordinates
**説明:** シンプルなデカルト座標フォーマット
**典型的データ:** 原子タイプと3D座標
**使用例:** 量子化学、幾何最適化、分子動力学
**Pythonライブラリ:**
- `ASE`: `ase.io.read('file.xyz')`
- `Open Babel`: `pybel.readfile('xyz', 'file.xyz')`
- `cclib`: xyzを含むQM出力の解析用
**EDAアプローチ:**
- 幾何解析（結合長、角度、二面角）
- 重心計算
- 慣性モーメント
- 分子サイズメトリクス
- 座標検証
- 対称性検出

### .smi / .smiles - SMILES String
**説明:** 化学構造のラインノーテーション
**典型的データ:** 分子構造のテキスト表現
**使用例:** 化学データベース、文献マイニング、データ交換
**Pythonライブラリ:**
- `RDKit`: `Chem.MolFromSmiles(smiles)`
- `Open Babel`: SMILES解析が可能
- `DeepChem`: SMILESの機械学習用
**EDAアプローチ:**
- SMILES構文検証
- SMILESからの記述子計算
- フィンガープリント生成
- 部分構造検索
- 互変異性体列挙
- 立体異性体処理

### .pdbqt - AutoDock PDBQT
**説明:** AutoDockドッキング用の修正PDBフォーマット
**典型的データ:** 座標、部分電荷、ドッキング用原子タイプ
**使用例:** 分子ドッキング、バーチャルスクリーニング
**Pythonライブラリ:**
- `Meeko`: PDBQT準備用
- `Open Babel`: PDBQT読み込み可能
- `ProDy`: 限定的なPDBQTサポート
**EDAアプローチ:**
- 電荷分布解析
- 回転可能結合の同定
- 原子タイプ検証
- 座標品質チェック
- 水素配置検証
- ねじれ定義解析

### .mae - Maestro Format
**説明:** Schrodinger社の独自分子構造フォーマット
**典型的データ:** Schrodingerスイートからの構造、プロパティ、注釈
**使用例:** 創薬、Schrodingerツールによる分子モデリング
**Pythonライブラリ:**
- `schrodinger.structure`: Schrodingerインストールが必要
- 基本読み込み用のカスタムパーサー
**EDAアプローチ:**
- プロパティ抽出と解析
- 構造品質メトリクス
- コンフォーマー解析
- ドッキングスコア分布
- リガンド効率メトリクス

### .gro - GROMACS Coordinate File
**説明:** GROMACS MDシミュレーション用の分子構造ファイル
**典型的データ:** 原子位置、速度、ボックスベクトル
**使用例:** 分子動力学シミュレーション、GROMACSワークフロー
**Pythonライブラリ:**
- `MDAnalysis`: `Universe('file.gro')`
- `MDTraj`: `mdtraj.load_gro('file.gro')`
- `GromacsWrapper`: GROMACS統合用
**EDAアプローチ:**
- 系組成解析
- ボックス寸法検証
- 原子位置分布
- 速度分布（存在する場合）
- 密度計算
- 溶媒和解析

## 計算化学出力形式

### .log - Gaussian Log File
**説明:** Gaussian量子化学計算からの出力
**典型的データ:** エネルギー、幾何、振動数、軌道、電子分布
**使用例:** QM計算、幾何最適化、振動数解析
**Pythonライブラリ:**
- `cclib`: `cclib.io.ccread('file.log')`
- `GaussianRunPack`: Gaussianワークフロー用
- 正規表現によるカスタムパーサー
**EDAアプローチ:**
- 収束解析
- エネルギープロファイル抽出
- 振動数解析
- 軌道エネルギーレベル
- 電子分布解析（Mulliken、NBO）
- 熱化学データ抽出

### .out - Quantum Chemistry Output
**説明:** 様々なQMパッケージからの汎用出力ファイル
**典型的データ:** 計算結果、エネルギー、プロパティ
**使用例:** 異なるソフトウェア間でのQM計算
**Pythonライブラリ:**
- `cclib`: QM出力用の汎用パーサー
- `ASE`: 一部の出力フォーマット読み込み可能
**EDAアプローチ:**
- ソフトウェア固有の解析
- 収束基準チェック
- エネルギーと勾配の傾向
- 基底関数と手法の検証
- 計算コスト解析

### .wfn / .wfx - Wavefunction Files
**説明:** 量子化学解析用の波動関数データ
**典型的データ:** 分子軌道、基底関数、密度行列
**使用例:** 電子密度解析、QTAIM解析
**Pythonライブラリ:**
- `Multiwfn`: Python経由のインターフェース
- `Horton`: 波動関数解析用
- 特定フォーマット用のカスタムパーサー
**EDAアプローチ:**
- 軌道電子分布解析
- 電子密度分布
- 臨界点解析（QTAIM）
- 分子軌道可視化
- 結合解析

### .fchk - Gaussian Formatted Checkpoint
**説明:** Gaussianからのフォーマット済みチェックポイントファイル
**典型的データ:** 完全な波動関数データ、結果、幾何
**使用例:** Gaussian計算のポストプロセッシング
**Pythonライブラリ:**
- `cclib`: fchkファイルの解析が可能
- `GaussView` Python API（利用可能な場合）
- カスタムパーサー
**EDAアプローチ:**
- 波動関数品質評価
- プロパティ抽出
- 基底関数情報
- 勾配とヘシアン解析
- 自然軌道解析

### .cube - Gaussian Cube File
**説明:** 3Dグリッド上のボリュメトリックデータ
**典型的データ:** 電子密度、分子軌道、グリッド上のESP
**使用例:** ボリュメトリックプロパティの可視化
**Pythonライブラリ:**
- `cclib`: `cclib.io.ccread('file.cube')`
- `ase.io`: `ase.io.read('file.cube')`
- `pyquante`: cubeファイル操作用
**EDAアプローチ:**
- グリッド寸法と間隔解析
- 値分布統計
- 等値面値の決定
- 体積積分
- 異なるcube間の比較

## 分子動力学形式

### .dcd - Binary Trajectory
**説明:** バイナリトラジェクトリフォーマット（CHARMM、NAMD）
**典型的データ:** 原子座標の時系列
**使用例:** MDトラジェクトリ解析
**Pythonライブラリ:**
- `MDAnalysis`: `Universe(topology, 'traj.dcd')`
- `MDTraj`: `mdtraj.load_dcd('traj.dcd', top='topology.pdb')`
- `PyTraj` (Amber): 限定的サポート
**EDAアプローチ:**
- RMSD/RMSF解析
- トラジェクトリ長とフレーム数
- 座標範囲とドリフト
- 周期境界処理
- ファイル整合性チェック
- タイムステップ検証

### .xtc - Compressed Trajectory
**説明:** GROMACS圧縮トラジェクトリフォーマット
**典型的データ:** MDシミュレーションからの圧縮座標
**使用例:** スペース効率的なMDトラジェクトリ保存
**Pythonライブラリ:**
- `MDAnalysis`: `Universe(topology, 'traj.xtc')`
- `MDTraj`: `mdtraj.load_xtc('traj.xtc', top='topology.pdb')`
**EDAアプローチ:**
- 圧縮率評価
- 精度損失評価
- 経時的なRMSD
- 構造安定性メトリクス
- サンプリング頻度解析

### .trr - GROMACS Trajectory
**説明:** 完全精度GROMACSトラジェクトリ
**典型的データ:** MDからの座標、速度、力
**使用例:** 高精度MD解析
**Pythonライブラリ:**
- `MDAnalysis`: 完全サポート
- `MDTraj`: trrファイル読み込み可能
- `GromacsWrapper`
**EDAアプローチ:**
- 全系ダイナミクス解析
- エネルギー保存チェック（速度付き）
- 力解析
- 温度と圧力の検証
- 系平衡化評価

### .nc / .netcdf - Amber NetCDF Trajectory
**説明:** Network Common Data Form トラジェクトリ
**典型的データ:** MD座標、速度、力
**使用例:** Amber MDシミュレーション、大規模トラジェクトリ保存
**Pythonライブラリ:**
- `MDAnalysis`: NetCDFサポート
- `PyTraj`: ネイティブAmber解析
- `netCDF4`: 低レベルアクセス
**EDAアプローチ:**
- メタデータ抽出
- トラジェクトリ統計
- 時系列解析
- レプリカ交換解析
- 多次元データ抽出

### .top - GROMACS Topology
**説明:** GROMACS用の分子トポロジー
**典型的データ:** 原子タイプ、結合、角度、力場パラメータ
**使用例:** MDシミュレーションセットアップと解析
**Pythonライブラリ:**
- `ParmEd`: `parmed.load_file('system.top')`
- `MDAnalysis`: トポロジー解析可能
- 特定フィールド用のカスタムパーサー
**EDAアプローチ:**
- 力場パラメータ検証
- 系組成
- 結合/角度/二面角分布
- 電荷中性チェック
- 分子タイプ列挙

### .psf - Protein Structure File (CHARMM)
**説明:** CHARMM/NAMD用のトポロジーファイル
**典型的データ:** 原子結合性、タイプ、電荷
**使用例:** CHARMM/NAMD MDシミュレーション
**Pythonライブラリ:**
- `MDAnalysis`: ネイティブPSFサポート
- `ParmEd`: PSFファイル読み込み可能
**EDAアプローチ:**
- トポロジー検証
- 結合性解析
- 電荷分布
- 原子タイプ統計
- セグメント解析

### .prmtop - Amber Parameter/Topology
**説明:** Amberトポロジーとパラメータファイル
**典型的データ:** 系トポロジー、力場パラメータ
**使用例:** Amber MDシミュレーション
**Pythonライブラリ:**
- `ParmEd`: `parmed.load_file('system.prmtop')`
- `PyTraj`: ネイティブAmberサポート
**EDAアプローチ:**
- 力場完全性
- パラメータ検証
- 系サイズと組成
- 周期ボックス情報
- 解析用原子マスク作成

### .inpcrd / .rst7 - Amber Coordinates
**説明:** Amber座標/リスタートファイル
**典型的データ:** 原子座標、速度、ボックス情報
**使用例:** Amber MDの開始座標
**Pythonライブラリ:**
- `ParmEd`: prmtopと連携
- `PyTraj`: Amber座標読み込み
**EDAアプローチ:**
- 座標有効性
- 系初期化チェック
- ボックスベクトル検証
- 速度分布（リスタートの場合）
- エネルギー最小化状態

## 分光法および分析データ

### .jcamp / .jdx - JCAMP-DX
**説明:** Joint Committee on Atomic and Molecular Physical Data eXchange
**典型的データ:** 分光データ（IR、NMR、MS、UV-Vis）
**使用例:** 分光データ交換とアーカイブ
**Pythonライブラリ:**
- `jcamp`: `jcamp.jcamp_reader('file.jdx')`
- `nmrglue`: NMR JCAMPファイル用
- 特定サブタイプ用のカスタムパーサー
**EDAアプローチ:**
- ピーク検出と解析
- ベースライン補正評価
- S/N比計算
- スペクトル範囲検証
- 積分解析
- 参照スペクトルとの比較

### .mzML - Mass Spectrometry Markup Language
**説明:** 質量分析データ用の標準XMLフォーマット
**典型的データ:** MS/MSスペクトル、クロマトグラム、メタデータ
**使用例:** プロテオミクス、メタボロミクス、質量分析ワークフロー
**Pythonライブラリ:**
- `pymzml`: `pymzml.run.Reader('file.mzML')`
- `pyteomics`: `pyteomics.mzml.read('file.mzML')`
- `MSFileReader` ラッパー
**EDAアプローチ:**
- スキャン数とタイプ
- MSレベル分布
- 保持時間範囲
- m/z範囲と分解能
- ピーク強度分布
- データ完全性
- 品質管理メトリクス

### .mzXML - Mass Spectrometry XML
**説明:** MSデータ用のオープンXMLフォーマット
**典型的データ:** 質量スペクトル、保持時間、ピークリスト
**使用例:** レガシーMSデータ、メタボロミクス
**Pythonライブラリ:**
- `pymzml`: mzXML読み込み可能
- `pyteomics.mzxml`
- 直接XML解析用の`lxml`
**EDAアプローチ:**
- mzMLと同様
- バージョン互換性チェック
- 変換品質評価
- ピークピッキング検証

### .raw - Vendor Raw Data
**説明:** 独自の機器データファイル（Thermo、Bruker等）
**典型的データ:** 生機器信号、未処理データ
**使用例:** 機器データへの直接アクセス
**Pythonライブラリ:**
- `pymsfilereader`: Thermo RAWファイル用
- `ThermoRawFileParser`: CLIラッパー
- ベンダー固有API（Thermo、Bruker Compass）
**EDAアプローチ:**
- 機器メソッド抽出
- 生信号品質
- キャリブレーション状態
- スキャン機能解析
- クロマトグラフィ品質メトリクス

### .d - Agilent Data Directory
**説明:** Agilentのデータフォルダ構造
**典型的データ:** LC-MS、GC-MSデータとメタデータ
**使用例:** Agilent機器データ処理
**Pythonライブラリ:**
- `agilent-reader`: コミュニティツール
- `Chemstation` Python統合
- カスタムディレクトリ解析
**EDAアプローチ:**
- ディレクトリ構造検証
- メソッドパラメータ抽出
- 信号ファイル整合性
- 検量線解析
- シーケンス情報抽出

### .fid - NMR Free Induction Decay
**説明:** 生NMR時間領域データ
**典型的データ:** 時間領域NMR信号
**使用例:** NMR処理と解析
**Pythonライブラリ:**
- `nmrglue`: `nmrglue.bruker.read_fid('fid')`
- `nmrstarlib`: NMR-STARファイル用
**EDAアプローチ:**
- 信号減衰解析
- ノイズレベル評価
- 取得パラメータ検証
- 窓関数選択
- ゼロフィリング最適化
- 位相パラメータ推定

### .ft - NMR Frequency-Domain Data
**説明:** 処理済みNMRスペクトル
**典型的データ:** 周波数領域NMRデータ
**使用例:** NMR解析と解釈
**Pythonライブラリ:**
- `nmrglue`: 包括的なNMRサポート
- `pyNMR`: 処理用
**EDAアプローチ:**
- ピークピッキングと積分
- 化学シフトキャリブレーション
- 多重度解析
- カップリング定数抽出
- スペクトル品質メトリクス
- 参照化合物同定

### .spc - Spectroscopy File
**説明:** Thermo Galactic分光フォーマット
**典型的データ:** IR、ラマン、UV-Visスペクトル
**使用例:** 様々な機器からの分光データ
**Pythonライブラリ:**
- `spc`: `spc.File('file.spc')`
- バイナリフォーマット用のカスタムパーサー
**EDAアプローチ:**
- スペクトル分解能
- 波長/波数範囲
- ベースライン特性
- ピーク同定
- 微分スペクトル計算

## 化学データベース形式

### .inchi - International Chemical Identifier
**説明:** 化学物質のテキスト識別子
**典型的データ:** 階層化された化学構造表現
**使用例:** 化学データベースキー、構造検索
**Pythonライブラリ:**
- `RDKit`: `Chem.MolFromInchi(inchi)`
- `Open Babel`: InChI変換
**EDAアプローチ:**
- InChI検証
- レイヤー解析
- 立体化学確認
- InChIキー生成
- 構造ラウンドトリップ検証

### .cdx / .cdxml - ChemDraw Exchange
**説明:** ChemDraw描画ファイルフォーマット
**典型的データ:** 注釈付き2D化学構造
**使用例:** 化学描画、出版図版
**Pythonライブラリ:**
- `RDKit`: 一部のCDXMLインポート可能
- `Open Babel`: 限定的サポート
- `ChemDraw` Python API（商用）
**EDAアプローチ:**
- 構造抽出
- 注釈保存
- スタイル一貫性
- 2D座標検証

### .cml - Chemical Markup Language
**説明:** XMLベースの化学構造フォーマット
**典型的データ:** 化学構造、反応、プロパティ
**使用例:** セマンティック化学データ表現
**Pythonライブラリ:**
- `RDKit`: CMLサポート
- `Open Babel`: 良好なCMLサポート
- `lxml`: XML解析用
**EDAアプローチ:**
- XMLスキーマ検証
- 名前空間処理
- プロパティ抽出
- 反応スキーム解析
- メタデータ完全性

### .rxn - MDL Reaction File
**説明:** 化学反応構造ファイル
**典型的データ:** 反応物、生成物、反応矢印
**使用例:** 反応データベース、合成計画
**Pythonライブラリ:**
- `RDKit`: `Chem.ReactionFromRxnFile('file.rxn')`
- `Open Babel`: 反応サポート
**EDAアプローチ:**
- 反応収支検証
- 原子マッピング解析
- 試薬同定
- 立体化学変化
- 反応分類

### .rdf - Reaction Data File
**説明:** 複数反応ファイルフォーマット
**典型的データ:** データ付きの複数反応
**使用例:** 反応データベース
**Pythonライブラリ:**
- `RDKit`: RDF読み込み機能
- カスタムパーサー
**EDAアプローチ:**
- 反応収率統計
- 条件解析
- 成功率パターン
- 試薬頻度解析

## 計算出力とデータ

### .hdf5 / .h5 - Hierarchical Data Format
**説明:** 科学データ配列用のコンテナ
**典型的データ:** 大規模配列、メタデータ、階層的構成
**使用例:** 大規模データセット保存、計算結果
**Pythonライブラリ:**
- `h5py`: `h5py.File('file.h5', 'r')`
- `pytables`: 高度なHDF5インターフェース
- `pandas`: HDF5読み込み可能
**EDAアプローチ:**
- データセット構造探索
- 配列形状とdtype解析
- メタデータ抽出
- メモリ効率的なデータサンプリング
- チャンク最適化解析
- 圧縮率評価

### .pkl / .pickle - Python Pickle
**説明:** シリアル化されたPythonオブジェクト
**典型的データ:** 任意のPythonオブジェクト（分子、データフレーム、モデル）
**使用例:** 中間データ保存、モデル永続化
**Pythonライブラリ:**
- `pickle`: 組み込みシリアライゼーション
- `joblib`: 大規模配列用の拡張pickle
- `dill`: 拡張pickleサポート
**EDAアプローチ:**
- オブジェクトタイプ検査
- サイズと複雑さ解析
- バージョン互換性チェック
- セキュリティ検証（信頼できるソース）
- デシリアライゼーションテスト

### .npy / .npz - NumPy Arrays
**説明:** NumPy配列バイナリフォーマット
**典型的データ:** 数値配列（座標、特徴量、行列）
**使用例:** 高速数値データI/O
**Pythonライブラリ:**
- `numpy`: `np.load('file.npy')`
- 大規模ファイルの直接メモリマッピング
**EDAアプローチ:**
- 配列形状と次元
- データ型と精度
- 統計サマリー（平均、標準偏差、範囲）
- 欠損値検出
- 外れ値同定
- メモリフットプリント解析

### .mat - MATLAB Data File
**説明:** MATLABワークスペースデータ
**典型的データ:** MATLABからの配列、構造体
**使用例:** MATLAB-Pythonデータ交換
**Pythonライブラリ:**
- `scipy.io`: `scipy.io.loadmat('file.mat')`
- `h5py`: v7.3 MATファイル用
**EDAアプローチ:**
- 変数抽出とタイプ
- 配列次元解析
- 構造体フィールド探索
- MATLABバージョン互換性
- データ型変換検証

### .csv - Comma-Separated Values
**説明:** テキスト形式の表形式データ
**典型的データ:** 化学特性、実験データ、記述子
**使用例:** データ交換、解析、機械学習
**Pythonライブラリ:**
- `pandas`: `pd.read_csv('file.csv')`
- `csv`: 組み込みモジュール
- `polars`: 高速CSV読み込み
**EDAアプローチ:**
- データ型推論
- 欠損値パターン
- 統計サマリー
- 相関解析
- 分布可視化
- 外れ値検出

### .json - JavaScript Object Notation
**説明:** 構造化テキストデータフォーマット
**典型的データ:** 化学特性、メタデータ、APIレスポンス
**使用例:** データ交換、設定、Web API
**Pythonライブラリ:**
- `json`: 組み込みJSONサポート
- `pandas`: `pd.read_json()`
- `ujson`: 高速JSON解析
**EDAアプローチ:**
- スキーマ検証
- ネスト深度解析
- キー値分布
- データ型一貫性
- 配列長統計

### .parquet - Apache Parquet
**説明:** 列指向ストレージフォーマット
**典型的データ:** 大規模表形式データセットを効率的に
**使用例:** ビッグデータ、効率的な列指向分析
**Pythonライブラリ:**
- `pandas`: `pd.read_parquet('file.parquet')`
- `pyarrow`: 直接parquetアクセス
- `fastparquet`: 代替実装
**EDAアプローチ:**
- メタデータからの列統計
- パーティション解析
- 圧縮効率
- 行グループ構造
- 大規模ファイルの高速サンプリング
- スキーマ進化追跡
