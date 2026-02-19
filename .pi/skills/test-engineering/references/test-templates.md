# テストテンプレート集

テストエンジニアリングスキルで使用するテンプレート集。

## 単体テスト

### AAA構造（基本）

```typescript
describe('ClassName', () => {
  describe('methodName', () => {
    test('should return expected value for valid input', () => {
      // Arrange（準備）
      const input = 'valid-input';
      const expected = 'expected-output';
      const sut = new ClassName();

      // Act（実行）
      const actual = sut.methodName(input);

      // Assert（確認）
      expect(actual).toBe(expected);
    });

    test('should throw error for invalid input', () => {
      // Arrange
      const input = null;
      const sut = new ClassName();

      // Act & Assert
      expect(() => sut.methodName(input)).toThrow(ValidationError);
    });
  });
});
```

### Given-When-Then（BDD）

```typescript
describe('ShoppingCart', () => {
  describe('addItem', () => {
    test('should add item to empty cart', () => {
      // Given（前提条件）
      const cart = new ShoppingCart();
      const item = new Item('SKU001', 'Product', 1000);

      // When（実行条件）
      cart.addItem(item);

      // Then（期待結果）
      expect(cart.items).toHaveLength(1);
      expect(cart.total).toBe(1000);
    });
  });
});
```

### モック/スタブ使用例

```typescript
describe('UserService', () => {
  let sut: UserService;
  let mockRepository: jest.Mocked<UserRepository>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Stub（固定応答）
    mockRepository = {
      findById: jest.fn().mockResolvedValue({ id: '1', name: 'Test User' }),
      save: jest.fn().mockResolvedValue(true),
    } as any;

    // Spy（呼び出し記録）
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
    } as any;

    sut = new UserService(mockRepository, mockLogger);
  });

  test('should return user when found', async () => {
    // Act
    const result = await sut.getUser('1');

    // Assert
    expect(result).toEqual({ id: '1', name: 'Test User' });
    expect(mockRepository.findById).toHaveBeenCalledWith('1');
  });

  test('should log error when user not found', async () => {
    // Arrange
    mockRepository.findById.mockResolvedValue(null);

    // Act
    await sut.getUser('999');

    // Assert
    expect(mockLogger.error).toHaveBeenCalledWith('User not found: 999');
  });
});
```

## プロパティベーステスト

### 基本パターン

```typescript
import fc from 'fast-check';

describe('MathUtils', () => {
  describe('abs', () => {
    test('should always return non-negative value', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return Math.abs(n) >= 0;
        })
      );
    });

    test('should be idempotent', () => {
      fc.assert(
        fc.property(fc.integer(), (n) => {
          return Math.abs(Math.abs(n)) === Math.abs(n);
        })
      );
    });
  });

  describe('sort', () => {
    test('should preserve length', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          return [...arr].sort().length === arr.length;
        })
      );
    });

    test('should be idempotent', () => {
      fc.assert(
        fc.property(fc.array(fc.integer()), (arr) => {
          const sorted = [...arr].sort();
          const sortedAgain = [...sorted].sort();
          return JSON.stringify(sorted) === JSON.stringify(sortedAgain);
        })
      );
    });
  });
});
```

### カスタムArbitrary

```typescript
// ユーザーオブジェクトの生成
const userArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  email: fc.string().filter(s => s.includes('@')),
  age: fc.integer({ min: 0, max: 150 }),
  role: fc.constantFrom('admin', 'user', 'guest'),
});

// 状態遷移の生成
const transitionArbitrary = fc.record({
  from: fc.constantFrom('pending', 'active', 'completed'),
  to: fc.constantFrom('active', 'completed', 'cancelled'),
  trigger: fc.string(),
});
```

## モデルベーステスト

### 状態遷移モデル

```typescript
// モデル定義
interface CounterState {
  count: number;
  maxValue: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'reset' };

const counterModel = {
  initialState: { count: 0, maxValue: 100 },

  actions: {
    increment: {
      precondition: (state: CounterState) => state.count < state.maxValue,
      execute: (state: CounterState) => ({ ...state, count: state.count + 1 }),
    },
    decrement: {
      precondition: (state: CounterState) => state.count > 0,
      execute: (state: CounterState) => ({ ...state, count: state.count - 1 }),
    },
    reset: {
      precondition: () => true,
      execute: (state: CounterState) => ({ ...state, count: 0 }),
    },
  },

  invariants: [
    (state: CounterState) => state.count >= 0,
    (state: CounterState) => state.count <= state.maxValue,
  ],
};
```

### テスト実行

```typescript
describe('Counter (Model-Based)', () => {
  test('should maintain invariants for random action sequences', () => {
    const actions = Object.keys(counterModel.actions);
    let state = counterModel.initialState;

    for (let i = 0; i < 1000; i++) {
      const validActions = actions.filter(action =>
        counterModel.actions[action].precondition(state)
      );

      if (validActions.length === 0) break;

      const action = validActions[Math.floor(Math.random() * validActions.length)];
      state = counterModel.actions[action].execute(state);

      // Verify invariants
      counterModel.invariants.forEach(invariant => {
        expect(invariant(state)).toBe(true);
      });
    }
  });
});
```

## 統合テスト

### データベース統合

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

