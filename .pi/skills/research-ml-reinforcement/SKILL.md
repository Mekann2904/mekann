---
name: research-ml-reinforcement
description: 強化学習の統合ツールキット。Stable Baselines3とPufferLibを統合し、標準RLから高性能並列訓練まで対応。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - stable-baselines3
    - pufferlib
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research ML Reinforcement Learning

> **統合スキル:** このスキルは stable-baselines3, pufferlib を統合したものです。

## 概要

強化学習の統合ツールキット。Stable Baselines3による本番対応アルゴリズムと、PufferLibによる高性能並列訓練を提供。

**主な機能:**
- 標準RLアルゴリズム（PPO, SAC, DQN, TD3, DDPG, A2C）
- 高性能並列環境実行
- Gymnasium互換環境
- カスタム環境構築

## セットアップ

```bash
# Stable Baselines3
uv pip install stable-baselines3 gymnasium

# PufferLib（高性能）
uv pip install pufferlib

# 追加環境
uv pip install gymnasium[all] ale-py

# 可視化
uv pip install tensorboard
```

## 使用タイミング

| タスク | 推奨ツール |
|--------|-----------|
| プロトタイピング | Stable Baselines3 |
| 高速訓練 | PufferLib |
| 大規模環境 | PufferLib |
| カスタム環境 | Stable Baselines3 |

## ワークフロー

### フェーズ1: Stable Baselines3 で基本訓練

```python
import gymnasium as gym
from stable_baselines3 import PPO, SAC, DQN, TD3, A2C
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.callbacks import EvalCallback

# 環境作成
env = gym.make("CartPole-v1")

# モデル作成
model = PPO(
    "MlpPolicy",
    env,
    learning_rate=3e-4,
    n_steps=2048,
    batch_size=64,
    n_epochs=10,
    gamma=0.99,
    verbose=1
)

# 評価コールバック
eval_env = gym.make("CartPole-v1")
eval_callback = EvalCallback(
    eval_env,
    best_model_save_path="./logs/best_model/",
    log_path="./logs/results/",
    eval_freq=10000,
    deterministic=True,
    render=False
)

# 訓練
model.learn(total_timesteps=100000, callback=eval_callback)

# 保存
model.save("ppo_cartpole")
```

### フェーズ2: アルゴリズム選択

```python
# 連続アクション空間
env = gym.make("HalfCheetah-v4")

# PPO（汎用）
ppo_model = PPO("MlpPolicy", env, verbose=1)

# SAC（連続制御、高サンプル効率）
sac_model = SAC("MlpPolicy", env, verbose=1)

# TD3（SAC改良版）
td3_model = TD3("MlpPolicy", env, verbose=1)

# 離散アクション空間
env = gym.make("LunarLander-v3")

# DQN（離散）
dqn_model = DQN("MlpPolicy", env, verbose=1)

# A2C（軽量）
a2c_model = A2C("MlpPolicy", env, verbose=1)
```

### フェーズ3: PufferLib で高性能訓練

```python
import pufferlib
import pufferlib.emulation
import pufferlib.vector

# 環境のベクトル化
def make_env():
    env = gym.make("CartPole-v1")
    return env

# 高性能ベクトル環境
vec_env = pufferlib.vector.SyncVectorEnv(
    [make_env for _ in range(16)]
)

# または非同期ベクトル環境
async_vec_env = pufferlib.vector.AsyncVectorEnv(
    [make_env for _ in range(64)]
)

# 並列訓練ループ
obs = vec_env.reset()
for step in range(100000):
    # アクション選択（バッチ処理）
    actions = model.predict(obs)
    
    # ステップ実行（並列）
    obs, rewards, dones, infos = vec_env.step(actions)
```

### フェーズ4: カスタム環境

```python
import gymnasium as gym
from gymnasium import spaces
import numpy as np

class CustomEnv(gym.Env):
    def __init__(self):
        super().__init__()
        
        # アクション空間
        self.action_space = spaces.Discrete(4)
        
        # 観測空間
        self.observation_space = spaces.Box(
            low=0, high=255,
            shape=(84, 84, 3),
            dtype=np.uint8
        )
        
    def reset(self, seed=None, options=None):
        super().reset(seed=seed)
        self.state = np.zeros((84, 84, 3), dtype=np.uint8)
        return self.state, {}
    
    def step(self, action):
        # 環境ロジック
        reward = 0
        terminated = False
        truncated = False
        info = {}
        
        # 状態更新
        # ...
        
        return self.state, reward, terminated, truncated, info

# 登録
from gymnasium.envs.registration import register
register(
    id='CustomEnv-v0',
    entry_point='my_module:CustomEnv',
)
```

## アルゴリズム比較

| アルゴリズム | アクション空間 | 特徴 | 推奨用途 |
|--------------|----------------|------|----------|
| PPO | 連続/離散 | 安定、汎用 | ベースライン |
| SAC | 連続 | 高サンプル効率 | ロボット制御 |
| TD3 | 連続 | SAC改良版 | 連続制御 |
| DQN | 離散 | 経験再生 | Atari |
| A2C | 連続/離散 | 軽量 | プロトタイプ |

## ベストプラクティス

### ハイパーパラメータ

```python
# PPO推奨設定
ppo_config = {
    "learning_rate": 3e-4,
    "n_steps": 2048,
    "batch_size": 64,
    "n_epochs": 10,
    "gamma": 0.99,
    "gae_lambda": 0.95,
    "clip_range": 0.2,
}

# SAC推奨設定
sac_config = {
    "learning_rate": 3e-4,
    "buffer_size": 1000000,
    "learning_starts": 10000,
    "batch_size": 256,
    "tau": 0.005,
    "gamma": 0.99,
}
```

### 並列化戦略

| 環境数 | 推奨方法 |
|--------|----------|
| 1-8 | SyncVectorEnv |
| 8-64 | AsyncVectorEnv |
| 64+ | PufferLib |

### ログと監視

```python
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.logger import configure

# TensorBoard ログ
log_dir = "./logs/"
model = PPO("MlpPolicy", env, tensorboard_log=log_dir)

# カスタムロガー
new_logger = configure(log_dir, ["stdout", "tensorboard"])
model.set_logger(new_logger)
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 学習しない | 報酬設計 | 報酬シェイピング |
| 不安定 | 学習率過大 | 学習率削減 |
| 遅い | 環境実行 | ベクトル化 |
| メモリエラー | バッファサイズ | buffer_size調整 |

## 関連スキル

- [research-ml-classical](../research-ml-classical/): クラシックML
- [research-ml-deep](../research-ml-deep/): ディープラーニング
- [research-simulation](../research-simulation/): シミュレーション

---

*このスキルは強化学習の統合ツールキットを提供します。*
*統合元: stable-baselines3, pufferlib*
