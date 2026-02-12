# Question UI Improvements

## Summary

The Question UI (`question` tool) has been improved to address low adoption and poor user experience.

## Changes Made

### 1. Progress Indicator
- **Before**: Users couldn't tell where they were in multi-question flows
- **After**: Added "Question X / Y" display at the top of each question screen

### 2. Answer Review Screen
- **Before**: Confirmation screen only showed actions (Confirm/Cancel), not actual answers
- **After**: Confirmation screen now displays all Q&A pairs:
  ```
  Q1: Programming Language
     A: TypeScript
  Q2: Framework
     A: React
  ```

### 3. Better Output Format
- **Before**: `"question"="answer"` pairs - unclear for LLMs
- **After**: Structured, human-readable format:
  ```
  ユーザーの回答:
  - Programming Language: TypeScript
  - Framework: React
  - Tests: Yes
  ```

### 4. Improved UX
- Color-coded options (selected items highlighted)
- Scrollable answer list for many questions
- Better navigation hints at the bottom of screens
- Number key shortcuts (1-9) for quick question editing in confirmation

### 5. Better Discovery
- Startup notification now includes usage example: "使用例: \"質問して選択させて\""
- System prompt injection suggests when to use the tool

## Code Changes

### `.pi/extensions/question.ts`

#### Progress Indicator
```typescript
async function askSingleQuestion(
	question: QuestionInfo,
	ctx: any,
	questionIndex: number = 0,
	totalQuestions: number = 1  // NEW parameters
): Promise<Answer | null> {
	// ... in render function:
	if (totalQuestions > 1) {
		const progressText = ` 質問 ${questionIndex + 1} / ${totalQuestions}`;
		add(theme.fg("accent", progressText));
	}
```

#### Answer Review Screen
```typescript
async function showConfirmationScreen(
	questions: QuestionInfo[],
	answers: Answer[],
	ctx: any
): Promise<ConfirmAction> {
	// Now displays actual answers:
	for (let i = startIndex; i < endIndex; i++) {
		const q = questions[i];
		const a = answers[i];
		add(`  Q${i + 1}: ${q.header}`);
		const answerText = a.length > 0 ? a.join(", ") : "(未回答)";
		add(`     A: ${answerText}`);
	}
```

#### Improved Output
```typescript
const summaryLines = [
	"ユーザーの回答:",
	...questions.map((q, i) => {
		const answer = answers[i]!.join(", ");
		return `- ${q.header}: ${answer}`;
	})
];
```

## Usage Examples

To trigger the Question UI, simply ask the AI to ask you:

```
"Ask me which programming language to use"
"Let me select multiple files to review"
"Confirm with me before making changes"
"Ask me about my project preferences"
```

## Expected Impact

1. **Better adoption**: Users can now see their progress and answers, making the tool more trustworthy
2. **Fewer errors**: Answer review prevents accidental submissions
3. **Better LLM understanding**: Structured output helps the AI process user responses correctly
4. **Increased discoverability**: Startup notification shows usage example
