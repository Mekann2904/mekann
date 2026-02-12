# Agent Team Discussion Phase Real-Time View - Research Report

Research Date: 2026-02-12
Researcher: Researcher subagent

---

## 1. Current Output Format Investigation

### 1.1 Structured Output Format

Agent team members output structured text with the following required fields:

```
SUMMARY: <1-line summary>
CLAIM: <1-sentence core claim>
EVIDENCE: <comma-separated evidence with file:line references>
CONFIDENCE: <0.00-1.00>
DISCUSSION: <discussion content when communicationRounds > 0>
RESULT:
<main answer>
NEXT_STEP: <specific next action or none>
```

**Location in code**: `.pi/extensions/agent-teams.ts` lines 2670-2676

### 1.2 DISCUSSION Section Format

The DISCUSSION section is added during communication phases with specific instructions:

**Line 2672-2673**:
```typescript
if (phase === "communication") {
  lines.push("DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（必須）>");
} else {
  lines.push("DISCUSSION: <他のメンバーのoutputを参照し、同意点/不同意点を記述。合意形成時は「合意: [要約]」を明記（コミュニケーションフェーズで必須）>");
}
```

**Example DISCUSSION content** (from run record 20260212-200713-e184bc.json):
```
DISCUSSION:

buildの主張（STABLE_AGENT_TEAM_RUNTIMEフラグをfalseに設定することが最も効果的な改善策）について、同意点と懸念点がある。

【同意点】
- buildの指摘通り、.pi/extensions/agent-teams.ts:181でSTABLE_AGENT_TEAM_RUNTIME = trueに設定されており、これにより1260-1261行のnormalizeCommunicationRounds関数で議論ラウンドが強制的にDEFAULT_COMMUNICATION_ROUNDS（1）に固定されている点は確認済み。

【不同意点・懸念点】
- 単にフラグをfalseにするだけでは不十分と判断する。

reviewの主張（合意形成プロセスの明確化と議論品質の監査フィードバックループの実装）について、同意点がある。

【同意点】
- 議論品質の監査機能は実装されているが、単なる記録に留まっており、これを活用したフィードバックループが必要という点に同意。

【修正提案】
- buildの主張とreviewの主張を統合し、「フラグ無効化」と「フィードバックループ実装」を両立させる改善策を提案する。

合意: 議論促進にはSTABLE_AGENT_TEAM_RUNTIMEフラグの無効化と、既存の監査機能を活用した動的フィードバックループの実装の両方が必要である。
```

### 1.3 Field Extraction Function

**Location**: `.pi/extensions/agent-teams.ts` lines 2463-2466

```typescript
function extractField(output: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = output.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}
```

This function can be used to extract the DISCUSSION section from stdout in real-time.

---

## 2. Current Real-Time Monitoring Implementation

### 2.1 Live Monitor Architecture

**Location**: `.pi/extensions/agent-teams.ts` lines 680-898

The `createAgentTeamLiveMonitor` function creates a real-time TUI overlay with:

**Key interfaces** (lines 196-217):
```typescript
interface TeamLiveItem {
  key: string;
  label: string;
  partners: string[];
  status: TeamLiveStatus;  // "pending" | "running" | "completed" | "failed"
  phase: TeamLivePhase;    // "queued" | "initial" | "communication" | "judge" | "finished"
  phaseRound?: number;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastChunkAtMs?: number;
  lastEventAtMs?: number;
  lastEvent?: string;
  summary?: string;
  error?: string;
  stdoutTail: string;
  stderrTail: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutNewlineCount: number;
  stderrNewlineCount: number;
  stdoutEndsWithNewline: boolean;
  stderrEndsWithNewline: boolean;
  events: string[];
}
```

**Controller methods** (lines 820-897):
```typescript
interface AgentTeamLiveMonitorController {
  markStarted: (itemKey: string) => void;
  markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => void;
  appendEvent: (itemKey: string, event: string) => void;
  appendBroadcastEvent: (event: string) => void;
  appendChunk: (itemKey: string, stream: LiveStreamView, chunk: string) => void;
  markFinished: (itemKey: string, status: "completed" | "failed", summary: string, error?: string) => void;
  close: () => void;
  wait: () => Promise<void>;
}
```

