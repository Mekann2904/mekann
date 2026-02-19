# プロパティベーステストパターン

プロパティベーステストでよく使用されるパターン集。

## 基本プロパティパターン

### 1. 可逆性（Invertibility）

操作を元に戻せることを確認。

```typescript
// エンコード/デコード
fc.assert(fc.property(
  fc.string(),
  (s) => decode(encode(s)) === s
));

// 暗号化/復号化
fc.assert(fc.property(
  fc.string(),
  (s) => decrypt(encrypt(s, key), key) === s
));

// シリアライズ/デシリアライズ
fc.assert(fc.property(
  userArbitrary,
  (user) => JSON.parse(JSON.stringify(user)).toEqual(user)
));

// 圧縮/展開
fc.assert(fc.property(
  fc.uint8Array(),
  (data) => decompress(compress(data)).toEqual(data)
));
```

### 2. 不変条件（Invariants）

操作後も維持される性質。

```typescript
// ソート後の長さは変わらない
fc.assert(fc.property(
  fc.array(fc.integer()),
  (arr) => arr.sort().length === arr.length
));

// フィルタリング後の要素はすべて条件を満たす
fc.assert(fc.property(
  fc.array(fc.integer()),
  (arr) => arr.filter(x => x > 0).every(x => x > 0)
));

// 文字列の長さは非負
fc.assert(fc.property(
  fc.string(),
  (s) => s.length >= 0
));

// 絶対値は非負
fc.assert(fc.property(
  fc.integer(),
  (n) => Math.abs(n) >= 0
));
```

### 3. 冪等性（Idempotency）

複数回実行しても同じ結果。

```typescript
// ソートは冪等
fc.assert(fc.property(
  fc.array(fc.integer()),
  (arr) => {
    const sorted = arr.sort();
    return arr.sort().join() === sorted.join();
  }
));

// 絶対値は冪等
fc.assert(fc.property(
  fc.integer(),
  (n) => Math.abs(Math.abs(n)) === Math.abs(n)
));

// 重複排除は冪等
fc.assert(fc.property(
  fc.array(fc.integer()),
  (arr) => {
    const unique = [...new Set(arr)];
    const uniqueAgain = [...new Set(unique)];
    return unique.length === uniqueAgain.length;
  }
));
```

### 4. 交換法則（Commutativity）

順序に依存しない。

```typescript
// 足し算は交換可能
fc.assert(fc.property(
  fc.integer(),
  fc.integer(),
  (a, b) => a + b === b + a
));

// 掛け算は交換可能
fc.assert(fc.property(
  fc.integer(),
  fc.integer(),
  (a, b) => a * b === b * a
));

// 集合の和は交換可能
fc.assert(fc.property(
  fc.array(fc.integer()),
  fc.array(fc.integer()),
  (a, b) => {
    const unionAB = new Set([...a, ...b]);
    const unionBA = new Set([...b, ...a]);
    return unionAB.size === unionBA.size;
  }
));
```

### 5. 結合法則（Associativity）

グルーピングに依存しない。

```typescript
// 足し算は結合可能
fc.assert(fc.property(
  fc.integer(),
  fc.integer(),
  fc.integer(),
  (a, b, c) => (a + b) + c === a + (b + c)
));

// 掛け算は結合可能
fc.assert(fc.property(
  fc.integer(),
  fc.integer(),
  fc.integer(),
  (a, b, c) => (a * b) * c === a * (b * c)
));
```

### 6. 単位元（Identity）

単位元との演算は値を変えない。

```typescript
// 足し算の単位元は0
fc.assert(fc.property(
  fc.integer(),
  (n) => n + 0 === n && 0 + n === n
));

// 掛け算の単位元は1
fc.assert(fc.property(
  fc.integer(),
  (n) => n * 1 === n && 1 * n === n
));

// 配列結合の単位元は空配列
fc.assert(fc.property(
  fc.array(fc.integer()),
  (arr) => [...arr, ...[]].join() === arr.join()
));
```

### 7. 分配法則（Distributivity）

```typescript
// 掛け算は足し算に対して分配的
fc.assert(fc.property(
  fc.integer(),
  fc.integer(),
  fc.integer(),
  (a, b, c) => a * (b + c) === a * b + a * c
));
```

