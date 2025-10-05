# AI Proactive Insights - Demo Guide

## Quick Start

### 1. Start the Browser

```bash
pnpm dev
```

### 2. Generate Some Browsing Data

The feature needs at least **1-2 days of browsing activity** to detect patterns. You can either:

**Option A: Use Existing Data**
If you already have browsing history, skip to step 3.

**Option B: Generate Synthetic Patterns** (5 minutes)

Create some patterns manually:

**Morning Workflow Pattern**:
1. Open these in sequence (3-5 times over different sessions):
   - Gmail.com
   - Calendar.google.com
   - Slack.com

**Research Pattern**:
1. Search for "AI customer service tools"
2. Visit 4-5 pages about Intercom, Zendesk, etc.
3. Spend 30+ seconds on each page
4. Then close all tabs (creates abandoned task)

**Habit Pattern**:
1. Visit the same site (e.g., news site) at the same time 3+ days in a row

### 3. Access Insights

1. Click **"Insights"** button in the sidebar (brain icon)
2. Click **"Analyze Behavior"** button
3. Wait 10-30 seconds (analyzing 7 days of activity)
4. View your personalized insights!

### 4. Take Action

- **Workflow Insight**: Click "Open Workflow" → All tabs open automatically
- **Research Insight**: View summary and key findings
- **Abandoned Task**: Click "Continue" → Resume where you left off
- **Habit Insight**: See your browsing patterns

## What to Expect

### Insight Types

🔧 **Workflow Detected**
- Shows recurring tab sequences
- E.g., "Daily productivity start" (Gmail → Calendar → Slack)
- Action: Opens all tabs in sequence

📚 **Research Summary**
- Identifies research topics you explored
- Extracts key findings from pages visited
- Action: Links to continue research

⏰ **Unfinished Task**
- Detects abandoned research sessions
- Explains what you were trying to do
- Suggests ways to resume
- Action: Reopens last page or related search

📈 **Browsing Habit**
- Time-based patterns (day + hour + domain)
- E.g., "You visit Gmail every Monday at 9:00"
- Action: Set reminder (future feature)

### Scoring

Each insight shows a relevance score (0-100%):
- **Frequency**: How often it occurs
- **Recency**: How recent it is
- **Impact**: Estimated time saved

## Demo Script

**For presenting to stakeholders:**

> "Traditional browsers like Strawberry are *reactive* - you tell them what to do.
> 
> Blueberry is *proactive* - it watches your behavior, learns patterns, and suggests actions WITHOUT being asked.
>
> Let me show you..."

**[Open Insights panel]**

> "I've been browsing for a few days. Let's analyze my behavior..."

**[Click "Analyze Behavior", wait]**

> "The AI is using GPT-5 to:
> 1. Segment my browsing into semantic sessions using pure LLM analysis
> 2. Detect 4 types of patterns: workflows, research, abandoned tasks, habits
> 3. Generate actionable suggestions
>
> All of this uses the rich content analysis we've already built - categories, descriptions, screenshots."

**[Show detected patterns]**

> "Look - it found my morning routine. Every day I open Gmail, then Calendar, then Slack."
>
> **[Click "Open Workflow"]**
>
> "One click - all tabs open. That's 15 seconds saved every morning."

**[Show research pattern]**

> "It also summarized my research on customer service tools and extracted key findings. It knows I was comparing Intercom and Zendesk."

**[Show abandoned task]**

> "And here - it detected I started researching pricing but didn't finish. It's suggesting ways to resume."

> "This is the future: A browser that understands you, learns from you, and works FOR you."

## Technical Deep-Dive Points

**If asked about the implementation:**

### Algorithm
- "Pure semantic session segmentation via LLM - no arbitrary time limits"
- "Uses full content context: categories, descriptions, brands, screenshots"
- "Multi-strategy pattern detection running in parallel"
- "Composite scoring: frequency × recency × impact"

### Cost
- "About $5 per year per active user"
- "Uses GPT-5-nano for fast decisions, GPT-5-mini for complex reasoning"
- "~30 seconds to analyze 7 days of data"

### Data
- "Leverages existing infrastructure: activity tracking, content analysis, vector search"
- "All local processing except LLM API calls"
- "No user data leaves the machine except anonymized patterns to LLM"

### Scalability
- "Pattern detection runs offline (on-demand or nightly)"
- "Real-time matching is fast (just checks current context)"
- "Caching prevents re-analysis"

## Troubleshooting

### "No Insights Yet"

**Cause**: Not enough browsing data (need at least 2 days with multiple sessions)

**Solution**: 
1. Browse more (create some patterns)
2. Or wait until you have more natural browsing history

### "Analysis taking too long"

**Cause**: Large amount of activity data (>500 activities)

**Solution**: This is normal. First analysis can take 30-60s. Subsequent analyses are faster (cached sessions).

### "Analysis failed"

**Cause**: OpenAI API key not configured or rate limit

**Solution**: Check `.env` file has valid `OPENAI_API_KEY`

## What Makes This Special

### vs Traditional Browsing History
- History: Passive log of URLs
- Insights: Active intelligence with actions

### vs Browser Extensions
- Extensions: Single-purpose tools
- Insights: Holistic behavior understanding

### vs Strawberry/Competitors
- Competitors: You command, they execute
- Blueberry: It suggests, you benefit

### Technical Innovation
- First browser to use LLM for session segmentation
- Multi-strategy pattern detection (4 types simultaneously)
- Leverages rich content analysis (not just URLs)
- One-click actionable insights

## Future Vision

This feature is the foundation for:
1. **Real-time suggestions**: "You're on Gmail at 9am, want Calendar too?"
2. **Workflow automation**: Permanent shortcuts for detected patterns
3. **Smart reminders**: "Continue your research from last week?"
4. **Personalized homepage**: Shows predicted next actions
5. **Cross-device sync**: Patterns follow you everywhere

## Questions to Prepare For

**Q: How much data do you need?**
A: Minimum 2 days with 5+ sessions each. More data = better patterns.

**Q: What if I don't want to be tracked?**
A: It's opt-in. Click "Analyze" when you want insights. Data never leaves your machine except to LLM (and can use local models).

**Q: How accurate is it?**
A: Depends on behavior consistency. Recurring patterns (80%+ accuracy). One-off behavior won't be detected (by design).

**Q: Can I dismiss insights?**
A: Yes - insights disappear after you execute the action or after time passes.

**Q: What about privacy?**
A: All local. Only anonymized patterns go to LLM. Could use local models (Ollama) for full privacy.

---

**Ready to show how Blueberry is superior to Strawberry!** 🫐 > 🍓

