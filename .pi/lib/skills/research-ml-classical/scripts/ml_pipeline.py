#!/usr/bin/env python3
"""
機械学習パイプラインスクリプト
分類・回帰・クラスタリングを統一的に実行
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression, LinearRegression, Ridge, Lasso
from sklearn.svm import SVC, SVR
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, roc_curve
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
import shap
import matplotlib.pyplot as plt
from typing import Dict, List, Tuple, Optional, Union
import warnings
warnings.filterwarnings('ignore')


class MLPipeline:
    """機械学習パイプラインクラス"""
    
    def __init__(self, task: str = "classification", random_state: int = 42):
        """
        Args:
            task: "classification" または "regression"
            random_state: 乱数シード
        """
        self.task = task
        self.random_state = random_state
        self.model = None
        self.scaler = None
        self.label_encoder = None
        self.results = {}
    
    def prepare_data(self, X: pd.DataFrame, y: pd.Series, 
                     test_size: float = 0.2,
                     scale: bool = True) -> Tuple:
        """データの前処理"""
        
        # カテゴリ変数のエンコーディング
        X_processed = X.copy()
        for col in X.select_dtypes(include=['object']).columns:
            le = LabelEncoder()
            X_processed[col] = le.fit_transform(X[col].astype(str))
        
        # ターゲット変数のエンコーディング（分類の場合）
        if self.task == "classification" and y.dtype == 'object':
            self.label_encoder = LabelEncoder()
            y = self.label_encoder.fit_transform(y)
        
        # データ分割
        X_train, X_test, y_train, y_test = train_test_split(
            X_processed, y, test_size=test_size, 
            random_state=self.random_state, stratify=y if self.task == "classification" else None
        )
        
        # スケーリング
        if scale:
            self.scaler = StandardScaler()
            X_train = self.scaler.fit_transform(X_train)
            X_test = self.scaler.transform(X_test)
        
        self.X_train = X_train
        self.X_test = X_test
        self.y_train = y_train
        self.y_test = y_test
        self.feature_names = X.columns.tolist()
        
        return X_train, X_test, y_train, y_test
    
    def train(self, model_name: str = "random_forest", **kwargs):
        """モデルの訓練"""
        
        models = self._get_model(model_name, **kwargs)
        self.model = models[model_name]
        
        self.model.fit(self.X_train, self.y_train)
        
        # 予測
        y_pred = self.model.predict(self.X_test)
        
        if self.task == "classification":
            y_pred_proba = self.model.predict_proba(self.X_test)
            self.results = {
                "y_pred": y_pred,
                "y_pred_proba": y_pred_proba,
                "accuracy": self.model.score(self.X_test, self.y_test),
                "classification_report": classification_report(self.y_test, y_pred),
                "confusion_matrix": confusion_matrix(self.y_test, y_pred)
            }
            
            if len(np.unique(self.y_test)) == 2:
                self.results["roc_auc"] = roc_auc_score(self.y_test, y_pred_proba[:, 1])
        else:
            self.results = {
                "y_pred": y_pred,
                "mse": mean_squared_error(self.y_test, y_pred),
                "rmse": np.sqrt(mean_squared_error(self.y_test, y_pred)),
                "mae": mean_absolute_error(self.y_test, y_pred),
                "r2": r2_score(self.y_test, y_pred)
            }
        
        # 交差検証
        cv_scores = cross_val_score(self.model, self.X_train, self.y_train, cv=5)
        self.results["cv_scores"] = cv_scores
        self.results["cv_mean"] = cv_scores.mean()
        self.results["cv_std"] = cv_scores.std()
        
        return self.results
    
    def _get_model(self, name: str, **kwargs) -> Dict:
        """モデルを取得"""
        
        if self.task == "classification":
            models = {
                "random_forest": RandomForestClassifier(
                    n_estimators=kwargs.get('n_estimators', 100),
                    random_state=self.random_state
                ),
                "logistic_regression": LogisticRegression(
                    max_iter=1000,
                    random_state=self.random_state
                ),
                "gradient_boosting": GradientBoostingClassifier(
                    random_state=self.random_state
                ),
                "svm": SVC(
                    probability=True,
                    random_state=self.random_state
                )
            }
        else:
            models = {
                "random_forest": RandomForestRegressor(
                    n_estimators=kwargs.get('n_estimators', 100),
                    random_state=self.random_state
                ),
                "linear_regression": LinearRegression(),
                "ridge": Ridge(random_state=self.random_state),
                "lasso": Lasso(random_state=self.random_state),
                "svm": SVR()
            }
        
        return models
    
    def hyperparameter_tuning(self, param_grid: Dict, cv: int = 5):
        """ハイパーパラメータチューニング"""
        
        grid_search = GridSearchCV(
            self.model, param_grid, cv=cv, 
            scoring='accuracy' if self.task == "classification" else 'r2',
            n_jobs=-1
        )
        
        grid_search.fit(self.X_train, self.y_train)
        
        self.model = grid_search.best_estimator_
        self.results["best_params"] = grid_search.best_params_
        self.results["best_score"] = grid_search.best_score_
        
        return grid_search.best_params_
    
    def explain(self, plot_type: str = "summary"):
        """SHAPによる説明"""
        
        if self.model is None:
            raise ValueError("モデルが訓練されていません")
        
        # SHAP Explainerの選択
        if hasattr(self.model, 'predict_proba'):
            explainer = shap.TreeExplainer(self.model) if 'Forest' in str(type(self.model)) else shap.KernelExplainer(self.model.predict_proba, self.X_train[:100])
        else:
            explainer = shap.TreeExplainer(self.model) if 'Forest' in str(type(self.model)) else shap.KernelExplainer(self.model.predict, self.X_train[:100])
        
        shap_values = explainer.shap_values(self.X_test[:100])
        
        # プロット
        if plot_type == "summary":
            shap.summary_plot(shap_values, self.X_test[:100], feature_names=self.feature_names)
        elif plot_type == "bar":
            shap.summary_plot(shap_values, self.X_test[:100], feature_names=self.feature_names, plot_type="bar")
        
        return shap_values
    
    def plot_results(self):
        """結果の可視化"""
        
        fig, axes = plt.subplots(1, 2, figsize=(12, 5))
        
        if self.task == "classification":
            # 混同行列
            import seaborn as sns
            cm = self.results["confusion_matrix"]
            sns.heatmap(cm, annot=True, fmt='d', ax=axes[0], cmap='Blues')
            axes[0].set_title('Confusion Matrix')
            axes[0].set_xlabel('Predicted')
            axes[0].set_ylabel('Actual')
            
            # ROC曲線（2クラスの場合）
            if "roc_auc" in self.results:
                fpr, tpr, _ = roc_curve(self.y_test, self.results["y_pred_proba"][:, 1])
                axes[1].plot(fpr, tpr, label=f'AUC = {self.results["roc_auc"]:.3f}')
                axes[1].plot([0, 1], [0, 1], 'k--')
                axes[1].set_xlabel('False Positive Rate')
                axes[1].set_ylabel('True Positive Rate')
                axes[1].set_title('ROC Curve')
                axes[1].legend()
        else:
            # 実測値 vs 予測値
            axes[0].scatter(self.y_test, self.results["y_pred"], alpha=0.5)
            axes[0].plot([self.y_test.min(), self.y_test.max()], 
                        [self.y_test.min(), self.y_test.max()], 'k--')
            axes[0].set_xlabel('Actual')
            axes[0].set_ylabel('Predicted')
            axes[0].set_title(f'Actual vs Predicted (R² = {self.results["r2"]:.3f})')
            
            # 残差プロット
            residuals = self.y_test - self.results["y_pred"]
            axes[1].scatter(self.results["y_pred"], residuals, alpha=0.5)
            axes[1].axhline(y=0, color='k', linestyle='--')
            axes[1].set_xlabel('Predicted')
            axes[1].set_ylabel('Residuals')
            axes[1].set_title('Residual Plot')
        
        plt.tight_layout()
        plt.show()
        
        return fig


if __name__ == "__main__":
    # 使用例
    from sklearn.datasets import make_classification, make_regression
    
    # 分類タスク
    print("=== Classification ===")
    X_clf, y_clf = make_classification(n_samples=500, n_features=10, n_classes=2, random_state=42)
    X_clf = pd.DataFrame(X_clf, columns=[f'feature_{i}' for i in range(10)])
    y_clf = pd.Series(y_clf)
    
    pipeline_clf = MLPipeline(task="classification")
    pipeline_clf.prepare_data(X_clf, y_clf)
    results = pipeline_clf.train("random_forest")
    
    print(f"Accuracy: {results['accuracy']:.3f}")
    print(f"CV Score: {results['cv_mean']:.3f} (+/- {results['cv_std']:.3f})")
    print(f"ROC AUC: {results.get('roc_auc', 'N/A')}")
    
    print("\n=== Regression ===")
    X_reg, y_reg = make_regression(n_samples=500, n_features=10, random_state=42)
    X_reg = pd.DataFrame(X_reg, columns=[f'feature_{i}' for i in range(10)])
    y_reg = pd.Series(y_reg)
    
    pipeline_reg = MLPipeline(task="regression")
    pipeline_reg.prepare_data(X_reg, y_reg)
    results = pipeline_reg.train("random_forest")
    
    print(f"R²: {results['r2']:.3f}")
    print(f"RMSE: {results['rmse']:.3f}")
    print(f"MAE: {results['mae']:.3f}")
