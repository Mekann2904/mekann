---
name: research-presentation
description: 研究発表資料作成の統合ツールキット。スライド、ポスター、LaTeX Beamerを統合。学会発表、セミナー、ポスター発表に対応。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - scientific-slides
    - latex-posters
    - pptx-posters
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Presentation

> **統合スキル:** このスキルは scientific-slides, latex-posters, pptx-posters を統合したものです。

## 概要

研究発表資料作成の統合ツールキット。PowerPointスライド、LaTeX Beamer、研究ポスターの作成を提供。

**主な機能:**
- PowerPoint スライド作成
- LaTeX Beamer スライド作成
- 研究ポスター作成（LaTeX/PowerPoint）
- 学会発表テンプレート

## セットアップ

```bash
# PowerPoint処理
uv pip install python-pptx

# LaTeX環境（要インストール）
# beamer, beamerposter, tikzposter

# 画像生成
uv pip install Pillow matplotlib
```

## 使用タイミング

| タスク | 推奨ツール |
|--------|-----------|
| 口頭発表 | PowerPoint / Beamer |
| ポスター発表 | beamerposter / tikzposter |
| テンプレート重視 | LaTeX |
| 共同編集 | PowerPoint |

## ワークフロー

### PowerPoint スライド

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

# プレゼン作成（16:9）
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# タイトルスライド
slide = prs.slides.add_slide(prs.slide_layouts[6])
# カスタムレイアウトでタイトル追加

# 内容スライド
slide = prs.slides.add_slide(prs.slide_layouts[5])
title = slide.shapes.title
title.text = "Methodology"

# 箇条書き
body = slide.placeholders[1]
tf = body.text_frame
tf.text = "Key points:"
p = tf.add_paragraph()
p.text = "Point 1: Data collection"
p.level = 1
p = tf.add_paragraph()
p.text = "Point 2: Analysis"
p.level = 1

# 図の追加
slide.shapes.add_picture('figure.png', Inches(1), Inches(2), width=Inches(5))

# 保存
prs.save('presentation.pptx')
```

### LaTeX Beamer スライド

```latex
\documentclass[aspectratio=169]{beamer}

\usetheme{Madrid}
\usecolortheme{default}

\title{Research Title}
\author{Author Name}
\institute{Institution}
\date{\today}

\begin{document}

\begin{frame}
\titlepage
\end{frame}

\begin{frame}{Outline}
\tableofcontents
\end{frame}

\section{Introduction}

\begin{frame}{Introduction}
\begin{itemize}
    \item Background
    \item Research question
    \item Objectives
\end{itemize}
\end{frame}

\section{Methods}

\begin{frame}{Methods}
\begin{columns}
\column{0.5\textwidth}
\begin{itemize}
    \item Data collection
    \item Analysis approach
\end{itemize}
\column{0.5\textwidth}
\begin{figure}
    \includegraphics[width=\textwidth]{method.png}
\end{figure}
\end{columns}
\end{frame}

\section{Results}

\begin{frame}{Results}
\begin{table}
\centering
\begin{tabular}{lcc}
\hline
Condition & Mean & SD \\
\hline
Group A & 3.5 & 0.8 \\
Group B & 4.2 & 0.6 \\
\hline
\end{tabular}
\end{table}
\end{frame}

\end{document}
```

### 研究ポスター（beamerposter）

```latex
\documentclass[final]{beamer}
\usepackage[orientation=portrait, size=a0, scale=1.4]{beamerposter}

\usetheme{confposter}

\begin{document}
\begin{frame}[t]
\begin{columns}[t]

\begin{column}{\sepwid}\end{column}

\begin{column}{\onecolwid}
\begin{block}{Introduction}
Content here...
\end{block}

\begin{block}{Methods}
Content here...
\end{block}
\end{column}

\begin{column}{\sepwid}\end{column}

\begin{column}{\onecolwid}
\begin{block}{Results}
\begin{figure}
\includegraphics[width=0.9\textwidth]{result.png}
\end{figure}
\end{block}

\begin{block}{Conclusions}
Content here...
\end{block}
\end{column}

\end{columns}
\end{frame}
\end{document}
```

## スライド構成テンプレート

### 口頭発表（15分）

| スライド | 内容 | 時間 |
|----------|------|------|
| 1 | タイトル | 30秒 |
| 2 | 概要・アウトライン | 30秒 |
| 3-4 | 背景・問題設定 | 2分 |
| 5-6 | 手法 | 3分 |
| 7-10 | 結果 | 5分 |
| 11 | 議論 | 2分 |
| 12 | 結論・今後の課題 | 1分 |
| 13 | 参考文献・謝辞 | 30秒 |

### ポスター発表

| セクション | 内容 | 割合 |
|------------|------|------|
| タイトル | 研究タイトル、著者 | 10% |
| Introduction | 背景、目的 | 15% |
| Methods | 手法、データ | 20% |
| Results | 結果、図表 | 35% |
| Conclusions | 結論、今後 | 15% |
| References | 参考文献 | 5% |

## Beamerテーマ

| テーマ | 特徴 | 推奨用途 |
|--------|------|----------|
| Madrid | クラシック | 一般学会 |
| Berlin | ナビゲーション付き | 長い発表 |
| CambridgeUS | 学術的 | 学会発表 |
| Boadilla | シンプル | 短い発表 |
| metropolis | モダン | 技術発表 |

## ベストプラクティス

### スライドデザイン

1. **1スライド1メッセージ**: 情報を詰め込みすぎない
2. **視覚的階層**: タイトル→要点→詳細
3. **フォントサイズ**: 最小18pt（プロジェクター対応）
4. **色使い**: 3-4色以内、コントラスト重視

### ポスター

1. **読みやすさ**: 1-2メートル離れて読める文字サイズ
2. **視覚的フロー**: 左上から右下へ
3. **図表重視**: テキストより図を優先
4. **QRコード**: 詳細情報へのリンク

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| PDF化できない | LaTeXエラー | ログ確認 |
| 図が大きすぎる | サイズ指定なし | width指定 |
| フォントエラー | 日本語フォント | ctex使用 |
| レイアウト崩れ | カラム指定 | columns環境調整 |

## 関連スキル

- [research-writing](../research-writing/): 学術執筆
- [research-visualization](../research-visualization/): 可視化
- [research-documents](../research-documents/): ドキュメント処理

---

*このスキルは研究発表資料作成の統合ツールキットを提供します。*
*統合元: scientific-slides, latex-posters, pptx-posters*
