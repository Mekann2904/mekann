# モッキングパターン

テストダブルの種類と適切な使用パターン。

## テストダブルの種類

| 種類 | 用途 | 状態 | 検証 |
|------|------|------|------|
| **Dummy** | 引数埋め | なし | なし |
| **Stub** | 固定応答 | なし | なし |
| **Spy** | 呼び出し記録 | あり | 後で検証 |
| **Mock** | 期待定義 | あり | 自動検証 |
| **Fake** | 実装簡略版 | あり | 実動作 |

## Dummy Pattern

使用されない引数を埋めるためのオブジェクト。

```typescript
// 引数として必要だが使用されない
test('should process order', () => {
  const dummyLogger = {}; // 使用されない
  const orderProcessor = new OrderProcessor(dummyLogger);

  orderProcessor.process(order); // loggerは使用されない
});
```

## Stub Pattern

事前に定義した固定応答を返す。

```typescript
// 基本スタブ
const stubUserRepo = {
  findById: (id: string) => ({ id, name: 'Test User' }),
  findAll: () => [],
};

// 条件付きスタブ
const stubPaymentGateway = {
  charge: (amount: number) => {
    if (amount > 10000) {
      return { success: false, reason: 'limit_exceeded' };
    }
    return { success: true, transactionId: 'TXN-123' };
  },
};

// 例外を投げるスタブ
const stubFailingRepo = {
  save: () => {
    throw new DatabaseError('Connection refused');
  },
};
```

## Spy Pattern

呼び出しを記録し、後で検証する。

```typescript
// 手動スパイ
class SpyLogger {
  public calls: { method: string; args: any[] }[] = [];

  log(message: string) {
    this.calls.push({ method: 'log', args: [message] });
  }

  error(message: string) {
    this.calls.push({ method: 'error', args: [message] });
  }

  wasErrorCalled(): boolean {
    return this.calls.some(c => c.method === 'error');
  }
}

test('should log error on failure', () => {
  const spyLogger = new SpyLogger();
  const sut = new UserService(spyLogger);

  sut.doSomethingThatFails();

  expect(spyLogger.wasErrorCalled()).toBe(true);
});

// フレームワーク使用（Jest）
test('should call repository', () => {
  const spyRepo = {
    save: jest.fn(),
  };

  sut.addUser({ name: 'Test' });

  expect(spyRepo.save).toHaveBeenCalledWith({ name: 'Test' });
});
```

## Mock Pattern

期待される相互作用を事前に定義し、自動的に検証する。

```typescript
// Jest Mock
const mockRepo = {
  findById: jest.fn().mockResolvedValue({ id: '1', name: 'User' }),
  save: jest.fn().mockResolvedValue(true),
};

test('should update user', async () => {
  mockRepo.findById.mockResolvedValue({ id: '1', name: 'Old Name' });
  mockRepo.save.mockResolvedValue(true);

  await sut.updateUser('1', { name: 'New Name' });

  expect(mockRepo.findById).toHaveBeenCalledWith('1');
  expect(mockRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({ id: '1', name: 'New Name' })
  );
});

// モックのリセット
beforeEach(() => {
  jest.clearAllMocks();
});
```

## Fake Pattern

実際に動作する簡略版の実装。

```typescript
// インメモリリポジトリ（Fake）
class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findAll(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async delete(id: string): Promise<void> {
    this.users.delete(id);
  }

  // テスト用ヘルパー
  clear(): void {
    this.users.clear();
  }

  seed(users: User[]): void {
    users.forEach(u => this.users.set(u.id, u));
  }
}

// 使用例
describe('UserService', () => {
  let fakeRepo: InMemoryUserRepository;
  let sut: UserService;

  beforeEach(() => {
    fakeRepo = new InMemoryUserRepository();
    fakeRepo.seed([{ id: '1', name: 'Existing User' }]);
    sut = new UserService(fakeRepo);
  });

  afterEach(() => {
    fakeRepo.clear();
  });

  test('should find existing user', async () => {
    const user = await sut.getUser('1');
    expect(user?.name).toBe('Existing User');
  });
});
```

## 選択ガイド

### Solitary vs Sociable

```typescript
// Solitary: すべての依存をモック化
test('solitary - all dependencies mocked', () => {
  const mockDb = jest.fn();
  const mockCache = jest.fn();
  const mockLogger = jest.fn();

  const sut = new Service(mockDb, mockCache, mockLogger);
  // 完全に分離されたテスト
});

// Sociable: 実際の依存を使用
test('sociable - real dependencies', () => {
  const realValidator = new Validator();  // 純粋なロジック
  const fakeRepo = new InMemoryRepo();    // DBはFake

  const sut = new Service(realValidator, fakeRepo);
  // より統合されたテスト
});
```

### 判断基準

| 場面 | 推奨アプローチ |
|------|---------------|
| 外部API呼び出し | Stub/Mock（ネットワーク回避） |
| データベース | Fake（インメモリ）またはTestcontainers |
| 複雑なロジック | 実際のクラス（Sociable） |
| 遅い操作 | Stub/Mock |
| 状態を持つ依存 | Fake |
| 呼び出し順序が重要 | Mock |
| 単純な応答のみ必要 | Stub |

## 高度なパターン

### Partial Mock

一部のメソッドのみモック化。

```typescript
// Jest
const service = {
  methodA: jest.fn().mockReturnValue('mocked'),
  methodB: jest.fn().mockImplementation(() => 'real implementation'),
};

// spyOn
const realService = new RealService();
jest.spyOn(realService, 'methodA').mockReturnValue('mocked');
// methodBは本来の実装を使用
```

### Mock Builder

複雑なモックを構築。

```typescript
class MockUserBuilder {
  private user: Partial<User> = {
    id: 'default-id',
    name: 'Default Name',
    email: 'default@example.com',
  };

  withId(id: string): this {
    this.user.id = id;
    return this;
  }

  withName(name: string): this {
    this.user.name = name;
    return this;
  }

  asAdmin(): this {
    this.user.role = 'admin';
    return this;
  }

  build(): User {
    return this.user as User;
  }
}

// 使用
const admin = new MockUserBuilder()
  .withId('admin-1')
  .asAdmin()
  .build();
```

### Verification Patterns

```typescript
// 呼び出し回数
expect(mockFn).toHaveBeenCalledTimes(2);

// 呼び出しなし
expect(mockFn).not.toHaveBeenCalled();

// 特定の引数
expect(mockFn).toHaveBeenCalledWith('exact-arg');

// 部分マッチ
expect(mockFn).toHaveBeenCalledWith(
  expect.objectContaining({ key: 'value' })
);

// カスタムマッチャー
expect(mockFn).toHaveBeenCalledWith(
  expect.stringMatching(/^user-\d+$/)
);

// 呼び出し順序
expect(mockFn.mock.calls).toEqual([
  ['first-call'],
  ['second-call'],
]);
```

## アンチパターン

### 避けるべきこと

```typescript
// ❌ 過度なモック化（実装詳細への依存）
test('bad - testing implementation', () => {
  mockService.internalHelper.mockReturnValue('x');
  // 内部実装をテストしている
});

// ❌ モックの過剰な連鎖
test('bad - mock chain', () => {
  mockA.getB().getC().getD().doSomething();
  // 脆弱なテスト
});

// ❌ テスト対象をモック化
test('bad - mocking SUT', () => {
  const sut = jest.fn();  // テスト対象自体をモック化
});

// ✅ 適切なモック化
test('good - testing behavior', () => {
  mockDependency.process.mockReturnValue(result);
  const output = sut.doSomething(input);
  expect(output).toBe(expectedOutput);
});
```