describe('UserRepository (Integration)', () => {
  let module: TestingModule;
  let repository: UserRepository;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User]),
      ],
      providers: [UserRepository],
    }).compile();

    repository = module.get(UserRepository);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await repository.clear();
  });

  test('should save and retrieve user', async () => {
    // Arrange
    const user = new User('test@example.com', 'Test User');

    // Act
    await repository.save(user);
    const found = await repository.findByEmail('test@example.com');

    // Assert
    expect(found).toBeDefined();
    expect(found.email).toBe('test@example.com');
  });
});
```

### API統合（Wiremock）

```typescript
import nock from 'nock';

describe('WeatherClient (Integration)', () => {
  const baseUrl = 'https://api.weather.example.com';

  beforeEach(() => {
    nock.cleanAll();
  });

  test('should fetch weather data', async () => {
    // Arrange
    const mockResponse = { temp: 25, condition: 'sunny' };
    nock(baseUrl)
      .get('/v1/weather?lat=35.68&lon=139.69')
      .reply(200, mockResponse);

    const client = new WeatherClient(baseUrl);

    // Act
    const result = await client.fetchWeather(35.68, 139.69);

    // Assert
    expect(result).toEqual(mockResponse);
  });

  test('should handle API errors', async () => {
    // Arrange
    nock(baseUrl)
      .get('/v1/weather')
      .query(true)
      .reply(500, { error: 'Internal Server Error' });

    const client = new WeatherClient(baseUrl);

    // Act & Assert
    await expect(client.fetchWeather(0, 0)).rejects.toThrow(ApiError);
  });
});
```

## 契約テスト

### Consumer Test

```typescript
import { PactV3 } from '@pact-foundation/pact';

const provider = new PactV3({
  consumer: 'UserService',
  provider: 'AuthProvider',
});

describe('Auth API Consumer', () => {
  test('should validate token', async () => {
    await provider
      .given('valid token exists')
      .uponReceiving('a request to validate token')
      .withRequest({
        method: 'GET',
        path: '/validate',
        headers: { Authorization: 'Bearer valid-token' },
      })
      .willRespondWith({
        status: 200,
        body: { valid: true, userId: '123' },
      });

    await provider.executeTest(async (mockServer) => {
      const client = new AuthClient(mockServer.url);
      const result = await client.validateToken('valid-token');

      expect(result).toEqual({ valid: true, userId: '123' });
    });
  });
});
```

### Provider Test

```typescript
import { Verifier } from '@pact-foundation/pact';

describe('Auth API Provider', () => {
  test('should verify consumer contracts', async () => {
    const verifier = new Verifier({
      providerBaseUrl: 'http://localhost:3000',
      pactUrls: ['./pacts/userservice-authprovider.json'],
      stateHandlers: {
        'valid token exists': () => {
          // Setup test state
          tokenStore.add('valid-token', { userId: '123' });
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

## E2Eテスト

### Playwright

```typescript
import { test, expect } from '@playwright/test';

test.describe('Shopping Cart E2E', () => {
  test('should complete checkout flow', async ({ page }) => {
    // Navigate to product page
    await page.goto('/products/SKU001');

    // Add to cart
    await page.click('[data-testid="add-to-cart"]');
    await expect(page.locator('[data-testid="cart-count"]')).toHaveText('1');

    // Go to cart
    await page.click('[data-testid="cart-icon"]');
    await expect(page).toHaveURL('/cart');

    // Proceed to checkout
    await page.click('[data-testid="checkout-button"]');

    // Fill shipping info
    await page.fill('[name="address"]', '123 Test Street');
    await page.fill('[name="city"]', 'Test City');
    await page.click('[data-testid="place-order"]');

    // Verify order confirmation
    await expect(page.locator('[data-testid="order-confirmation"]')).toBeVisible();
  });
});
```

### REST API E2E

```typescript
import request from 'supertest';
import { app } from '../src/app';

describe('API E2E', () => {
  test('should create and retrieve user', async () => {
    // Create user
    const createResponse = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test User' })
      .expect(201);

    const userId = createResponse.body.id;

    // Retrieve user
    const getResponse = await request(app)
      .get(`/api/users/${userId}`)
      .expect(200);

    expect(getResponse.body.email).toBe('test@example.com');
  });
});
```

## 受け入れテスト

### Cucumber/Gherkin

```gherkin
Feature: Shopping Cart

  Scenario: Add item to cart
    Given I am on the product page for "SKU001"
    And the product "SKU001" is in stock
    When I click "Add to Cart"
    Then I should see "1" in the cart counter
    And the cart total should be "1000 yen"

  Scenario: Checkout with empty cart
    Given I have an empty cart
    When I go to the checkout page
    Then I should see "Your cart is empty"
```

### Step Definitions

```typescript
import { Given, When, Then } from '@cucumber/cucumber';

Given('I am on the product page for {string}', async function (sku: string) {
  await this.page.goto(`/products/${sku}`);
});

Given('the product {string} is in stock', async function (sku: string) {
  this.currentProduct = await this.productRepo.findBySku(sku);
  expect(this.currentProduct.inStock).toBe(true);
});

When('I click {string}', async function (buttonText: string) {
  await this.page.click(`text=${buttonText}`);
});

Then('I should see {string} in the cart counter', async function (count: string) {
  const counter = await this.page.textContent('[data-testid="cart-count"]');
  expect(counter).toBe(count);
});

Then('the cart total should be {string}', async function (total: string) {
  const cartTotal = await this.page.textContent('[data-testid="cart-total"]');
  expect(cartTotal).toBe(total);
});
```