### 2.2 Current View Modes

**Location**: Line 198
```typescript
type LiveViewMode = "list" | "detail";
```

**List View Features** (lines 470-576):
- Shows all team members in a scrollable list
- Inline preview of selected member's output
- Event trace display
- Toggle between stdout/stderr with [tab]

**Detail View Features** (lines 578-677):
- Focused view on selected member
- Larger output preview (last 120 lines)
- Extended event trace (last 28 lines)
- Phase and status information

### 2.3 Current Output Capture Mechanism

**Location**: Lines 4226-4230
```typescript
onMemberStdoutChunk: (member, chunk) => {
  liveMonitor?.appendChunk(toTeamLiveItemKey(team.id, member.id), "stdout", chunk);
},
onMemberStderrChunk: (member, chunk) => {
  liveMonitor?.appendChunk(toTeamLiveItemKey(team.id, member.id), "stderr", chunk);
},
```

**AppendChunk implementation** (lines 863-873):
```typescript
appendChunk: (itemKey: string, targetStream: LiveStreamView, chunk: string) => {
  const item = byKey.get(itemKey);
  if (!item || closed) return;
  if (targetStream === "stdout") {
    item.stdoutTail = appendTail(item.stdoutTail, chunk);
    item.stdoutBytes += Buffer.byteLength(chunk, "utf-8");
    item.stdoutNewlineCount += countOccurrences(chunk, "\n");
    item.stdoutEndsWithNewline = chunk.endsWith("\n");
  } else {
    item.stderrTail = appendTail(item.stderrTail, chunk);
    item.stderrBytes += Buffer.byteLength(chunk, "utf-8");
    item.stderrNewlineCount += countOccurrences(chunk, "\n");
    item.stderrEndsWithNewline = chunk.endsWith("\n");
  }
  item.lastChunkAtMs = Date.now();
  queueRender();
},
```

---

## 3. Current Limitations

### 3.1 No Discussion-Specific View

The DISCUSSION section is displayed as part of the stdout tail but:
- No dedicated view for comparing discussions across members
- No extraction or highlighting of DISCUSSION content
- Difficult to track discussion flow when multiple members output simultaneously

### 3.2 No Real-Time Discussion Extraction

Currently:
- Stdout chunks are stored as raw text in `stdoutTail`
- DISCUSSION content is mixed with other output
- No parsing or extraction of DISCUSSION section in real-time

### 3.3 No Agreement Status Visualization

The "合意: [要約]" (consensus) pattern is required but:
- No automatic detection of consensus status
- No visual indication of agreement vs disagreement
- No tracking of consensus across members

### 3.4 Limited Context in Communication Phase

During communication rounds:
- Partner references are tracked in `communicationAudit` but only after completion
- No real-time display of who is discussing with whom
- No visualization of communication links

---

## 4. Proposed Design for Real-Time Discussion View

### 4.1 Design Goals

1. **Real-time DISCUSSION extraction**: Parse and extract DISCUSSION sections from stdout as they arrive
2. **Dedicated discussion view**: Provide a focused view showing only discussion content
3. **Cross-member comparison**: Display discussions from all members side-by-side or in a structured format
4. **Agreement status visualization**: Highlight consensus and disagreement patterns
5. **Phase-aware display**: Show discussion view automatically during communication phase
6. **Minimal code changes**: Extend existing infrastructure rather than rewrite

### 4.2 Proposed Architecture

#### 4.2.1 Extend TeamLiveItem Interface

Add discussion-related fields to track parsed discussion content:

```typescript
interface TeamLiveItem {
  // ... existing fields ...
  discussionContent?: string;        // Extracted DISCUSSION section
  discussionLines?: string[];         // DISCUSSION split by lines for rendering
  agreementSummary?: string;         // Extracted "合意: [要約]" if present
  referencedPartners?: string[];     // Partners mentioned in DISCUSSION
  lastDiscussionChunkAtMs?: number;  // Timestamp of last DISCUSSION chunk
  discussionComplete?: boolean;      // Whether DISCUSSION section is complete
}
```

#### 4.2.2 Extend LiveViewMode Type

