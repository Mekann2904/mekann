---
name: doc-generator
description: APIドキュメント生成スキル。JSDoc/Sphinx/Doxygen/Swagger形式のドキュメントを生成。関数、クラス、APIエンドポイントの説明書きを自動化。コードからの文書化を効率化。
---

# Doc Generator

コードから自動的にドキュメントを生成するスキル。JSDoc、Sphinx、Doxygen、Swagger/OpenAPIなどのフォーマットに対応。

## JSDoc（JavaScript/TypeScript）

### 基本的なコメント形式

```javascript
/**
 * ユーザーを作成する
 * @param {string} name - ユーザー名
 * @param {string} email - メールアドレス
 * @param {number} [age] - 年齢（オプション）
 * @returns {Promise<User>} 作成されたユーザー
 * @throws {ValidationError} 入力値が無効な場合
 * @example
 * const user = await createUser('John', 'john@example.com');
 */
async function createUser(name, email, age) {
  // ...
}
```

### TypeScript型定義

```typescript
/**
 * ユーザー情報を表すインターフェース
 * @interface User
 * @property {string} id - ユーザーID
 * @property {string} name - ユーザー名
 * @property {string} email - メールアドレス
 * @property {Date} [createdAt] - 作成日時
 */
interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: Date;
}
```

### ドキュメント生成

```bash
# インストール
npm install -D jsdoc

# 基本生成
npx jsdoc src/ -d docs/

# テンプレート使用
npm install -D docdash
npx jsdoc src/ -d docs/ -t node_modules/docdash

# 設定ファイル
npx jsdoc -c jsdoc.json
```

## Sphinx（Python）

### docstring形式

```python
def calculate_total(items: list[dict], tax_rate: float = 0.1) -> float:
    """
    商品リストの合計金額を計算する。

    Args:
        items: 商品のリスト。各商品は'name'、'price'、'quantity'キーを持つ辞書。
        tax_rate: 税率。デフォルトは0.1（10%）。

    Returns:
        税込み合計金額。

    Raises:
        ValueError: itemsが空の場合、またはpriceが負の値の場合。

    Example:
        >>> items = [{'name': 'Apple', 'price': 100, 'quantity': 2}]
        >>> calculate_total(items)
        220.0
    """
    pass
```

### Sphinx設定

```bash
# セットアップ
pip install sphinx sphinx-rtd-theme
sphinx-quickstart docs

# 自動ドキュメント生成
sphinx-apidoc -o docs/source src/

# ビルド
cd docs && make html
```

### conf.py設定

```python
extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.napoleon',  # Google/NumPy style docstrings
    'sphinx.ext.viewcode',
]

html_theme = 'sphinx_rtd_theme'
```

## Doxygen（C++/C/Java）

### コメント形式

```cpp
/**
 * @brief データを処理するクラス
 *
 * 詳細な説明をここに記述。
 */
class DataProcessor {
public:
    /**
     * @brief データを変換する
     * @param input 入力データ
     * @param options 変換オプション
     * @return 変換後のデータ
     * @throws std::invalid_argument 入力が無効な場合
     */
    Data transform(const Data& input, const Options& options = {});
};
```

### 設定と生成

```bash
# 設定ファイル生成
doxygen -g Doxyfile

# 設定編集後
doxygen Doxyfile

# 出力先
# html/index.html
```

## OpenAPI/Swagger

### エンドポイント記述

```yaml
openapi: 3.0.0
info:
  title: User API
  version: 1.0.0

paths:
  /users:
    get:
      summary: ユーザー一覧を取得
      operationId: getUsers
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserList'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
```

### 自動生成ツール

```bash
# swagger-jsdoc
npm install swagger-jsdoc swagger-ui-express

# tsoa（TypeScript）
npm install tsoa
npx tsoa spec-and-routes
```

## 自動生成チェックリスト

### 必須要素

- [ ] 関数の目的の説明
- [ ] 全パラメータの説明と型
- [ ] 戻り値の説明
- [ ] 例外・エラー条件
- [ ] 使用例

### 推奨要素

- [ ] パフォーマンス特性
- [ ] スレッドセーフ性
- [ ] 依存関係
- [ ] 非推奨情報（@deprecated）

## ドキュメント品質基準

| 項目 | 基準 |
|------|------|
| 公開API | 100%カバレッジ |
| 内部API | 80%以上 |
| 例の記載 | 主要機能に少なくとも1つ |
| 更新頻度 | コード変更時に同期 |

## CI統合

```yaml
# GitHub Actions例
- name: Generate Docs
  run: npx jsdoc src/ -d docs/

- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    publish_dir: ./docs
```
