---
name: code-transform
description: ASTベースのコード変換スキル。codemod、APIマイグレーション、一括リネーム、パターン置換を実行。大規模コードベースの安全な変更に使用。
---

# Code Transform

AST（抽象構文木）ベースでコードを安全に変換するスキル。大規模なリファクタリングやAPIマイグレーションに使用。

## 基本概念

### なぜASTを使うか

- 正規表現では不十分な構文認識
- 文脈を理解した安全な変換
- 型情報の活用が可能

### 主要ツール

| 言語 | ツール |
|------|--------|
| JavaScript/TypeScript | jscodeshift, ts-morph |
| Python | libcst, Bowler |
| Java | Spoon, Error Prone |
| Go | gopatch |

## jscodeshift（JavaScript/TypeScript）

### インストール

```bash
npm install -g jscodeshift
```

### 基本的なトランスフォーム

```javascript
// transform.js
module.exports = function(fileInfo, api, options) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // 例: var -> const
  root.find(j.VariableDeclaration, { kind: 'var' })
    .forEach(path => {
      path.node.kind = 'const';
    });

  return root.toSource();
};
```

### 実行

```bash
# ドライラン（変更確認）
jscodeshift -t transform.js src/ --dry --print

# 実行
jscodeshift -t transform.js src/

# 特定ファイルのみ
jscodeshift -t transform.js src/**/*.ts
```

### よく使うパターン

#### 関数名の変更

```javascript
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // oldFunction -> newFunction
  root.find(j.Identifier, { name: 'oldFunction' })
    .forEach(path => {
      path.node.name = 'newFunction';
    });

  return root.toSource();
};
```

#### import文の変更

```javascript
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // 古いパスを新しいパスに
  root.find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'old-package')
    .forEach(path => {
      path.node.source.value = 'new-package';
    });

  return root.toSource();
};
```

#### APIの引数変更

```javascript
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // func(a, b) -> func({ a, b })
  root.find(j.CallExpression, { callee: { name: 'func' } })
    .forEach(path => {
      const args = path.node.arguments;
      path.node.arguments = [
        j.objectExpression(
          args.map((arg, i) =>
            j.objectProperty(
              j.identifier(`arg${i + 1}`),
              arg
            )
          )
        )
      ];
    });

  return root.toSource();
};
```

## ts-morph（TypeScript）

### インストール

```bash
npm install ts-morph
```

### 使用例

```typescript
import { Project } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths('src/**/*.ts');

// クラス名の変更
project.getSourceFiles().forEach(sourceFile => {
  sourceFile.getClass('OldClass')?.rename('NewClass');
});

// importの置換
sourceFile.getImportDeclarations().forEach(imp => {
  if (imp.getModuleSpecifierValue() === 'old-module') {
    imp.setModuleSpecifier('new-module');
  }
});

// 保存
project.save();
```

## libcst（Python）

### インストール

```bash
pip install libcst
```

### トランスフォーム例

```python
import libcst as cst

class RenameTransformer(cst.CSTTransformer):
    def leave_Name(self, node: cst.Name) -> cst.Name:
        if node.value == "old_name":
            return node.with_changes(value="new_name")
        return node

# 実行
source = "old_name = 1"
tree = cst.parse_module(source)
modified = tree.visit(RenameTransformer())
print(modified.code)
```

## Bowler（Python）

### Quick & Easyなリファクタリング

```bash
pip install bowler
```

```python
from bowler import Query

# 関数名変更
Query("src/*.py").select_function("old_func").rename("new_func").diff()

# 引数の追加
Query("src/*.py").select_function("target").add_argument("new_arg", "None").execute()
```

## 一括変更テンプレート

### console.log削除

```javascript
// jscodeshift
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  root.find(j.CallExpression)
    .filter(path => {
      const callee = path.node.callee;
      return (
        callee.type === 'MemberExpression' &&
        callee.object.name === 'console' &&
        callee.property.name === 'log'
      );
    })
    .remove();

  return root.toSource();
};
```

### PropTypes -> TypeScript

```javascript
module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // PropTypes削除
  root.find(j.AssignmentExpression, {
    left: { property: { name: 'propTypes' } }
  }).remove();

  return root.toSource();
};
```

## 安全な変換フロー

1. **バックアップ作成**
   ```bash
   git checkout -b refactor/transform-backup
   git add -A && git commit -m "backup before transform"
   ```

2. **ドライラン実行**
   ```bash
   jscodeshift -t transform.js src/ --dry --print > changes.diff
   ```

3. **変更確認**
   ```bash
   git diff --no-index /dev/null changes.diff
   ```

4. **実行**
   ```bash
   jscodeshift -t transform.js src/
   ```

5. **テスト実行**
   ```bash
   npm test
   ```

6. **コミット**
   ```bash
   git add -A && git commit -m "refactor: apply code transform"
   ```

## CI統合

```yaml
- name: Run codemod
  run: |
    jscodeshift -t transforms/api-v2.js src/
    npm test
```
