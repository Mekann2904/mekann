#!/usr/bin/env python3
"""
科学的可視化スクリプト
出版品質の図を作成
"""

import matplotlib.pyplot as plt
import matplotlib as mpl
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import seaborn as sns

# 出版用設定
def setup_publication_style(style: str = "nature"):
    """出版用スタイルを設定"""
    styles = {
        "nature": {
            "font.family": "Arial",
            "font.size": 7,
            "axes.labelsize": 8,
            "axes.titlesize": 9,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
            "legend.fontsize": 7,
            "figure.dpi": 300,
            "savefig.dpi": 300,
            "axes.linewidth": 0.5,
            "lines.linewidth": 1,
            "lines.markersize": 4,
        },
        "science": {
            "font.family": "Arial",
            "font.size": 6,
            "axes.labelsize": 7,
            "axes.titlesize": 8,
            "xtick.labelsize": 6,
            "ytick.labelsize": 6,
            "legend.fontsize": 6,
            "figure.dpi": 300,
            "savefig.dpi": 300,
            "axes.linewidth": 0.5,
        },
        "cell": {
            "font.family": "Arial",
            "font.size": 8,
            "axes.labelsize": 9,
            "axes.titlesize": 10,
            "xtick.labelsize": 8,
            "ytick.labelsize": 8,
            "legend.fontsize": 8,
            "figure.dpi": 300,
            "savefig.dpi": 300,
        }
    }
    
    plt.rcParams.update(styles.get(style, styles["nature"]))
    return plt


