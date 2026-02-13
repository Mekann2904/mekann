---
name: research-statistics
description: 統合統計分析システム。頻度論的統計（検定選択、回帰分析、時系列）、ベイズ推論（MCMC、階層モデル）、生存分析（Cox、RSF）、APA形式報告を統合。データに適した手法の選択、仮定チェック、効果量計算、不確実性の定量化まで、学術研究に必要な統計分析を包括的にサポート。
allowed-tools: [Read, Write, Edit, Bash]
license: MIT license
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Statistics

> **統合スキル:** このスキルは statistical-analysis, statsmodels, pymc, scikit-survival を統合したものです。

## 概要

研究データの統計分析を包括的にサポートする統合スキル。検定選択から結果報告まで、頻度論的統計とベイズ統計の両方に対応し、生存分析や時系列分析などの専門的分析も含みます。APA形式での結果報告と再現性の確保を重視。

### 統合されたスキル

| 元スキル | 機能 |
|----------|------|
| statistical-analysis | 検定選択ガイド、仮定チェック、APA報告 |
| statsmodels | 回帰分析、時系列、計量経済モデル |
| pymc | ベイズモデリング、MCMC、階層モデル |
| scikit-survival | 生存分析、Cox比例ハザード、RSF |

## 使用タイミング

以下の場合に使用:
- 統計的仮説検定の実施
- 回帰分析または相関分析
- ベイズ統計分析と不確実性の定量化
- 生存分析または時間対イベント分析
- 時系列分析と予測
- 効果量の計算と検定力分析
- APA形式での統計結果の報告
- 統計的仮定の確認と診断

## 分析パラダイム選択

```
統計分析フロー:
├── 頻度論的アプローチ
│   ├── 仮説検定（t検定、ANOVA、カイ二乗）
│   ├── 回帰分析（OLS、GLM、混合効果）
│   └── 時系列分析（ARIMA、状態空間）
│
├── ベイズアプローチ
│   ├── 事後分布推定（MCMC、VI）
│   ├── 階層モデル
│   └── モデル比較（LOO、WAIC）
│
└── 生存分析
    ├── ノンパラメトリック（Kaplan-Meier）
    ├── セミパラメトリック（Cox）
    └── 機械学習（RSF、GBSA）
```

## ワークフロー

### ステップ1: 検定・手法の選択

```python
def select_statistical_test(data_type, research_question, groups, paired=False):
    """
    データ特性に基づいて適切な統計検定を選択

    Args:
        data_type: "continuous", "ordinal", "nominal"
        research_question: "difference", "relationship", "prediction"
        groups: グループ数
        paired: 対応のあるデータかどうか

    Returns:
        推奨される検定とその前提条件
    """
    tests = {
        ("continuous", "difference", 2, True): "Paired t-test / Wilcoxon signed-rank",
        ("continuous", "difference", 2, False): "Independent t-test / Mann-Whitney U",
        ("continuous", "difference", "3+", True): "Repeated measures ANOVA / Friedman",
        ("continuous", "difference", "3+", False): "One-way ANOVA / Kruskal-Wallis",
        ("continuous", "relationship", 2, False): "Pearson / Spearman correlation",
        ("nominal", "relationship", "2+", False): "Chi-square test / Fisher's exact",
        ("continuous", "prediction", "N/A", False): "Linear regression",
    }

    return tests.get((data_type, research_question, groups, paired), "Consult statistician")
```

### ステップ2: 頻度論的統計（statsmodels）

#### 線形回帰

```python
import statsmodels.api as sm
import statsmodels.formula.api as smf

# OLS回帰
model = smf.ols('outcome ~ predictor1 + predictor2 + C(category)', data=df)
results = model.fit()

# 結果サマリー
print(results.summary())

# 診断プロット
sm.graphics.plot_regress_exog(results, 'predictor1')
sm.graphics.qqplot(results.resid, line='45')
```

#### 一般化線形モデル

```python
# ロジスティック回帰
logit_model = smf.logit('binary_outcome ~ x1 + x2', data=df)
logit_results = logit_model.fit()

# ポアソン回帰
poisson_model = smf.poisson('count ~ x1 + x2', data=df)
poisson_results = poisson_model.fit()

# 負の二項回帰（過分散対応）
nb_model = smf.negativebinomial('count ~ x1 + x2', data=df)
nb_results = nb_model.fit()
```

#### 混合効果モデル

