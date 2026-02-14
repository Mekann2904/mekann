#!/usr/bin/env python3
"""
ディープラーニング訓練スクリプト
PyTorch Lightningベースの訓練パイプライン
"""

import torch
import torch.nn as nn
import pytorch_lightning as pl
from torch.utils.data import DataLoader, TensorDataset
from torchmetrics import Accuracy, F1Score
import numpy as np
from typing import Dict, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')


class SimpleClassifier(pl.LightningModule):
    """シンプルな分類モデル"""
    
    def __init__(self, input_dim: int, hidden_dim: int, num_classes: int, lr: float = 1e-3):
        super().__init__()
        self.save_hyperparameters()
        
        self.model = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.BatchNorm1d(hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(hidden_dim // 2, num_classes)
        )
        
        self.accuracy = Accuracy(task="multiclass", num_classes=num_classes)
        self.f1 = F1Score(task="multiclass", num_classes=num_classes)
        self.criterion = nn.CrossEntropyLoss()
    
    def forward(self, x):
        return self.model(x)
    
    def training_step(self, batch, batch_idx):
        x, y = batch
        logits = self(x)
        loss = self.criterion(logits, y)
        
        preds = torch.argmax(logits, dim=1)
        acc = self.accuracy(preds, y)
        
        self.log('train_loss', loss, prog_bar=True)
        self.log('train_acc', acc, prog_bar=True)
        
        return loss
    
    def validation_step(self, batch, batch_idx):
        x, y = batch
        logits = self(x)
        loss = self.criterion(logits, y)
        
        preds = torch.argmax(logits, dim=1)
        acc = self.accuracy(preds, y)
        f1 = self.f1(preds, y)
        
        self.log('val_loss', loss, prog_bar=True)
        self.log('val_acc', acc, prog_bar=True)
        self.log('val_f1', f1, prog_bar=True)
        
        return loss
    
    def test_step(self, batch, batch_idx):
        x, y = batch
        logits = self(x)
        loss = self.criterion(logits, y)
        
        preds = torch.argmax(logits, dim=1)
        acc = self.accuracy(preds, y)
        f1 = self.f1(preds, y)
        
        self.log('test_loss', loss)
        self.log('test_acc', acc)
        self.log('test_f1', f1)
        
        return loss
    
    def configure_optimizers(self):
        optimizer = torch.optim.AdamW(self.parameters(), lr=self.hparams.lr)
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode='min', factor=0.5, patience=5
        )
        return {
            'optimizer': optimizer,
            'lr_scheduler': {
                'scheduler': scheduler,
                'monitor': 'val_loss'
            }
        }


class DeepLearningPipeline:
    """ディープラーニングパイプライン"""
    
    def __init__(self, accelerator: str = "auto", devices: int = 1):
        self.accelerator = accelerator
        self.devices = devices
        self.model = None
        self.trainer = None
    
    def prepare_data(self, X_train: np.ndarray, y_train: np.ndarray,
                     X_val: np.ndarray, y_val: np.ndarray,
                     X_test: np.ndarray, y_test: np.ndarray,
                     batch_size: int = 32) -> Tuple[DataLoader, DataLoader, DataLoader]:
        """データの準備"""
        
        # Tensorに変換
        X_train_t = torch.FloatTensor(X_train)
        y_train_t = torch.LongTensor(y_train)
        X_val_t = torch.FloatTensor(X_val)
        y_val_t = torch.LongTensor(y_val)
        X_test_t = torch.FloatTensor(X_test)
        y_test_t = torch.LongTensor(y_test)
        
        # DataLoaderの作成
        train_loader = DataLoader(
            TensorDataset(X_train_t, y_train_t),
            batch_size=batch_size, shuffle=True, num_workers=0
        )
        val_loader = DataLoader(
            TensorDataset(X_val_t, y_val_t),
            batch_size=batch_size, num_workers=0
        )
        test_loader = DataLoader(
            TensorDataset(X_test_t, y_test_t),
            batch_size=batch_size, num_workers=0
        )
        
        self.train_loader = train_loader
        self.val_loader = val_loader
        self.test_loader = test_loader
        
        return train_loader, val_loader, test_loader
    
    def build_model(self, input_dim: int, hidden_dim: int = 128, 
                    num_classes: int = 2, lr: float = 1e-3):
        """モデルの構築"""
        self.model = SimpleClassifier(
            input_dim=input_dim,
            hidden_dim=hidden_dim,
            num_classes=num_classes,
            lr=lr
        )
        return self.model
    
    def train(self, max_epochs: int = 50, early_stopping: bool = True,
              checkpoint: bool = True):
        """訓練"""
        
        callbacks = []
        
        if early_stopping:
            from pytorch_lightning.callbacks import EarlyStopping
            callbacks.append(EarlyStopping(
                monitor='val_loss', patience=10, mode='min'
            ))
        
        if checkpoint:
            from pytorch_lightning.callbacks import ModelCheckpoint
            callbacks.append(ModelCheckpoint(
                monitor='val_loss', mode='min', save_top_k=1
            ))
        
        self.trainer = pl.Trainer(
            max_epochs=max_epochs,
            accelerator=self.accelerator,
            devices=self.devices,
            callbacks=callbacks,
            logger=pl.loggers.TensorBoardLogger('logs/', name='model'),
            enable_progress_bar=True,
            enable_model_summary=True
        )
        
        self.trainer.fit(self.model, self.train_loader, self.val_loader)
        
        return self.trainer
    
    def test(self):
        """テスト"""
        if self.trainer is None:
            raise ValueError("モデルが訓練されていません")
        
        results = self.trainer.test(self.model, self.test_loader)
        return results[0] if results else None
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """予測"""
        self.model.eval()
        with torch.no_grad():
            X_t = torch.FloatTensor(X)
            if self.accelerator == 'gpu':
                X_t = X_t.cuda()
            logits = self.model(X_t)
            preds = torch.argmax(logits, dim=1)
        return preds.cpu().numpy()


if __name__ == "__main__":
    # 使用例
    from sklearn.datasets import make_classification
    from sklearn.model_selection import train_test_split
    
    # データ準備
    X, y = make_classification(n_samples=1000, n_features=20, n_classes=3, random_state=42)
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.4, random_state=42)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42)
    
    # パイプライン実行
    pipeline = DeepLearningPipeline(accelerator="auto")
    pipeline.prepare_data(X_train, y_train, X_val, y_val, X_test, y_test, batch_size=32)
    pipeline.build_model(input_dim=20, hidden_dim=128, num_classes=3)
    pipeline.train(max_epochs=10, early_stopping=True)
    
    # テスト
    results = pipeline.test()
    print(f"Test Results: {results}")
    
    # 予測
    preds = pipeline.predict(X_test[:10])
    print(f"Predictions: {preds}")
    print(f"Actual: {y_test[:10]}")
