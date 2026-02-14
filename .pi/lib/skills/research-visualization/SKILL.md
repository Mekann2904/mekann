---
name: research-visualization
description: 統合可視化システム。静的プロット（matplotlib/seaborn）、インタラクティブ可視化（plotly）、出版品質フィギュア（Nature/Science/Cell対応）を統合。マルチパネルレイアウト、統計注釈、カラーブラインドセーフパレット、ジャーナル固有のフォーマットに対応。探索的データ可視化から論文投稿用図まで包括的にサポート。
allowed-tools: Read Write Edit Bash
license: MIT
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Visualization

> **統合スキル:** このスキルは matplotlib, seaborn, plotly, scientific-visualization を統合したものです。

## 概要

研究データの可視化を包括的にサポートする統合スキル。探索的データ分析用のクイックプロットから、学術論文投稿用の高品質フィギュアまで、あらゆる可視化ニーズに対応。カラーブラインド対応、マルチパネルレイアウト、統計的注釈の自動追加、主要ジャーナルのフォーマット要件への準拠を重視。

### 統合されたスキル

| 元スキル | 機能 |
|----------|------|
| matplotlib | 低レベルカスタマイズ、出版フィギュア、PDF/EPS出力 |
| seaborn | 統計的可視化、分布プロット、クイック探索 |
| plotly | インタラクティブダッシュボード、Web埋め込み |
| scientific-visualization | マルチパネル、ジャーナルスタイル、Nature/Science対応 |

## 使用タイミング

### 用途別ツール選択

| 用途 | 推奨ツール | 理由 |
|------|------------|------|
| データ探索 | seaborn | 高レベルAPI、デフォルトが美しい |
| インタラクティブ可視化 | plotly | ホバー、ズーム、Web埋め込み |
| 論文投稿用図 | matplotlib + scientific-viz | 完全制御、ジャーナル要件対応 |
| プレゼンテーション | plotly | アニメーション、インタラクション |
| 高速統計プロット | seaborn | boxplot, violin, pairplot |

### ジャーナル別要件

| ジャーナル | 幅 | 解像度 | 形式 | 特記事項 |
|------------|-----|--------|------|----------|
| Nature | 3.5" / 7.2" | 300+ dpi | PDF/TIFF | sans-serif font |
| Science | 2.2" / 4.8" | 300+ dpi | EPS/PDF | Helvetica |
| Cell | 3.3" / 6.7" | 300+ dpi | PDF/TIFF | Arial |
| PLOS | 3.5" / 7.0" | 300+ dpi | TIFF/EPS | AI readability |

## ワークフロー

### ステップ1: スタイルの設定

```python
import matplotlib.pyplot as plt
import numpy as np

# 出版用スタイルの適用
plt.rcParams.update({
    'font.family': 'sans-serif',
    'font.sans-serif': ['Arial', 'Helvetica', 'DejaVu Sans'],
    'font.size': 8,
    'axes.labelsize': 9,
    'axes.titlesize': 10,
    'xtick.labelsize': 8,
    'ytick.labelsize': 8,
    'legend.fontsize': 8,
    'figure.dpi': 300,
    'savefig.dpi': 300,
    'savefig.bbox': 'tight',
    'axes.spines.top': False,
    'axes.spines.right': False,
})
```

### ステップ2: 静的プロット（Matplotlib/Seaborn）

#### 基本的なプロット

```python
import matplotlib.pyplot as plt
import seaborn as sns

# カラーブラインドセーフパレット
colors = ['#0072B2', '#D55E00', '#009E73', '#CC79A7']

fig, ax = plt.subplots(figsize=(3.5, 2.5))

# 散布図 + 回帰線
sns.regplot(data=df, x='predictor', y='outcome', ax=ax,
            scatter_kws={'alpha': 0.5, 'color': colors[0]},
            line_kws={'color': colors[1]})

ax.set_xlabel('Predictor (units)')
ax.set_ylabel('Outcome (units)')

plt.savefig('figure1.pdf')
plt.savefig('figure1.png', dpi=300)
```