```python
import statsmodels.regression.mixed_linear_model as mlm

# ランダム切片モデル
model = mlm.MixedLM.from_formula(
    'outcome ~ predictor',
    groups='subject_id',
    data=df
)
results = model.fit()

# ランダム切片・ランダム傾きモデル
model = mlm.MixedLM.from_formula(
    'outcome ~ time * treatment',
    groups='subject_id',
    re_formula='1 + time',
    data=df
)
results = model.fit()
```

#### 時系列分析

```python
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX

# ARIMA モデル
model = ARIMA(timeseries, order=(1, 1, 1))
results = model.fit()

# SARIMA（季節付き）
model = SARIMAX(timeseries, order=(1, 1, 1), seasonal_order=(1, 1, 1, 12))
results = model.fit()

# 予測
forecast = results.forecast(steps=12)
```

### ステップ3: ベイズ統計（PyMC）

#### 基本的なベイズ回帰

```python
import pymc as pm
import arviz as az

with pm.Model() as bayesian_regression:
    # 事前分布
    intercept = pm.Normal('intercept', mu=0, sigma=10)
    slope = pm.Normal('slope', mu=0, sigma=10)
    sigma = pm.HalfNormal('sigma', sigma=1)

    # 尤度
    mu = intercept + slope * x
    likelihood = pm.Normal('y', mu=mu, sigma=sigma, observed=y)

    # サンプリング
    trace = pm.sample(2000, tune=1000, cores=4)

# 結果の要約
print(az.summary(trace))

# 事後分布の可視化
az.plot_posterior(trace)
```

#### 階層モデル

```python
with pm.Model() as hierarchical_model:
    # ハイパー事前分布
    mu_alpha = pm.Normal('mu_alpha', mu=0, sigma=10)
    sigma_alpha = pm.HalfNormal('sigma_alpha', sigma=5)

    mu_beta = pm.Normal('mu_beta', mu=0, sigma=10)
    sigma_beta = pm.HalfNormal('sigma_beta', sigma=5)

    # グループレベルの事前分布
    alpha = pm.Normal('alpha', mu=mu_alpha, sigma=sigma_alpha, shape=n_groups)
    beta = pm.Normal('beta', mu=mu_beta, sigma=sigma_beta, shape=n_groups)

    # モデル
    mu = alpha[group_idx] + beta[group_idx] * x
    sigma = pm.HalfNormal('sigma', sigma=1)

    # 尤度
    y_obs = pm.Normal('y_obs', mu=mu, sigma=sigma, observed=y)

    trace = pm.sample(2000, tune=1000, target_accept=0.9)
```

#### モデル比較

```python
# WAIC と LOO-CV
waic = az.waic(trace)
loo = az.loo(trace)

print(f"WAIC: {waic.waic:.2f} (SE: {waic.se:.2f})")
print(f"LOO: {loo.loo:.2f} (SE: {loo.se:.2f})")

# 複数モデルの比較
compare = az.compare({'model1': trace1, 'model2': trace2, 'model3': trace3})
az.plot_compare(compare)
```

### ステップ4: 生存分析（scikit-survival）

#### Kaplan-Meier推定

```python
from sksurv.nonparametric import kaplan_meier_estimator

# Kaplan-Meier曲線
time, survival_prob = kaplan_meier_estimator(
    event_data['event'],
    event_data['time']
)

# 可視化
import matplotlib.pyplot as plt
plt.step(time, survival_prob, where="post")
plt.xlabel('Time')
plt.ylabel('Survival Probability')
```

#### Cox比例ハザードモデル

```python
from sksurv.linear_model import CoxPHSurvivalAnalysis

# データ準備
X = df[['age', 'treatment', 'biomarker']]
y = np.array([(e, t) for e, t in zip(df['event'], df['time'])],
             dtype=[('event', '?'), ('time', '<f8')])

# モデル適合
estimator = CoxPHSurvivalAnalysis()
estimator.fit(X, y)

# ハザード比の解釈
for feature, coef in zip(X.columns, estimator.coef_):
    hr = np.exp(coef)
    print(f"{feature}: HR = {hr:.3f}")
```

#### Random Survival Forest

```python
from sksurv.ensemble import RandomSurvivalForest

# RSF モデル
rsf = RandomSurvivalForest(
    n_estimators=100,
    min_samples_split=10,
    min_samples_leaf=5,
    random_state=42
)
rsf.fit(X_train, y_train)

# 予測
surv_pred = rsf.predict_survival_function(X_test)

# 評価
from sksurv.metrics import concordance_index_censored
c_index = concordance_index_censored(
    y_test['event'],
    y_test['time'],
    rsf.predict(X_test)
)
print(f"C-index: {c_index[0]:.3f}")
```