Add new view mode for discussions:

```typescript
type LiveViewMode = "list" | "detail" | "discussion";
```

#### 4.2.3 Add Discussion Parsing Functions

```typescript
function extractDiscussionSection(stdoutTail: string): string | undefined {
  const discussionField = extractField(stdoutTail, "DISCUSSION");
  if (!discussionField) return undefined;

  // Find the actual start of DISCUSSION content
  const match = stdoutTail.match(/^DISCUSSION:\s*\n([\s\S]*?)(?=\nRESULT:|\n[A-Z]{4,}:|\nNEXT_STEP:)/im);
  return match?.[1]?.trim() || discussionField;
}

function extractAgreementSummary(discussionContent: string): string | undefined {
  // Match "合意: [要約]" pattern
  const match = discussionContent.match(/合意:\s*(.+)/);
  return match?.[1]?.trim();
}

function detectReferencedPartners(discussionContent: string, allPartnerIds: string[]): string[] {
  const referenced: string[] = [];
  const lowered = discussionContent.toLowerCase();

  for (const partnerId of allPartnerIds) {
    if (lowered.includes(partnerId.toLowerCase())) {
      referenced.push(partnerId);
    }
  }

  return referenced;
}
```

#### 4.2.4 Update appendChunk to Parse Discussion

Modify `appendChunk` to extract DISCUSSION content:

```typescript
appendChunk: (itemKey: string, targetStream: LiveStreamView, chunk: string) => {
  const item = byKey.get(itemKey);
  if (!item || closed) return;

  if (targetStream === "stdout") {
    item.stdoutTail = appendTail(item.stdoutTail, chunk);
    item.stdoutBytes += Buffer.byteLength(chunk, "utf-8");
    item.stdoutNewlineCount += countOccurrences(chunk, "\n");
    item.stdoutEndsWithNewline = chunk.endsWith("\n");

    // Try to extract DISCUSSION content when in communication phase
    if (item.phase === "communication" && chunk.includes("DISCUSSION:")) {
      const discussion = extractDiscussionSection(item.stdoutTail);
      if (discussion) {
        item.discussionContent = discussion;
        item.discussionLines = discussion.split("\n").slice(0, 100); // Limit to 100 lines
        item.agreementSummary = extractAgreementSummary(discussion);
        item.referencedPartners = detectReferencedPartners(discussion, item.partners || []);
        item.lastDiscussionChunkAtMs = Date.now();
      }
    }
  }
  // ... rest of existing code ...
}
```

#### 4.2.5 Add renderDiscussionView Function

Create new render function for discussion view:

```typescript
function renderDiscussionView(input: {
  title: string;
  items: TeamLiveItem[];
  globalEvents: string[];
  cursor: number;
  width: number;
  height?: number;
  theme: any;
}): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, input.width));
  const theme = input.theme;

  // Header
  add(theme.bold(theme.fg("accent", `${input.title} [discussion view]`)));

  // Filter items that have discussion content
  const itemsWithDiscussion = input.items.filter(
    item => item.phase === "communication" && item.discussionContent
  );

  if (itemsWithDiscussion.length === 0) {
    add(theme.fg("dim", "Waiting for discussion content..."));
    add(theme.fg("dim", "[b|esc] back to list  [q] close"));
    return finalizeLiveLines(lines, input.height);
  }

  add(theme.fg("dim", `[b|esc] back to list  [q] close  showing ${itemsWithDiscussion.length}/${input.items.length} members`));
  add("");

  // Show each member's discussion
  for (const item of itemsWithDiscussion) {
    const glyph = getLiveStatusGlyph(item.status);
    const statusColor = item.status === "running" ? "accent" : item.status === "completed" ? "green" : "dim";

    // Member header with agreement status
    add(theme.bold(theme.fg(statusColor, `[${glyph}] ${item.label}`)));
    if (item.agreementSummary) {
      add(theme.fg("green", `  合意: ${item.agreementSummary}`));
    }
    if (item.referencedPartners && item.referencedPartners.length > 0) {
      add(theme.fg("dim", `  参照: ${item.referencedPartners.join(", ")}`));
    }

    // Discussion content preview (last 15 lines)
    const previewLines = item.discussionLines?.slice(-15) || [];
    const availableHeight = input.height ? input.height - lines.length - 2 : 15;
    const displayLines = previewLines.slice(-Math.min(availableHeight, 15));

    add(theme.fg("dim", "  DISCUSSION:"));
    for (const line of displayLines) {
      if (line.trim().startsWith("【") || line.trim().startsWith("合意:")) {
        add(theme.fg("yellow", `  ${line}`));
      } else if (line.trim().length > 0) {
        add(`  ${line}`);
      }
    }

    add("");
  }

  return finalizeLiveLines(lines, input.height);
}
```