## ドメイン固有のプロパティ

### データ構造

```typescript
// スタック: LIFO
fc.assert(fc.property(
  fc.array(fc.integer()),
  (items) => {
    const stack = new Stack<number>();
    items.forEach(i => stack.push(i));
    const popped = items.slice().reverse();
    return items.map(() => stack.pop()).toEqual(popped);
  }
));

// キュー: FIFO
fc.assert(fc.property(
  fc.array(fc.integer()),
  (items) => {
    const queue = new Queue<number>();
    items.forEach(i => queue.enqueue(i));
    return items.map(() => queue.dequeue()).toEqual(items);
  }
));

// バイナリツリー: 挿入後、検索で見つかる
fc.assert(fc.property(
  fc.array(fc.integer()),
  (items) => {
    const tree = new BinarySearchTree<number>();
    items.forEach(i => tree.insert(i));
    return items.every(i => tree.contains(i));
  }
));
```

### 文字列処理

```typescript
// 文字列分割と結合
fc.assert(fc.property(
  fc.string(),
  fc.string({ minLength: 1 }),
  (s, sep) => s.split(sep).join(sep) === s
));

// 大文字小文字変換
fc.assert(fc.property(
  fc.string(),
  (s) => s.toUpperCase().toLowerCase() === s.toLowerCase()
));

// トリム
fc.assert(fc.property(
  fc.string(),
  (s) => s.trim().trim() === s.trim()
));
```

### 数値計算

```typescript
// 除算と乗算の関係
fc.assert(fc.property(
  fc.integer({ min: 1 }),
  fc.integer(),
  (a, b) => Math.floor(b / a) * a <= b
));

// モジュロ
fc.assert(fc.property(
  fc.integer(),
  fc.integer({ min: 1 }),
  (a, b) => {
    const mod = a % b;
    return mod >= 0 && mod < b;
  }
));
```

## カスタムArbitrary

### 基本型

```typescript
// 正の整数
const positiveInt = fc.integer({ min: 1 });

// 範囲内の整数
const percentage = fc.integer({ min: 0, max: 100 });

// 空でない文字列
const nonEmptyString = fc.string({ minLength: 1 });

// メール形式
const email = fc.tuple(
  fc.string({ minLength: 1 }),
  fc.string({ minLength: 1 }),
  fc.constantFrom('.com', '.org', '.net')
).map(([local, domain, tld]) => `${local}@${domain}${tld}`);
```

### 複合型

```typescript
// ユーザー
const userArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  email: email,
  age: fc.integer({ min: 0, max: 150 }),
  role: fc.constantFrom('admin', 'user', 'guest'),
  createdAt: fc.date(),
});

// 注文
const orderArbitrary = fc.record({
  id: fc.uuid(),
  userId: fc.uuid(),
  items: fc.array(fc.record({
    productId: fc.uuid(),
    quantity: fc.integer({ min: 1, max: 100 }),
    price: fc.integer({ min: 0, max: 100000 }),
  }), { minLength: 1 }),
  status: fc.constantFrom('pending', 'paid', 'shipped', 'delivered'),
});
```

### 状態遷移

```typescript
// 状態
type State = 'pending' | 'active' | 'completed' | 'cancelled';

// 遷移ルール
const validTransitions: Record<State, State[]> = {
  pending: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// 遷移Arbitrary
const transitionArbitrary = fc.record({
  from: fc.constantFrom(...Object.keys(validTransitions) as State[]),
  to: fc.constantFrom(...Object.keys(validTransitions) as State[]),
}).filter(t => validTransitions[t.from].includes(t.to));
```

## 高度なテクニック

### 状態マシン