### ステップ5: APA形式での報告

```python
def report_ttest(t_stat, df, p_value, mean_diff, ci_lower, ci_upper, cohens_d):
    """t検定のAPA形式レポート"""
    return f"""
    An independent-samples t-test was conducted to compare scores between groups.
    There was a {'significant' if p_value < .05 else 'non-significant'} difference
    in scores for Group A (M = {mean_a:.2f}, SD = {sd_a:.2f}) and Group B
    (M = {mean_b:.2f}, SD = {sd_b:.2f}); t({df}) = {t_stat:.2f}, p = {p_value:.3f},
    95% CI [{ci_lower:.2f}, {ci_upper:.2f}], d = {cohens_d:.2f}.
    """

def report_anova(f_stat, df_between, df_within, p_value, eta_squared):
    """一要因ANOVAのAPA形式レポート"""
    return f"""
    A one-way ANOVA was conducted to compare the effect of treatment on outcome.
    There was a {'significant' if p_value < .05 else 'non-significant'} effect of
    treatment on outcome at the p < .05 level for the {df_between + 1} conditions
    [F({df_between}, {df_within}) = {f_stat:.2f}, p = {p_value:.3f}, eta2 = {eta_squared:.2f}].
    """

def report_regression(r_squared, adj_r_squared, f_stat, df_model, df_resid, p_value, coefs):
    """回帰分析のAPA形式レポート"""
    coef_report = "\n".join([
        f"  {name}: B = {coef:.3f}, SE = {se:.3f}, p = {p:.3f}"
        for name, coef, se, p in coefs
    ])
    return f"""
    A multiple regression analysis was conducted to predict outcome from predictors.
    The overall model was {'significant' if p_value < .05 else 'non-significant'},
    F({df_model}, {df_resid}) = {f_stat:.2f}, p = {p_value:.3f},
    R2 = {r_squared:.3f}, Adjusted R2 = {adj_r_squared:.3f}.

    Coefficients:
    {coef_report}
    """
```

## 効果量の計算

```python
import numpy as np

def cohens_d(group1, group2):
    """Cohen's d (標準化平均差)"""
    n1, n2 = len(group1), len(group2)
    var1, var2 = np.var(group1, ddof=1), np.var(group2, ddof=1)

    # プールされた標準偏差
    pooled_std = np.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))

    return (np.mean(group1) - np.mean(group2)) / pooled_std

def eta_squared(ss_between, ss_total):
    """eta-squared (ANOVA効果量)"""
    return ss_between / ss_total

def partial_eta_squared(ss_effect, ss_error, ss_effect_alt=None):
    """Partial eta-squared"""
    if ss_effect_alt is not None:
        return ss_effect / (ss_effect + ss_error + ss_effect_alt)
    return ss_effect / (ss_effect + ss_error)

def cramers_v(chi2, n, k, r):
    """Cramer's V (カイ二乗効果量)"""
    return np.sqrt(chi2 / (n * min(k - 1, r - 1)))

def odds_ratio(a, b, c, d):
    """オッズ比 (2x2分割表)"""
    return (a * d) / (b * c)
```

## 仮定チェック

```python
from scipy import stats
import statsmodels.stats.api as sms

def check_normality(data, alpha=0.05):
    """正規性の検定"""
    shapiro_stat, shapiro_p = stats.shapiro(data)
    dagostino_stat, dagostino_p = stats.normaltest(data)

    return {
        'shapiro': {'statistic': shapiro_stat, 'p_value': shapiro_p},
        'dagostino': {'statistic': dagostino_stat, 'p_value': dagostino_p},
        'normal': shapiro_p > alpha and dagostino_p > alpha
    }

def check_homogeneity(*groups):
    """等分散性の検定 (Levene's test)"""
    levene_stat, levene_p = stats.levene(*groups)
    bartlett_stat, bartlett_p = stats.bartlett(*groups)

    return {
        'levene': {'statistic': levene_stat, 'p_value': levene_p},
        'bartlett': {'statistic': bartlett_stat, 'p_value': bartlett_p},
        'homogeneous': levene_p > 0.05
    }

def check_independence(residuals, lag=1):
    """残差の独立性 (Durbin-Watson)"""
    from statsmodels.stats.stattools import durbin_watson
    dw = durbin_watson(residuals)
    return {'durbin_watson': dw, 'autocorrelation': dw < 1.5 or dw > 2.5}
```