#### 4.2.6 Update Main Render Function

Modify `renderAgentTeamLiveView` to include discussion mode:

```typescript
function renderAgentTeamLiveView(input: {
  // ... existing fields ...
  mode: LiveViewMode;
  // ... rest of fields ...
}): string[] {
  if (input.mode === "discussion") {
    return renderDiscussionView(input);
  }
  // ... existing list/detail view logic ...
}
```

#### 4.2.7 Update Key Handler

Add key binding for discussion view:

```typescript
handleInput: (rawInput: string) => {
  if (matchesKey(rawInput, "q")) {
    close();
    return;
  }

  if (rawInput === "d" || rawInput === "D") {
    if (mode === "list" || mode === "detail") {
      mode = "discussion";
    } else {
      mode = "list";
    }
    queueRender();
    return;
  }

  // ... existing key handlers ...
}
```

Update help text:

```typescript
// List view help
add(theme.fg("dim", "[j/k] move  [up/down] move  [g/G] jump  [enter] detail  [d] discussion  [tab] stream  [q] close"));

// Detail view help
add(theme.fg("dim", "[j/k] move target  [up/down] move  [g/G] jump  [tab] stdout/stderr  [d] discussion  [b|esc] back  [q] close"));
```

### 4.3 Auto-Switch to Discussion View

Optionally, automatically switch to discussion view when communication phase starts:

```typescript
markPhase: (itemKey: string, phase: TeamLivePhase, round?: number) => {
  const item = byKey.get(itemKey);
  if (!item || closed) return;
  item.phase = phase;
  item.phaseRound = round;
  pushLiveEvent(item, `phase=${formatLivePhase(phase, round)}`);

  // Auto-switch to discussion view when entering communication phase
  if (phase === "communication" && mode !== "discussion") {
    mode = "discussion";
  }

  queueRender();
},
```

---

## 5. Implementation Plan

### Phase 1: Core Discussion Extraction (Priority: High)

**Files to modify**: `.pi/extensions/agent-teams.ts`

**Changes**:
1. Add `discussionContent`, `discussionLines`, `agreementSummary`, `referencedPartners` fields to `TeamLiveItem`
2. Implement `extractDiscussionSection` function
3. Implement `extractAgreementSummary` function
4. Implement `detectReferencedPartners` function
5. Update `appendChunk` to parse DISCUSSION content

**Estimated effort**: 2-3 hours
**Code changes**: ~150 lines

### Phase 2: Discussion View UI (Priority: High)

**Files to modify**: `.pi/extensions/agent-teams.ts`

**Changes**:
1. Add "discussion" to `LiveViewMode` type
2. Implement `renderDiscussionView` function
3. Update `renderAgentTeamLiveView` to dispatch to discussion view
4. Add [d] key binding to toggle discussion view
5. Update help text to include [d] key

**Estimated effort**: 3-4 hours
**Code changes**: ~200 lines

### Phase 3: Auto-Switch and Enhancements (Priority: Medium)

**Files to modify**: `.pi/extensions/agent-teams.ts`

**Changes**:
1. Add auto-switch to discussion view on communication phase
2. Add visual indicators for agreement status (emoji/color)
3. Add partner reference visualization
4. Improve discussion content rendering with syntax highlighting

**Estimated effort**: 2-3 hours
**Code changes**: ~100 lines

### Phase 4: Testing and Refinement (Priority: High)

**Changes**:
1. Test with various discussion formats
2. Test with different numbers of team members
3. Test with single and multiple communication rounds
4. Verify performance with large discussion content
5. Refine UI based on usability

