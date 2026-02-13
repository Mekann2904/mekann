---
name: research-simulation
description: シミュレーション・最適化の統合ツールキット。離散イベントシミュレーション、多目的最適化、記号計算を統合。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - simpy
    - pymoo
    - sympy
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research Simulation

> **統合スキル:** このスキルは simpy, pymoo, sympy を統合したものです。

## 概要

シミュレーション・最適化の統合ツールキット。離散イベントシミュレーション、多目的最適化、記号計算を提供。

**主な機能:**
- SimPy: 離散イベントシミュレーション
- PyMOO: 多目的最適化（NSGA-II, NSGA-III）
- SymPy: 記号計算・数式処理

## セットアップ

```bash
# シミュレーション
uv pip install simpy

# 最適化
uv pip install pymoo

# 記号計算
uv pip install sympy

# 数値計算
uv pip install numpy scipy
```

## 使用タイミング

| タスク | 推奨ツール |
|--------|-----------|
| プロセスシミュレーション | SimPy |
| 多目的最適化 | PyMOO |
| 数式処理 | SymPy |
| 制約充足 | SymPy + PyMOO |

## ワークフロー

### SimPy 離散イベントシミュレーション

```python
import simpy

def car(env, name, charging_duration, driving_duration):
    """電気自動車の充電シミュレーション"""
    while True:
        # 運転
        yield env.timeout(driving_duration)
        print(f"{name} arrives at {env.now}")
        
        # 充電ステーションで待機
        with charging_station.request() as request:
            yield request
            print(f"{name} starts charging at {env.now}")
            yield env.timeout(charging_duration)
            print(f"{name} leaves at {env.now}")

# 環境作成
env = simpy.Environment()
charging_station = simpy.Resource(env, capacity=2)

# 車を追加
env.process(car(env, "Car 1", 5, 10))
env.process(car(env, "Car 2", 3, 8))
env.process(car(env, "Car 3", 4, 12))

# シミュレーション実行
env.run(until=50)
```

### PyMOO 多目的最適化

```python
import numpy as np
from pymoo.algorithms.moo.nsga2 import NSGA2
from pymoo.core.problem import ElementwiseProblem
from pymoo.optimize import minimize
from pymoo.termination import get_termination

class MyProblem(ElementwiseProblem):
    def __init__(self):
        super().__init__(
            n_var=2,
            n_obj=2,
            n_ieq_constr=2,
            xl=np.array([-2, -2]),
            xu=np.array([2, 2])
        )
    
    def _evaluate(self, x, out, *args, **kwargs):
        # 目的関数
        f1 = x[0]**2 + x[1]**2
        f2 = (x[0] - 1)**2 + (x[1] - 1)**2
        
        # 制約条件
        g1 = 2 * (x[0] - 0.1) * (x[0] - 0.9) / 0.18
        g2 = -20 * (x[0] - 0.4) * (x[0] - 0.6) / 4.8
        
        out["F"] = [f1, f2]
        out["G"] = [g1, g2]

# 最適化実行
problem = MyProblem()
algorithm = NSGA2(pop_size=100)
termination = get_termination("n_gen", 100)

result = minimize(
    problem,
    algorithm,
    termination,
    seed=1,
    verbose=True
)

# パレート最適解
print(f"Best solutions: {result.X}")
print(f"Objective values: {result.F}")
```

### SymPy 記号計算

```python
from sympy import symbols, diff, integrate, solve, simplify
from sympy import sin, cos, exp, log, pi

# 記号定義
x, y, z = symbols('x y z')

# 数式操作
expr = x**2 + 2*x*y + y**2
simplified = simplify(expr)  # (x + y)**2

# 微分
f = x**3 + 2*x**2 + x + 1
df = diff(f, x)  # 3*x**2 + 4*x + 1

# 積分
integral = integrate(f, x)  # x**4/4 + 2*x**3/3 + x**2/2 + x

# 方程式を解く
solutions = solve(x**2 - 4, x)  # [-2, 2]

# 偏微分
g = x**2 * y + y**3
dg_dx = diff(g, x)  # 2*x*y
dg_dy = diff(g, y)  # x**2 + 3*y**2

# 連立方程式
eq1 = x + y - 3
eq2 = x - y - 1
sol = solve([eq1, eq2], [x, y])  # {x: 2, y: 1}

# 行列演算
from sympy import Matrix
A = Matrix([[1, 2], [3, 4]])
B = Matrix([[5, 6], [7, 8]])
C = A * B
det_A = A.det()
inv_A = A.inv()
```

## SimPy コンポーネント

| コンポーネント | 用途 |
|----------------|------|
| Environment | シミュレーション環境 |
| Process | プロセス（ジェネレータ） |
| Resource | リソース（有限容量） |
| Container | 連続量（在庫など） |
| Store | アイテムストア |
| Event | イベント |

## PyMOO アルゴリズム

| アルゴリズム | 特徴 | 推奨用途 |
|--------------|------|----------|
| NSGA-II | 多目的 | 一般的な多目的最適化 |
| NSGA-III | 多目的 | 多数の目的関数 |
| MOEA/D | 分解ベース | 複雑なパレートフロント |
| CMA-ES | 連続最適化 | 単峰性問題 |

## SymPy 機能

| 機能 | 使用例 |
|------|--------|
| 微分 | `diff(f, x)` |
| 積分 | `integrate(f, x)` |
| 極限 | `limit(f, x, 0)` |
| 級数展開 | `series(f, x, 0, 5)` |
| 方程式 | `solve(eq, x)` |
| 行列 | `Matrix([...])` |
| 簡略化 | `simplify(expr)` |
| 因数分解 | `factor(expr)` |

## ベストプラクティス

### SimPy

1. **プロセスをジェネレータで定義**: `yield`でイベントを待機
2. **リソースの容量設定**: 適切な`capacity`を指定
3. **モニタリング**: カスタム監視プロセスを追加

### PyMOO

1. **問題定義を明確に**: 変数・目的・制約の範囲
2. **適切な終了条件**: 世代数または収束判定
3. **パレートフロントの可視化**: 結果の解釈に重要

### SymPy

1. **記号の事前定義**: `symbols()`で明示的に
2. **簡略化の活用**: `simplify()`, `expand()`
3. **数値への変換**: `subs()`, `evalf()`

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| シミュレーションが進まない | デッドロック | リソース容量確認 |
| 最適化が収束しない | パラメータ不適切 | pop_size, n_gen調整 |
| 数式が複雑すぎる | 自動簡略化の限界 | 手動で段階的に |
| 数値評価エラー | 記号が残っている | subs()で置換 |

## 関連スキル

- [research-statistics](../research-statistics/): 統計分析
- [research-ml-classical](../research-ml-classical/): 機械学習
- [research-hypothesis](../research-hypothesis/): 仮説生成

---

*このスキルはシミュレーション・最適化の統合ツールキットを提供します。*
*統合元: simpy, pymoo, sympy*