#### 統計プロット

```python
# Boxplot with significance annotations
fig, ax = plt.subplots(figsize=(3.5, 2.5))

sns.boxplot(data=df, x='group', y='value', ax=ax,
            palette=colors[:3], width=0.5)

# Add significance bars
def add_significance_bar(ax, x1, x2, y, h, text):
    ax.plot([x1, x1, x2, x2], [y, y+h, y+h, y], 'k-', lw=0.8)
    ax.text((x1+x2)/2, y+h, text, ha='center', va='bottom', fontsize=8)

add_significance_bar(ax, 0, 1, 10, 0.5, '**')
add_significance_bar(ax, 1, 2, 12, 0.5, '***')

ax.set_xlabel('Treatment Group')
ax.set_ylabel('Response (units)')
```

#### 多変量可視化

```python
# Pairplot for multivariate exploration
g = sns.pairplot(df, vars=['var1', 'var2', 'var3', 'var4'],
                 hue='group',
                 palette=colors,
                 diag_kind='kde',
                 corner=True)

g.fig.set_size_inches(7, 6)
plt.savefig('pairplot.pdf')

# Heatmap for correlation matrix
fig, ax = plt.subplots(figsize=(4, 3))
corr = df.corr()
sns.heatmap(corr, annot=True, fmt='.2f', cmap='RdBu_r',
            center=0, vmin=-1, vmax=1, ax=ax)
plt.savefig('correlation_heatmap.pdf')
```

### ステップ3: インタラクティブ可視化（Plotly）

#### 基本的なインタラクティブプロット

```python
import plotly.graph_objects as go
import plotly.express as px

# 散布図
fig = px.scatter(df, x='x', y='y', color='group',
                 hover_data=['id', 'category'],
                 title='Interactive Scatter Plot')

fig.update_layout(
    font=dict(family='Arial', size=12),
    xaxis_title='X Axis (units)',
    yaxis_title='Y Axis (units)'
)

fig.show()
fig.write_html('interactive_plot.html')
```

#### 3D可視化

```python
# 3D Scatter
fig = go.Figure(data=[go.Scatter3d(
    x=df['x'], y=df['y'], z=df['z'],
    mode='markers',
    marker=dict(
        size=5,
        color=df['value'],
        colorscale='Viridis',
        showscale=True
    )
)])

fig.update_layout(
    scene=dict(
        xaxis_title='X',
        yaxis_title='Y',
        zaxis_title='Z'
    )
)

fig.show()
```

#### ダッシュボード構築

```python
from plotly.subplots import make_subplots

# マルチパネルインタラクティブ図
fig = make_subplots(
    rows=2, cols=2,
    subplot_titles=('Distribution', 'Time Series', 'Correlation', 'Groups')
)

# Panel 1: Distribution
fig.add_trace(go.Histogram(x=df['value'], name='Distribution'), row=1, col=1)

# Panel 2: Time series
fig.add_trace(go.Scatter(x=df['time'], y=df['value'], mode='lines', name='Time Series'), row=1, col=2)

# Panel 3: Correlation
fig.add_trace(go.Scatter(x=df['x'], y=df['y'], mode='markers', name='Correlation'), row=2, col=1)

# Panel 4: Groups
for group in df['group'].unique():
    subset = df[df['group'] == group]
    fig.add_trace(go.Box(y=subset['value'], name=group), row=2, col=2)

fig.update_layout(height=700, showlegend=False)
fig.show()
```

### ステップ4: 出版品質フィギュア

#### マルチパネルレイアウト