**Estimated effort**: 2-3 hours

---

## 6. Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| DISCUSSION parsing fails with malformed output | Medium | Low | Use regex patterns that handle edge cases, fallback to raw display |
| Performance degradation with large outputs | Low | Low | Limit lines stored, use efficient tail operations |
| Discussion view not useful if members haven't output yet | Low | High | Show "waiting for content" message, filter out empty discussions |
| Markdown rendering conflicts with custom discussion formatting | Medium | Low | Keep discussion view simple text, use markdown in stdout view |
| Key binding conflicts with existing functionality | Low | Low | Check existing bindings, choose [d] which is unused |

---

## 7. Alternative Approaches Considered

### 7.1 Separate Discussion Log File

**Approach**: Write DISCUSSION content to a separate file and tail it in real-time.

**Pros**:
- Clean separation of concerns
- Easy to grep and analyze later

**Cons**:
- Requires file I/O overhead
- More complex synchronization
- Doesn't leverage existing live monitor infrastructure

**Decision**: Not recommended - current infrastructure is sufficient

### 7.2 Side-by-Side Split Pane View

**Approach**: Display multiple members' discussions simultaneously in split panes.

**Pros**:
- Easy comparison between members

**Cons**:
- Requires significant TUI changes
- Complex layout handling with varying output sizes
- May not scale to many team members

**Decision**: Deferred - can be future enhancement if needed

### 7.3 Discussion Content Filtering in stdout View

**Approach**: Add toggle to filter stdout to show only DISCUSSION lines.

**Pros**:
- Simpler implementation
- Reuses existing stdout view

**Cons**:
- Still mixed with other output
- No dedicated comparison view
- Harder to see cross-member context

**Decision**: Supplemental - implement as additional option in stdout view

---

## 8. Recommended Next Steps

1. **Implement Phase 1 (Core Discussion Extraction)**:
   - Add parsing functions
   - Update `TeamLiveItem` interface
   - Modify `appendChunk` to extract discussions

2. **Implement Phase 2 (Discussion View UI)**:
   - Create discussion view renderer
   - Add key binding and mode switching
   - Update help text

3. **Test with sample runs**:
   - Use existing run records to verify parsing
   - Test with real agent team runs
   - Validate discussion content extraction

4. **Implement Phase 3 (Enhancements)** if needed based on testing

5. **Consider Phase 4 (Alternative view modes)** as future enhancements

---

## 9. File References

| Component | Location |
|-----------|----------|
| TeamLiveItem interface | `.pi/extensions/agent-teams.ts:196-217` |
| LiveViewMode type | `.pi/extensions/agent-teams.ts:198` |
| createAgentTeamLiveMonitor | `.pi/extensions/agent-teams.ts:680-898` |
| renderAgentTeamLiveView | `.pi/extensions/agent-teams.ts:394-677` |
| appendChunk implementation | `.pi/extensions/agent-teams.ts:863-873` |
| extractField function | `.pi/extensions/agent-teams.ts:2463-2466` |
| DISCUSSION prompt template | `.pi/extensions/agent-teams.ts:2672-2674` |
| Sample run record | `.pi/agent-teams/runs/20260212-200713-e184bc.json` |
| Communication audit tracking | `.pi/extensions/agent-teams.ts:3294-3518` |

---

## 10. Confidence Assessment

**Overall Confidence**: 0.90

**Confidence Breakdown**:
- Understanding of current output format: 0.95
- Understanding of live monitor architecture: 0.90
- Feasibility of proposed design: 0.90
- Implementation time estimates: 0.80
- No undiscovered major blockers: 0.85

---

## Summary

The current agent team system has a well-defined output format with DISCUSSION sections during communication phases. However, there is no dedicated real-time view for watching these discussions unfold.

The proposed solution extends the existing live monitor with:
1. Real-time extraction of DISCUSSION content from stdout
2. A dedicated discussion view mode focused on comparing discussions
3. Visual indicators for agreement status and partner references
4. Minimal code changes by leveraging existing infrastructure

The implementation is straightforward and can be done in phases, with the core functionality (Phase 1-2) requiring approximately 5-7 hours of development.