class ScientificFigure:
    """科学的図の作成クラス"""
    
    def __init__(self, style: str = "nature", figsize: Tuple[float, float] = (3.5, 3)):
        self.style = style
        setup_publication_style(style)
        self.fig, self.ax = plt.subplots(figsize=figsize)
    
    def bar_plot(self, data: pd.DataFrame, x: str, y: str, 
                 hue: Optional[str] = None, 
                 error_bars: Optional[str] = "sd",
                 palette: str = "Set2",
                 show_significance: bool = True,
                 significance_pairs: Optional[List[Tuple]] = None):
        """バープロット"""
        
        # 平均とエラーバーの計算
        if hue:
            grouped = data.groupby([x, hue])[y].agg(['mean', 'std', 'count']).reset_index()
        else:
            grouped = data.groupby(x)[y].agg(['mean', 'std', 'count']).reset_index()
        
        # プロット
        if hue:
            sns.barplot(data=data, x=x, y=y, hue=hue, ax=self.ax, 
                       palette=palette, capsize=0.1, errwidth=1)
        else:
            sns.barplot(data=data, x=x, y=y, ax=self.ax, 
                       palette=palette, capsize=0.1, errwidth=1)
        
        # 有意差表示
        if show_significance and significance_pairs:
            self._add_significance_bars(significance_pairs, data, x, y)
        
        return self
    
    def line_plot(self, data: pd.DataFrame, x: str, y: str,
                  hue: Optional[str] = None,
                  style: Optional[str] = None,
                  show_ci: bool = True,
                  markers: bool = True):
        """ラインプロット"""
        
        sns.lineplot(data=data, x=x, y=y, hue=hue, style=style,
                    ax=self.ax, markers=markers, 
                    ci=95 if show_ci else None,
                    linewidth=1.5, markersize=4)
        
        return self
    
    def scatter_plot(self, data: pd.DataFrame, x: str, y: str,
                     hue: Optional[str] = None,
                     size: Optional[str] = None,
                     show_regression: bool = True,
                     show_correlation: bool = True):
        """散布図"""
        
        sns.scatterplot(data=data, x=x, y=y, hue=hue, size=size,
                       ax=self.ax, alpha=0.7, s=20)
        
        # 回帰線
        if show_regression:
            sns.regplot(data=data, x=x, y=y, ax=self.ax, 
                       scatter=False, color='gray', line_kws={'linewidth': 1})
        
        # 相関係数表示
        if show_correlation:
            from scipy import stats
            r, p = stats.pearsonr(data[x], data[y])
            self.ax.text(0.05, 0.95, f'r = {r:.3f}\np = {p:.4f}',
                        transform=self.ax.transAxes, fontsize=7,
                        verticalalignment='top')
        
        return self
    
    def heatmap(self, data: pd.DataFrame,
                cmap: str = "RdBu_r",
                show_values: bool = True,
                fmt: str = ".2f",
                center: float = 0):
        """ヒートマップ"""
        
        sns.heatmap(data, ax=self.ax, cmap=cmap, center=center,
                   annot=show_values, fmt=fmt,
                   linewidths=0.5, cbar_kws={'shrink': 0.8})
        
        return self
    
    def violin_plot(self, data: pd.DataFrame, x: str, y: str,
                    hue: Optional[str] = None,
                    split: bool = False,
                    inner: str = "box"):
        """バイオリンプロット"""
        
        sns.violinplot(data=data, x=x, y=y, hue=hue,
                      ax=self.ax, split=split, inner=inner,
                      linewidth=0.5)
        
        return self
    
    def _add_significance_bars(self, pairs: List[Tuple], 
                               data: pd.DataFrame, 
                               x_col: str, y_col: str):
        """有意差バーを追加"""
        from scipy import stats
        
        y_max = data[y_col].max()
        bar_height = y_max * 0.05
        
        for i, (g1, g2) in enumerate(pairs):
            d1 = data[data[x_col] == g1][y_col]
            d2 = data[data[x_col] == g2][y_col]
            
            _, p = stats.ttest_ind(d1, d2)
            
            if p < 0.001:
                sig = '***'
            elif p < 0.01:
                sig = '**'
            elif p < 0.05:
                sig = '*'
            else:
                sig = 'ns'
            
            y_pos = y_max + bar_height * (i + 1) * 1.5
            
            # バー描画
            self.ax.plot([g1, g1, g2, g2], 
                        [y_pos, y_pos + bar_height/2, y_pos + bar_height/2, y_pos],
                        color='black', linewidth=0.5)
            
            self.ax.text((list(data[x_col].unique()).index(g1) + 
                         list(data[x_col].unique()).index(g2)) / 2,
                        y_pos + bar_height, sig, ha='center', fontsize=7)
    
    def set_labels(self, xlabel: str = "", ylabel: str = "", title: str = ""):
        """ラベル設定"""
        self.ax.set_xlabel(xlabel)
        self.ax.set_ylabel(ylabel)
        if title:
            self.ax.set_title(title)
        return self
    
    def add_scale_bar(self, x_size: float, y_size: float, 
                      x_label: str = "", y_label: str = ""):
        """スケールバーを追加"""
        # 右下にスケールバー
        xlim = self.ax.get_xlim()
        ylim = self.ax.get_ylim()
        
        if x_size:
            self.ax.plot([xlim[1] - x_size*1.5, xlim[1] - x_size*0.5],
                        [ylim[0] + y_size*0.5, ylim[0] + y_size*0.5],
                        'k-', linewidth=2)
            self.ax.text(xlim[1] - x_size, ylim[0] + y_size*0.8, x_label,
                        ha='center', fontsize=6)
        
        if y_size:
            self.ax.plot([xlim[1] - x_size*0.3, xlim[1] - x_size*0.3],
                        [ylim[0] + y_size*0.5, ylim[0] + y_size*1.5],
                        'k-', linewidth=2)
        
        return self
    
    def save(self, filename: str, formats: List[str] = ["pdf", "png"]):
        """保存"""
        for fmt in formats:
            self.fig.savefig(f"{filename}.{fmt}", bbox_inches='tight', 
                           dpi=300, transparent=True)
        return self
    
    def show(self):
        """表示"""
        plt.tight_layout()
        plt.show()
        return self


# カラーパレット（色覚異常対応）
colorblind_palette = [
    '#0072B2',  # 青
    '#009E73',  # 緑
    '#D55E00',  # オレンジ
    '#CC79A7',  # ピンク
    '#F0E442',  # 黄
    '#56B4E9',  # 水色
]


if __name__ == "__main__":
    # 使用例
    np.random.seed(42)
    
    # サンプルデータ
    data = pd.DataFrame({
        'group': ['A'] * 30 + ['B'] * 30 + ['C'] * 30,
        'value': np.concatenate([
            np.random.normal(100, 15, 30),
            np.random.normal(115, 15, 30),
            np.random.normal(108, 15, 30)
        ])
    })
    
    # 図の作成
    fig = ScientificFigure(style="nature", figsize=(3, 3))
    fig.bar_plot(data, x='group', y='value',
                significance_pairs=[('A', 'B'), ('A', 'C')])
    fig.set_labels(xlabel='Group', ylabel='Value (units)')
    fig.save('figure1')
    fig.show()