```python
def create_multipanel_figure(data):
    """論文用マルチパネルフィギュアの作成"""

    fig, axes = plt.subplots(2, 2, figsize=(7.2, 5.5))

    # Panel A: Main result
    ax = axes[0, 0]
    sns.barplot(data=data, x='condition', y='response', ax=ax,
                palette=colors[:2], capsize=0.1, errwidth=1)
    ax.set_title('A', fontweight='bold', loc='left')
    ax.set_xlabel('Condition')
    ax.set_ylabel('Response (units)')

    # Panel B: Distribution
    ax = axes[0, 1]
    for i, group in enumerate(data['group'].unique()):
        subset = data[data['group'] == group]
        ax.hist(subset['value'], bins=20, alpha=0.6, label=group, color=colors[i])
    ax.set_title('B', fontweight='bold', loc='left')
    ax.legend(frameon=False)

    # Panel C: Time course
    ax = axes[1, 0]
    for i, group in enumerate(data['group'].unique()):
        subset = data[data['group'] == group]
        mean = subset.groupby('time')['value'].mean()
        sem = subset.groupby('time')['value'].sem()
        ax.fill_between(mean.index, mean - sem, mean + sem, alpha=0.3, color=colors[i])
        ax.plot(mean.index, mean, color=colors[i], label=group)
    ax.set_title('C', fontweight='bold', loc='left')
    ax.set_xlabel('Time (hours)')
    ax.set_ylabel('Value')

    # Panel D: Correlation
    ax = axes[1, 1]
    ax.scatter(data['x'], data['y'], alpha=0.5, c=data['group'].map(dict(zip(data['group'].unique(), colors))))
    ax.set_title('D', fontweight='bold', loc='left')
    ax.set_xlabel('X (units)')
    ax.set_ylabel('Y (units)')

    plt.tight_layout()

    # Add scale bar if needed
    # add_scale_bar(axes[1, 1], length=1, label='1 unit')

    return fig
```

#### ジャーナルスタイルの適用

```python
# Nature スタイル
def apply_nature_style():
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Helvetica'],
        'font.size': 5,
        'axes.labelsize': 6,
        'xtick.labelsize': 5,
        'ytick.labelsize': 5,
        'lines.linewidth': 0.5,
        'axes.linewidth': 0.5,
        'xtick.major.width': 0.5,
        'ytick.major.width': 0.5,
    })

# Science スタイル
def apply_science_style():
    plt.rcParams.update({
        'font.family': 'sans-serif',
        'font.sans-serif': ['Helvetica'],
        'font.size': 6,
        'axes.labelsize': 7,
        'lines.linewidth': 0.75,
        'axes.linewidth': 0.75,
    })
```

## カラーパレット

### カラーブラインドセーフパレット

```python
# Wong's colorblind-safe palette
COLORBLIND_PALETTE = {
    'blue': '#0072B2',
    'orange': '#D55E00',
    'green': '#009E73',
    'pink': '#CC79A7',
    'sky_blue': '#56B4E9',
    'vermillion': '#D55E00',
    'reddish_purple': '#AA4499',
    'yellow': '#F0E442',
    'black': '#000000'
}

# 使用例
colors = list(COLORBLIND_PALETTE.values())
```

### 用途別推奨パレット

| 用途 | パレット | 説明 |
|------|----------|------|
| カテゴリカル | Set2, colorblind | 最大8色、識別しやすい |
| 連続値 | Viridis, Plasma | 色覚多様性対応 |
| 発散 | RdBu, RdYlBu | 正負の値、中心あり |
| 順序 | Blues, Greens | 低〜高の順序表現 |

## 出力形式

### 用途別推奨形式

| 用途 | 形式 | 解像度 | 理由 |
|------|------|--------|------|
| 論文投稿 | PDF/EPS | ベクター | スケーラブル |
| 論文投稿（TIFF必要） | TIFF | 300+ dpi | 一部ジャーナル |
| プレゼン | PNG | 150 dpi | 表示速度 |
| Web | SVG/PNG | 150 dpi | 互換性 |
| インタラクティブ | HTML | - | Plotly出力 |

## スクリプト

