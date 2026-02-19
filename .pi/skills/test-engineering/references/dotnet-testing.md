# .NET テストベストプラクティス

Microsoft公式ドキュメント「.NET プロジェクトにおけるユニットテストのベストプラクティス」に基づく実践ガイド。

## ユニットテストの利点

### 1. 機能テストの時間短縮

| 項目 | 機能テスト | ユニットテスト |
|------|-----------|---------------|
| 実行時間 | 数秒〜数分 | ミリ秒単位 |
| 必要な知識 | ドメイン専門知識 | 特別な知識不要 |
| 実行者 | テスト担当者 | テストランナー（自動） |
| 頻度 | 変更のたび | コミットごと・随時 |

### 2. 回帰障害の防止

```
回帰障害: アプリケーション変更時に生じるエラー

ユニットテストの役割:
- ビルドごとにテストスイート全体を再実行
- 新規コードが既存機能を壊していないことを確認
- コードの1行変更後でも検証可能
```

### 3. 実行可能なドキュメント

```
適切に命名されたテストは:

✅ 特定の入力に対する期待される出力を説明
✅ 実際に期待通りに動作することを検証
✅ コードを参照せずに動作を推測可能

例:
Add_EmptyString_ReturnsZero
Add_SingleNumber_ReturnsSameNumber
Add_MultipleNumbers_ReturnsSum
```

### 4. 結合度の低いコード

```
テストを書くことで自然と:

- 結合度が下がる
- テスト容易性が向上
- モジュール性が向上
- API契約が明確化
```

## テスト用語の正確な理解

### フェイク・モック・スタブ

```
┌─────────────────────────────────────────────────────┐
│                    Fake (フェイク)                    │
│         スタブまたはモックの総称                       │
│                                                      │
│  ┌──────────────┐          ┌──────────────┐         │
│  │    Stub      │          │    Mock      │         │
│  │  (スタブ)     │          │  (モック)     │         │
│  │              │          │              │         │
│  │ アサーション  │          │ アサーション  │         │
│  │ なし         │          │ あり         │         │
│  └──────────────┘          └──────────────┘         │
└─────────────────────────────────────────────────────┘
```

### 使用例

```csharp
// スタブとして使用（アサーションなし）
var stubOrder = new FakeOrder();
var purchase = new Purchase(stubOrder);
purchase.ValidateOrders();
Assert.True(purchase.CanBeShipped);  // purchaseを検証

// モックとして使用（アサーションあり）
var mockOrder = new FakeOrder();
var purchase = new Purchase(mockOrder);
purchase.ValidateOrders();
Assert.True(mockOrder.Validated);  // mockOrderを検証
```

### 判断基準

| 項目 | Stub | Mock |
|------|------|------|
| 用途 | 依存関係の代替 | 振る舞いの検証 |
| アサーション | なし | あり |
| テスト対象 | SUTの結果 | Fake自体の状態 |

## シームパターン

### 概要

静的参照（`DateTime.Now`等）をテスト可能にするためのパターン。制御ポイント（シーム）を導入し、テストで制御可能にする。

### 問題のコード

```csharp
public int GetDiscountedPrice(int price)
{
    // DateTime.Now は制御不可
    if (DateTime.Now.DayOfWeek == DayOfWeek.Tuesday)
    {
        return price / 2;
    }
    return price;
}
```

**問題点:**
- テストが実行日時に依存
- 火曜日に実行するとテストが通ったり失敗したりする

### シームパターンの適用

```csharp
// 1. インターフェースを定義
public interface IDateTimeProvider
{
    DayOfWeek DayOfWeek { get; }
}

// 2. 本番実装
public class SystemDateTimeProvider : IDateTimeProvider
{
    public DayOfWeek DayOfWeek => DateTime.Now.DayOfWeek;
}

// 3. テスト可能な実装
public class PriceCalculator
{
    private readonly IDateTimeProvider _dateTimeProvider;

    public PriceCalculator(IDateTimeProvider dateTimeProvider)
    {
        _dateTimeProvider = dateTimeProvider;
    }

    public int GetDiscountedPrice(int price)
    {
        if (_dateTimeProvider.DayOfWeek == DayOfWeek.Tuesday)
        {
            return price / 2;
        }
        return price;
    }
}
```

### テスト

```csharp
[Fact]
public void GetDiscountedPrice_NotTuesday_ReturnsFullPrice()
{
    // Arrange
    var mockProvider = new Mock<IDateTimeProvider>();
    mockProvider.Setup(p => p.DayOfWeek).Returns(DayOfWeek.Monday);
    var calculator = new PriceCalculator(mockProvider.Object);

    // Act
    var actual = calculator.GetDiscountedPrice(2);

    // Assert
    Assert.Equal(2, actual);
}

[Fact]
public void GetDiscountedPrice_OnTuesday_ReturnsHalfPrice()
{
    // Arrange
    var mockProvider = new Mock<IDateTimeProvider>();
    mockProvider.Setup(p => p.DayOfWeek).Returns(DayOfWeek.Tuesday);
    var calculator = new PriceCalculator(mockProvider.Object);

    // Act
    var actual = calculator.GetDiscountedPrice(2);

    // Assert
    Assert.Equal(1, actual);
}
```

### よくあるシーム対象