## スクリプト

### test_selector.py
```bash
python scripts/test_selector.py \
    --data-type continuous \
    --groups 3 \
    --research-question difference \
    --paired false
```

### frequentist_analysis.py
```bash
python scripts/frequentist_analysis.py \
    --data data.csv \
    --outcome y \
    --predictors x1,x2,x3 \
    --model ols \
    --output results/
```

### bayesian_analysis.py
```bash
python scripts/bayesian_analysis.py \
    --data data.csv \
    --model hierarchical \
    --samples 4000 \
    --tune 2000 \
    --output trace.nc
```

### survival_analysis.py
```bash
python scripts/survival_analysis.py \
    --data survival.csv \
    --time-col time \
    --event-col event \
    --model cox \
    --covariates age,treatment,biomarker
```

## 他のスキルとの統合

### research-data-analysis
EDAで発見した分布に基づいて適切な統計検定を選択。

### research-visualization
統計結果を出版品質の図（森林プロット、生存曲線）に変換。

### research-writing
統計結果をAPA形式で論文に統合。

### ml-classical
統計検定で特定した重要な特徴量をモデルに使用。

## 使用例

### 完全な分析パイプライン

```python
# 1. データ読み込みとEDA
from research_data_analysis import load_and_explore
df = load_and_explore("data.csv")

# 2. 仮定チェック
assumptions = {
    'normality': check_normality(df['outcome']),
    'homogeneity': check_homogeneity(
        df[df['group'] == 'A']['outcome'],
        df[df['group'] == 'B']['outcome']
    )
}

# 3. 適切な検定選択
if assumptions['normality']['normal'] and assumptions['homogeneity']['homogeneous']:
    # パラメトリック検定
    result = stats.ttest_ind(
        df[df['group'] == 'A']['outcome'],
        df[df['group'] == 'B']['outcome']
    )
else:
    # ノンパラメトリック検定
    result = stats.mannwhitneyu(
        df[df['group'] == 'A']['outcome'],
        df[df['group'] == 'B']['outcome']
    )

# 4. 効果量計算
d = cohens_d(
    df[df['group'] == 'A']['outcome'],
    df[df['group'] == 'B']['outcome']
)

# 5. APA形式レポート
report = report_ttest(
    t_stat=result.statistic,
    df=len(df) - 2,
    p_value=result.pvalue,
    mean_diff=df[df['group'] == 'A']['outcome'].mean() - df[df['group'] == 'B']['outcome'].mean(),
    ci_lower=...,
    ci_upper=...,
    cohens_d=d
)
```

## トラブルシューティング

### MCMCの収束問題
**解決策:** サンプリングパラメータの調整
```python
# より多くのサンプリング
trace = pm.sample(5000, tune=2000, target_accept=0.95)

# 診断
az.plot_trace(trace)
az.plot_energy(trace)
```

### 過分散（GLM）
**解決策:** 擬似R2または負の二項分布
```python
# 過分散の確認
pearson_chi2 = np.sum(results.resid_pearson ** 2)
dispersion = pearson_chi2 / results.df_resid

if dispersion > 1.5:
    # 負の二項モデルへ切り替え
    nb_model = smf.negativebinomial('count ~ x', data=df)
```

### 比例ハザード仮定違反
**解決策:** 時間依存共変量または層化
```python
from lifelines import CoxTimeVaryingFitter

# 時間依存共変量モデル
ctv = CoxTimeVaryingFitter()
ctv.fit(time_varying_df, id_col='id', event_col='event')
```

## ベストプラクティス

1. **分析前の計画**
   - 事前に分析計画を登録
   - 検定の多重比較を考慮

2. **仮定の確認**
   - 正規性、等分散性、独立性
   - 違反時の代替手法検討

3. **効果量の報告**
   - p値だけでなく効果量も
   - 信頼区間の提示

4. **再現性の確保**
   - 乱数シードの設定
   - 分析コードの保存

## リファレンス

### test_selection_guide.md
統計検定選択の完全な決定木フローチャート。

### frequentist_methods.md
OLS、GLM、混合モデル、時系列の詳細。

### bayesian_methods.md
MCMC、階層モデル、モデル比較の詳細。

### survival_methods.md
Cox、RSF、生存曲線推定の詳細。

### apa_reporting.md
APA形式の統計報告の完全ガイド。
