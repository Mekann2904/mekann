#!/usr/bin/env python3
"""
統計分析パイプラインスクリプト
データの統計的検定、モデル構築、結果解釈を自動化
"""

import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, List, Tuple, Optional, Union

class StatisticalAnalyzer:
    """統計分析クラス"""
    
    def __init__(self, alpha: float = 0.05):
        self.alpha = alpha
        self.results = {}
    
    def descriptive_stats(self, data: pd.Series) -> Dict:
        """記述統計"""
        return {
            "n": len(data),
            "mean": data.mean(),
            "std": data.std(),
            "median": data.median(),
            "min": data.min(),
            "max": data.max(),
            "q1": data.quantile(0.25),
            "q3": data.quantile(0.75),
            "skewness": data.skew(),
            "kurtosis": data.kurtosis()
        }
    
    def normality_test(self, data: pd.Series) -> Dict:
        """正規性検定"""
        # Shapiro-Wilk（n < 5000推奨）
        if len(data) < 5000:
            stat, p_sw = stats.shapiro(data)
        else:
            stat, p_sw = None, None
        
        # D'Agostino-Pearson（n >= 20必要）
        if len(data) >= 20:
            stat_dp, p_dp = stats.normaltest(data)
        else:
            stat_dp, p_dp = None, None
        
        # Kolmogorov-Smirnov
        stat_ks, p_ks = stats.kstest(data, 'norm', args=(data.mean(), data.std()))
        
        return {
            "shapiro_wilk": {"statistic": stat, "p_value": p_sw, "normal": p_sw > self.alpha if p_sw else None},
            "dagostino_pearson": {"statistic": stat_dp, "p_value": p_dp, "normal": p_dp > self.alpha if p_dp else None},
            "kolmogorov_smirnov": {"statistic": stat_ks, "p_value": p_ks, "normal": p_ks > self.alpha}
        }
    
    def compare_two_groups(self, group1: pd.Series, group2: pd.Series, 
                           paired: bool = False) -> Dict:
        """2群比較"""
        results = {"test_type": None, "statistic": None, "p_value": None, 
                   "effect_size": None, "interpretation": None}
        
        # 正規性確認
        normal1 = self.normality_test(group1)["shapiro_wilk"]["normal"]
        normal2 = self.normality_test(group2)["shapiro_wilk"]["normal"]
        
        if normal1 and normal2:
            if paired:
                # 対応ありt検定
                stat, p = stats.ttest_rel(group1, group2)
                results["test_type"] = "Paired t-test"
            else:
                # 対応なしt検定（Welchの補正）
                stat, p = stats.ttest_ind(group1, group2, equal_var=False)
                results["test_type"] = "Welch's t-test"
            
            # Cohen's d
            pooled_std = np.sqrt((group1.std()**2 + group2.std()**2) / 2)
            results["effect_size"] = (group1.mean() - group2.mean()) / pooled_std
            results["effect_type"] = "Cohen's d"
        else:
            if paired:
                # Wilcoxon符号付き順位検定
                stat, p = stats.wilcoxon(group1, group2)
                results["test_type"] = "Wilcoxon signed-rank test"
            else:
                # Mann-Whitney U検定
                stat, p = stats.mannwhitneyu(group1, group2, alternative='two-sided')
                results["test_type"] = "Mann-Whitney U test"
            
            # 効果量 r
            n = len(group1) + len(group2)
            results["effect_size"] = stat / (n * (n - 1) / 2) if paired else 1 - (2 * stat) / n
            results["effect_type"] = "rank-biserial r"
        
        results["statistic"] = stat
        results["p_value"] = p
        results["significant"] = p < self.alpha
        
        # 解釈
        if results["effect_size"]:
            if abs(results["effect_size"]) < 0.2:
                results["interpretation"] = "効果量: 小"
            elif abs(results["effect_size"]) < 0.8:
                results["interpretation"] = "効果量: 中"
            else:
                results["interpretation"] = "効果量: 大"
        
        return results
    
    def anova(self, groups: List[pd.Series], post_hoc: bool = True) -> Dict:
        """一元配置分散分析"""
        # 正規性・等分散性確認
        normal_all = all(self.normality_test(g)["shapiro_wilk"]["normal"] for g in groups)
        _, p_levene = stats.levene(*groups)
        equal_var = p_levene > self.alpha
        
        results = {}
        
        if normal_all and equal_var:
            # 通常のANOVA
            stat, p = stats.f_oneway(*groups)
            results["test_type"] = "One-way ANOVA"
        else:
            # Kruskal-Wallis
            stat, p = stats.kruskal(*groups)
            results["test_type"] = "Kruskal-Wallis H-test"
        
        results["statistic"] = stat
        results["p_value"] = p
        results["significant"] = p < self.alpha
        
        # 効果量（η²）
        all_data = pd.concat(groups)
        grand_mean = all_data.mean()
        ss_between = sum(len(g) * (g.mean() - grand_mean)**2 for g in groups)
        ss_total = sum((all_data - grand_mean)**2)
        results["eta_squared"] = ss_between / ss_total
        
        # 事後検定
        if post_hoc and results["significant"]:
            results["post_hoc"] = self._pairwise_comparisons(groups)
        
        return results
    
    def _pairwise_comparisons(self, groups: List[pd.Series]) -> List[Dict]:
        """多重比較（Bonferroni補正）"""
        comparisons = []
        n_comparisons = len(groups) * (len(groups) - 1) / 2
        adjusted_alpha = self.alpha / n_comparisons
        
        for i, g1 in enumerate(groups):
            for j, g2 in enumerate(groups[i+1:], i+1):
                stat, p = stats.ttest_ind(g1, g2)
                comparisons.append({
                    "comparison": f"Group {i} vs Group {j}",
                    "statistic": stat,
                    "p_value": p,
                    "p_adjusted": p * n_comparisons,
                    "significant": p < adjusted_alpha
                })
        
        return comparisons
    
    def correlation(self, x: pd.Series, y: pd.Series, method: str = "auto") -> Dict:
        """相関分析"""
        if method == "auto":
            # 正規性に基づいて自動選択
            normal_x = self.normality_test(x)["shapiro_wilk"]["normal"]
            normal_y = self.normality_test(y)["shapiro_wilk"]["normal"]
            method = "pearson" if (normal_x and normal_y) else "spearman"
        
        if method == "pearson":
            r, p = stats.pearsonr(x, y)
        else:
            r, p = stats.spearmanr(x, y)
        
        # r²（決定係数）
        r_squared = r ** 2
        
        # 信頼区間（Fisher z変換）
        n = len(x)
        z = np.arctanh(r)
        se = 1 / np.sqrt(n - 3)
        z_low = z - 1.96 * se
        z_high = z + 1.96 * se
        ci_low = np.tanh(z_low)
        ci_high = np.tanh(z_high)
        
        # 解釈
        if abs(r) < 0.3:
            interpretation = "弱い相関"
        elif abs(r) < 0.7:
            interpretation = "中程度の相関"
        else:
            interpretation = "強い相関"
        
        return {
            "method": method,
            "r": r,
            "r_squared": r_squared,
            "p_value": p,
            "ci_95": (ci_low, ci_high),
            "significant": p < self.alpha,
            "interpretation": interpretation
        }
    
    def chi_square(self, observed: pd.DataFrame) -> Dict:
        """カイ二乗検定"""
        chi2, p, dof, expected = stats.chi2_contingency(observed)
        
        # Cramer's V
        n = observed.sum().sum()
        min_dim = min(observed.shape) - 1
        cramers_v = np.sqrt(chi2 / (n * min_dim))
        
        return {
            "chi2": chi2,
            "p_value": p,
            "dof": dof,
            "cramers_v": cramers_v,
            "significant": p < self.alpha
        }


