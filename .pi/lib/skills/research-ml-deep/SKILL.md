---
name: research-ml-deep
description: ディープラーニングの包括的ツールキット。PyTorch Lightning、Transformers、Graph Neural Networksを統合。NLP、CV、グラフ分析に対応。
license: MIT
metadata:
  skill-version: "1.0.0"
  created: "2026-02-13"
  skill-author: "Mekann"
  integrated-from:
    - pytorch-lightning
    - transformers
    - torch_geometric
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# Research ML Deep Learning

> **統合スキル:** このスキルは pytorch-lightning, transformers, torch_geometric を統合したものです。

## 概要

ディープラーニングの包括的ツールキット。PyTorch Lightningによる訓練管理、TransformersによるNLP/CV、PyTorch Geometricによるグラフニューラルネットワークを統合的に提供。

**主な機能:**
- PyTorch Lightning: 訓練ループ抽象化、分散訓練
- Transformers: 事前学習済みモデル（BERT、GPT、ViT等）
- Graph Neural Networks: GCN、GAT、GraphSAGE

## セットアップ

```bash
# PyTorch + Lightning
uv pip install torch pytorch-lightning

# Transformers
uv pip install transformers datasets tokenizers

# Graph Neural Networks
uv pip install torch-geometric

# 追加ユーティリティ
uv pip install wandb tensorboard
```

## 使用タイミング

| タスク | 推奨ツール |
|--------|-----------|
| NLP（分類・生成） | Transformers |
| 画像認識 | Transformers (ViT), Lightning |
| グラフ分析 | PyTorch Geometric |
| カスタムモデル | PyTorch Lightning |
| 分散訓練 | Lightning (DDP, FSDP) |

## ワークフロー

### フェーズ1: PyTorch Lightning モデル定義

```python
import pytorch_lightning as pl
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset

class SimpleClassifier(pl.LightningModule):
    def __init__(self, input_dim, hidden_dim, num_classes, lr=1e-3):
        super().__init__()
        self.save_hyperparameters()
        
        self.model = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, num_classes)
        )
        
    def forward(self, x):
        return self.model(x)
    
    def training_step(self, batch, batch_idx):
        x, y = batch
        logits = self(x)
        loss = F.cross_entropy(logits, y)
        self.log('train_loss', loss)
        return loss
    
    def validation_step(self, batch, batch_idx):
        x, y = batch
        logits = self(x)
        loss = F.cross_entropy(logits, y)
        acc = (logits.argmax(dim=1) == y).float().mean()
        self.log_dict({'val_loss': loss, 'val_acc': acc})
    
    def configure_optimizers(self):
        return torch.optim.Adam(self.parameters(), lr=self.hparams.lr)
```

### フェーズ2: Transformers で NLP

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments

# モデルとトークナイザー
model_name = "bert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

# データのトークナイズ
def tokenize_function(examples):
    return tokenizer(examples["text"], padding="max_length", truncation=True)

tokenized_datasets = dataset.map(tokenize_function, batched=True)

# TrainingArguments
training_args = TrainingArguments(
    output_dir="./results",
    evaluation_strategy="epoch",
    learning_rate=2e-5,
    per_device_train_batch_size=16,
    num_train_epochs=3,
    weight_decay=0.01,
)

# Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_datasets["train"],
    eval_dataset=tokenized_datasets["validation"],
)

trainer.train()
```

### フェーズ3: Graph Neural Networks

```python
import torch_geometric
from torch_geometric.nn import GCNConv, GATConv, SAGEConv
from torch_geometric.data import Data, DataLoader