| 静的参照 | インターフェース | 使用場面 |
|---------|-----------------|---------|
| `DateTime.Now` | `IDateTimeProvider` | 日時に依存するロジック |
| `Guid.NewGuid()` | `IGuidGenerator` | ID生成 |
| `File.ReadAllText` | `IFileReader` | ファイルI/O |
| `HttpClient` | `IHttpClient` | HTTP通信 |
| `ConfigurationManager` | `IConfiguration` | 設定値 |

## xUnit パターン

### パラメータ化テスト

```csharp
// Theory + InlineData
[Theory]
[InlineData("", 0)]
[InlineData("1", 1)]
[InlineData("1,2", 3)]
[InlineData("1,2,3", 6)]
public void Add_MultipleNumbers_ReturnsSum(string input, int expected)
{
    var calculator = new StringCalculator();
    var actual = calculator.Add(input);
    Assert.Equal(expected, actual);
}

// MemberData
public static TheoryData<string, int> TestData =>
    new TheoryData<string, int>
    {
        { "", 0 },
        { "1", 1 },
        { "1,2", 3 },
    };

[Theory]
[MemberData(nameof(TestData))]
public void Add_ReturnsExpectedResult(string input, int expected)
{
    var calculator = new StringCalculator();
    Assert.Equal(expected, calculator.Add(input));
}
```

### フィクスチャの共有

```csharp
// ICollectionFixture で共有リソースを管理
public class DatabaseFixture : IDisposable
{
    public DbContext DbContext { get; }

    public DatabaseFixture()
    {
        DbContext = new InMemoryDbContext();
    }

    public void Dispose()
    {
        DbContext.Dispose();
    }
}

[Collection("Database")]
public class UserRepositoryTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fixture;

    public UserRepositoryTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public void Should_Save_User()
    {
        var repo = new UserRepository(_fixture.DbContext);
        repo.Save(new User { Name = "Test" });
        Assert.Single(repo.GetAll());
    }
}
```

## アサーションパターン

### FluentAssertions

```csharp
using FluentAssertions;

// 基本アサーション
actual.Should().Be(expected);
actual.Should().NotBeNull();
actual.Should().BeTrue();

// コレクション
list.Should().HaveCount(3);
list.Should().Contain(item => item.Id == 1);
list.Should().BeInAscendingOrder(x => x.Name);

// 例外
Action act = () => calculator.Add(null);
act.Should().Throw<ArgumentNullException>();

// 複合条件
user.Should().NotBeNull()
    .And.Subject.As<User>()
    .Name.Should().Be("John");
```

### Moq パターン

```csharp
// 基本セットアップ
var mock = new Mock<IRepository>();
mock.Setup(r => r.FindById(1)).Returns(new User { Id = 1 });

// 引数マッチング
mock.Setup(r => r.FindById(It.IsAny<int>())).Returns(new User());
mock.Setup(r => r.FindById(It.Is<int>(id => id > 0))).Returns(new User());

// メソッド呼び出し検証
mock.Verify(r => r.Save(It.IsAny<User>()), Times.Once);
mock.Verify(r => r.Delete(It.IsAny<int>()), Times.Never);

// プロパティ
mock.Setup(r => r.Connection).Returns("connection-string");
mock.Object.Connection.Should().Be("connection-string");

// 例外を投げる
mock.Setup(r => r.FindById(999)).Throws<NotFoundException>();
```

## テストプロジェクト構成

### 推奨構造

```
src/
├── MyApplication/
│   ├── MyApplication.csproj
│   └── ...
└── MyApplication.Core/
    └── MyApplication.Core.csproj

tests/
├── MyApplication.UnitTests/
│   ├── MyApplication.UnitTests.csproj
│   ├── Services/
│   │   └── PriceCalculatorTests.cs
│   └── Models/
│       └── UserTests.cs
├── MyApplication.IntegrationTests/
│   ├── MyApplication.IntegrationTests.csproj
│   └── Repositories/
│       └── UserRepositoryTests.cs
└── MyApplication.ApiTests/
    ├── MyApplication.ApiTests.csproj
    └── Controllers/
        └── UsersControllerTests.cs
```

### プロジェクト参照

```xml
<!-- UnitTests.csproj -->
<ItemGroup>
  <ProjectReference Include="..\..\src\MyApplication\MyApplication.csproj" />
</ItemGroup>

<!-- IntegrationTests.csproj -->
<ItemGroup>
  <ProjectReference Include="..\..\src\MyApplication\MyApplication.csproj" />
  <PackageReference Include="Microsoft.EntityFrameworkCore.InMemory" />
  <PackageReference Include="Testcontainers" />
</ItemGroup>
```

## チェックリスト

### テスト作成時

- [ ] 命名規則 `[メソッド]_[シナリオ]_[期待動作]` に従っているか
- [ ] AAA パターン（Arrange-Act-Assert）を使用しているか
- [ ] インフラ依存を排除しているか
- [ ] 最小限の入力データを使用しているか
- [ ] マジックストリングを避けているか
- [ ] テスト内にロジック（if/for等）がないか
- [ ] 単一 Act タスクにしているか

### テスト品質

- [ ] テストが高速（ミリ秒単位）に実行されるか
- [ ] テストが独立して実行可能か
- [ ] テスト結果が再現可能か
- [ ] テストが自動判定可能か