### static_plots.py
```bash
python scripts/static_plots.py \
    --data data.csv \
    --plot-type scatter \
    --x predictor \
    --y outcome \
    --hue group \
    --output figure1.pdf
```

### interactive_plots.py
```bash
python scripts/interactive_plots.py \
    --data data.csv \
    --plot-type 3d-scatter \
    --output interactive.html
```

### publication_figures.py
```bash
python scripts/publication_figures.py \
    --data results.csv \
    --journal nature \
    --layout 2x2 \
    --output figures/
```

## 他のスキルとの統合

### research-statistics
統計結果（信頼区間、p値）をプロットに追加。

### research-data-analysis
EDA結果を可視化レポートに変換。

### ml-classical
モデル性能（ROC、混同行列）を可視化。

### research-writing
論文用フィギュアをLaTeX文書に統合。

## 使用例

### 完全な出版パイプライン

```python
# 1. スタイル適用
apply_nature_style()

# 2. データ準備
data = load_and_process('results.csv')

# 3. マルチパネルフィギュア作成
fig = create_multipanel_figure(data)

# 4. 品質チェック
check_colorblind_accessibility(fig)
check_resolution(fig, min_dpi=300)

# 5. 出力
save_for_publication(fig, 'figure1', journal='nature', formats=['pdf', 'tiff'])
```

### インタラクティブダッシュボード

```python
# Plotly Dashboard
from plotly.subplots import make_subplots
import plotly.graph_objects as go

fig = make_subplots(
    rows=2, cols=2,
    specs=[[{'type': 'scatter'}, {'type': 'histogram'}],
           [{'type': 'box'}, {'type': 'heatmap'}]]
)

# Add traces with interactivity
fig.add_trace(go.Scatter(x=df['x'], y=df['y'], mode='markers',
                         customdata=df['id'],
                         hovertemplate='ID: %{customdata}<br>X: %{x}<br>Y: %{y}'),
              row=1, col=1)

# Add filters
fig.update_layout(
    updatemenus=[{
        'buttons': [
            {'label': 'All', 'method': 'update', 'args': [{'visible': [True]*4}]},
            {'label': 'Group A', 'method': 'update', 'args': [{'visible': [True, False, True, False]}]},
        ]
    }]
)

fig.write_html('dashboard.html')
```

## トラブルシューティング

### フォントが見つからない
```python
import matplotlib.font_manager as fm

# 利用可能フォント確認
available_fonts = [f.name for f in fm.fontManager.ttflist]

# フォント指定
plt.rcParams['font.family'] = 'DejaVu Sans'  # フォールバック
```

### メモリ不足（大規模データ）
```python
# データサンプリング
sample = df.sample(n=10000)

# または binning
sns.histplot(data=df, x='value', bins=100)  # 明示的なビン数
```

### PDFが大きすぎる
```python
# 画像のダウンサンプリング
plt.savefig('figure.pdf', dpi=150, optimize=True)

# または PNG で TIFF 代替
plt.savefig('figure.png', dpi=300)
```

## ベストプラクティス

1. **可視化の原則**
   - データインク比を最大化
   - チャートジャンクを排除
   - 適切なアスペクト比

2. **アクセシビリティ**
   - カラーブラインドセーフパレット使用
   - 十分なコントラスト
   - パターン/形状での補強

3. **再現性**
   - スタイル設定をコード化
   - 乱数シード固定
   - ランダム要素の記録

4. **効率性**
   - ベクター形式を優先
   - 適切な解像度選択
   - 不要な要素を削除

## リファレンス

### matplotlib_guide.md
matplotlibの完全なAPIリファレンス、カスタマイズオプション。

### seaborn_guide.md
seabornの統計可視化機能、プロットタイプ一覧。

### plotly_guide.md
plotlyのインタラクティブ機能、ダッシュボード構築。

### publication_styles.md
各ジャーナルの詳細要件、テンプレートファイル。

### colorblind_palettes.md
カラーブラインド対応パレットの詳細、検証方法。