class GCNClassifier(torch.nn.Module):
    def __init__(self, num_features, hidden_dim, num_classes):
        super().__init__()
        self.conv1 = GCNConv(num_features, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        self.classifier = torch.nn.Linear(hidden_dim, num_classes)
        
    def forward(self, x, edge_index):
        x = self.conv1(x, edge_index).relu()
        x = F.dropout(x, p=0.5, training=self.training)
        x = self.conv2(x, edge_index).relu()
        x = self.classifier(x)
        return x

# グラフデータ
data = Data(
    x=node_features,  # [num_nodes, num_features]
    edge_index=edge_index,  # [2, num_edges]
    y=labels  # [num_nodes]
)
```

### フェーズ4: Lightning + Transformers 統合

```python
from transformers import AutoModel
import pytorch_lightning as pl

class TransformerClassifier(pl.LightningModule):
    def __init__(self, model_name, num_classes, lr=2e-5):
        super().__init__()
        self.save_hyperparameters()
        
        self.transformer = AutoModel.from_pretrained(model_name)
        self.classifier = nn.Linear(self.transformer.config.hidden_size, num_classes)
        
    def forward(self, input_ids, attention_mask):
        outputs = self.transformer(input_ids=input_ids, attention_mask=attention_mask)
        pooled = outputs.last_hidden_state[:, 0]  # [CLS] token
        return self.classifier(pooled)
    
    def training_step(self, batch, batch_idx):
        input_ids = batch['input_ids']
        attention_mask = batch['attention_mask']
        labels = batch['labels']
        
        logits = self(input_ids, attention_mask)
        loss = F.cross_entropy(logits, labels)
        self.log('train_loss', loss)
        return loss
    
    def configure_optimizers(self):
        return torch.optim.AdamW(self.parameters(), lr=self.hparams.lr)
```

## 主要モデル一覧

### NLP モデル

| モデル | 用途 | 特徴 |
|--------|------|------|
| BERT | 分類、NER | 双方向、事前学習済み |
| RoBERTa | 分類 | BERT改良版 |
| GPT-2/3 | 生成 | 左から右への生成 |
| T5 | Seq2Seq | テキスト変換 |
| XLNet | 分類、生成 | 順列言語モデル |

### Vision モデル

| モデル | 用途 | 特徴 |
|--------|------|------|
| ViT | 画像分類 | Transformer版CNN |
| Swin Transformer | 画像分類 | 階層的Transformer |
| DETR | 物体検出 | エンドツーエンド |

### Graph モデル

| モデル | 用途 | 特徴 |
|--------|------|------|
| GCN | ノード分類 | グラフ畳み込み |
| GAT | ノード分類 | 注意機構 |
| GraphSAGE | 大規模グラフ | サンプリングベース |
| GIN | グラフ分類 | 同型性保持 |

## 分散訓練

```python
from pytorch_lightning.strategies import DDPStrategy

trainer = pl.Trainer(
    accelerator="gpu",
    devices=4,
    strategy=DDPStrategy(find_unused_parameters=False),
    precision="16-mixed",  # Mixed precision
    max_epochs=10,
)

trainer.fit(model, train_dataloader, val_dataloader)
```

## ベストプラクティス

### モデル選択

1. **NLP**: BERT系（分類）、GPT系（生成）、T5（Seq2Seq）
2. **Vision**: ResNet（ベースライン）、ViT（高精度）
3. **Graph**: GCN（ベースライン）、GAT（注意機構）

### 訓練設定

1. **学習率**: 1e-5 ~ 1e-3（Transformerは小さく）
2. **バッチサイズ**: GPU メモリに応じて調整
3. **Early Stopping**: 過学習防止

### データ処理

1. **NLP**: 最大長設定、パディング戦略
2. **Vision**: データ拡張、正規化
3. **Graph**: ノード/エッジの前処理

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| CUDA OOM | バッチサイズ過大 | バッチサイズ削減、勾蓄積 |
| 過学習 | データ不足 | ドロップアウト、データ拡張 |
| 収束しない | 学習率不適切 | 学習率スケジューラー |
| 遅い訓練 | CPUボトルネック | DataLoader num_workers調整 |

## 関連スキル

- [research-ml-classical](../research-ml-classical/): クラシックML
- [research-ml-reinforcement](../research-ml-reinforcement/): 強化学習
- [research-visualization](../research-visualization/): 可視化

---

*このスキルはディープラーニングの包括的ツールキットを提供します。*
*統合元: pytorch-lightning, transformers, torch_geometric*