def apa_format_result(result: Dict, test_name: str) -> str:
    """APA形式で結果を出力"""
    if "t-test" in test_name.lower():
        return f"t({result.get('df', 'N/A')}) = {result['statistic']:.2f}, p = {result['p_value']:.3f}"
    elif "anova" in test_name.lower():
        return f"F({result.get('df_between', 1)}, {result.get('df_within', 1)}) = {result['statistic']:.2f}, p = {result['p_value']:.3f}, η² = {result.get('eta_squared', 'N/A'):.3f}"
    elif "chi" in test_name.lower():
        return f"χ²({result['dof']}) = {result['chi2']:.2f}, p = {result['p_value']:.3f}, V = {result['cramers_v']:.3f}"
    return ""


if __name__ == "__main__":
    # 使用例
    np.random.seed(42)
    
    # サンプルデータ
    group1 = pd.Series(np.random.normal(100, 15, 30))
    group2 = pd.Series(np.random.normal(110, 15, 30))
    
    analyzer = StatisticalAnalyzer()
    
    # 2群比較
    result = analyzer.compare_two_groups(group1, group2)
    print(f"Test: {result['test_type']}")
    print(f"Statistic: {result['statistic']:.3f}")
    print(f"P-value: {result['p_value']:.4f}")
    print(f"Effect size ({result['effect_type']}): {result['effect_size']:.3f}")
    print(f"Significant: {result['significant']}")