```typescript
// ATMステートマシン
type ATMState = {
  balance: number;
  authenticated: boolean;
};

type ATMAction =
  | { type: 'authenticate'; pin: string }
  | { type: 'deposit'; amount: number }
  | { type: 'withdraw'; amount: number }
  | { type: 'logout' };

const atmModel = {
  initialState: { balance: 0, authenticated: false },

  actions: [
    {
      name: 'authenticate',
      arbitrary: fc.record({ type: fc.constant('authenticate'), pin: fc.string() }),
      precondition: (s: ATMState) => !s.authenticated,
      execute: (s: ATMState) => ({ ...s, authenticated: true }),
    },
    {
      name: 'deposit',
      arbitrary: fc.record({ type: fc.constant('deposit'), amount: fc.integer({ min: 1 }) }),
      precondition: (s: ATMState) => s.authenticated,
      execute: (s: ATMState, action: ATMAction & { type: 'deposit' }) =>
        ({ ...s, balance: s.balance + action.amount }),
    },
    {
      name: 'withdraw',
      arbitrary: fc.record({ type: fc.constant('withdraw'), amount: fc.integer({ min: 1 }) }),
      precondition: (s: ATMState, action: ATMAction & { type: 'withdraw' }) =>
        s.authenticated && s.balance >= action.amount,
      execute: (s: ATMState, action: ATMAction & { type: 'withdraw' }) =>
        ({ ...s, balance: s.balance - action.amount }),
    },
  ],

  invariants: [
    (s: ATMState) => s.balance >= 0,
  ],
};
```

### シュリンクの活用

```typescript
// 失敗時の最小ケース特定
fc.assert(
  fc.property(
    fc.array(fc.integer()),
    (arr) => {
      // テスト内容
      const result = complexFunction(arr);
      return result.isValid;
    }
  ),
  {
    // シュリンク設定
    endOnFailure: true,  // 最初の失敗で停止
    verbose: true,       // 詳細ログ
  }
);

// カスタムシュリンカー
const customShrinker = fc.integer().map(
  n => n,
  n => fc.shrink*n.filter(m => m < n)  // より小さい値へシュリンク
);
```

### 並列実行

```typescript
// 並行アクセステスト
fc.assert(
  fc.property(
    fc.array(fc.record({
      thread: fc.integer({ min: 0, max: 3 }),
      action: fc.constantFrom('read', 'write'),
      value: fc.integer(),
    })),
    (operations) => {
      const counter = new ThreadSafeCounter();
      const threads = [];

      // 並列実行をシミュレート
      operations.forEach(op => {
        if (op.action === 'read') {
          threads.push(() => counter.get());
        } else {
          threads.push(() => counter.increment(op.value));
        }
      });

      // すべてのスレッドを実行
      const results = Promise.all(threads.map(t => t()));

      // 不変条件を検証
      expect(counter.get()).toBeGreaterThanOrEqual(0);
    }
  )
);
```

## デバッグテクニック

### 失敗ケースの再現

```typescript
// シードを固定して再現
fc.assert(
  fc.property(
    fc.integer(),
    (n) => n + n === 2 * n
  ),
  { seed: 1234567890, path: '0:1:2:3' }
);

// 失敗ケースを抽出
let failedCase: any;
try {
  fc.assert(fc.property(
    fc.integer(),
    (n) => {
      if (n < 0) {
        failedCase = n;
        return false;
      }
      return true;
    }
  ));
} catch (e) {
  console.log('Failed case:', failedCase);
}
```

### ログ出力

```typescript
fc.assert(
  fc.property(
    userArbitrary,
    (user) => {
      console.log('Testing user:', user);
      const result = processUser(user);
      console.log('Result:', result);
      return result.isValid;
    }
  ),
  { verbose: true }
);
```

## アンチパターン

### 避けるべきこと

```typescript
// ❌ 弱いプロパティ（常に真）
fc.assert(fc.property(
  fc.integer(),
  (n) => n === n || n !== n  // 常に真
));

// ❌ 実装をコピー
fc.assert(fc.property(
  fc.array(fc.integer()),
  (arr) => sort(arr).equals(arr.slice().sort())  // 実装と同じロジック
));

// ❌ 範囲が狭すぎる
fc.assert(fc.property(
  fc.integer({ min: 0, max: 10 }),  // 範囲が狭い
  (n) => n >= 0
));

// ✅ 有意義なプロパティ
fc.assert(fc.property(
  fc.integer(),
  (n) => Math.abs(n) >= 0 && Math.abs(n) <= Math.abs(n) + 1
));
```
