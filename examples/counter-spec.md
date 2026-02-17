# 仕様書: カウンターサービス

## 概要
増分・減分・リセット操作を持つシンプルなカウンター。値は常に非負で、最大値を超えない。

## 状態
- count: 整数（初期値 0）
- max_value: 整数（定数）

## 操作
- increment(): countを1増加（max_value以下の場合のみ）
- decrement(): countを1減少（0より大きい場合のみ）
- reset(): countを0にリセット

## インバリアント
- count >= 0
- count <= max_value
