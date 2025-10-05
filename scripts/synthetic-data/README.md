# Synthetic Data Generator (gsd)

Generate realistic browsing history and activity data for testing Blueberry Browser's proactive insights and AI features.

## Quick Start

```bash
# Install dependencies
pnpm install

# Generate 7 days of mixed browsing data
pnpm gsd --scenario mixed --days 7

# Generate shopping journey data with verbose output
pnpm gsd --scenario shopping --verbose
```

## Available Scenarios

### 🛍️ Shopping Journey (`shopping` or `shopping-journey`)
User researching and comparing products before purchase.
- **Duration**: 7 days
- **Sessions/Day**: 2-5
- **Patterns**: 60% sequential journeys, 30% thematic reviews, 10% random
- **Best for**: Testing e-commerce pattern detection

### 💼 Work Research (`work` or `work-research`)
Professional user doing deep research on technical topics.
- **Duration**: 14 days
- **Sessions/Day**: 3-8
- **Patterns**: 50% sequential research, 40% thematic reading, 10% routine
- **Best for**: Testing professional workflow patterns

### 📰 News Reader (`news` or `news-reader`)
Regular news consumption from multiple sources.
- **Duration**: 30 days
- **Sessions/Day**: 3-6 (quick sessions)
- **Patterns**: 60% thematic news, 30% routine sites, 10% discovery
- **Best for**: Testing news aggregation and content categorization

### 🌐 Mixed Browsing (`mixed` or `mixed-browsing`) - Default
Typical casual user with varied interests.
- **Duration**: 7 days
- **Sessions/Day**: 2-6
- **Patterns**: 40% random, 30% thematic, 20% sequential, 10% routine
- **Best for**: General testing and realistic mixed patterns

## CLI Options

```bash
pnpm gsd [options]

Options:
  -s, --scenario <name>      Pre-built scenario (shopping, work, mixed, news)
  -c, --config <path>        Path to custom configuration JSON file
  -u, --user-id <id>         Target user ID (overrides scenario default)
  -d, --days <number>        Number of days to generate (default: 7)
  --start-date <date>        Start date YYYY-MM-DD (default: 7 days ago)
  --clean                    Clean existing data before generating
  --dry-run                  Show what would be generated without writing
  -v, --verbose              Verbose output with detailed logging
  -h, --help                 Display help information
```

## Usage Examples

```bash
# Basic usage with a scenario
pnpm gsd --scenario shopping --days 7

# Generate for a specific user
pnpm gsd --scenario work --user-id my-test-user

# Clean and regenerate
pnpm gsd --scenario mixed --clean --days 14

# Dry run to preview
pnpm gsd --scenario news --dry-run --verbose

# Custom date range
pnpm gsd --scenario shopping --start-date 2025-09-01 --days 30

# Use custom configuration
pnpm gsd --config ./my-scenario.json
```

## Custom Configuration

Create a JSON file with your custom scenario:

```json
{
  "userId": "my-custom-user",
  "dateRange": {
    "start": "2025-09-01",
    "days": 14
  },
  "sessions": {
    "perDay": { "min": 3, "max": 7 },
    "durationMinutes": { "min": 10, "max": 60 }
  },
  "patterns": [
    {
      "type": "sequential",
      "weight": 0.5,
      "categories": ["technology", "programming"]
    },
    {
      "type": "thematic",
      "weight": 0.3,
      "categories": ["news", "articles"]
    },
    {
      "type": "random",
      "weight": 0.2
    }
  ],
  "activityTypes": {
    "page_visit": 1.0,
    "page_interaction": 0.8,
    "navigation_event": 0.9,
    "tab_action": 0.6,
    "search_query": 0.3
  },
  "contentAnalysis": {
    "generate": true,
    "percentage": 0.7
  },
  "realism": {
    "peakHours": [9, 10, 11, 14, 15, 16, 20, 21],
    "weekendReduction": 0.3
  }
}
```

Then run:
```bash
pnpm gsd --config ./my-scenario.json
```

## Testing with Synthetic Data

After generating data:

1. **Start the browser:**
   ```bash
   pnpm dev
   ```

2. **Select the generated user:**
   - The user ID is shown in the generation output (e.g., `test-user-shopping`)
   - Create/select this user in the browser

3. **View the insights:**
   - Open the sidebar
   - Navigate to the Insights tab
   - Proactive insights will automatically analyze the synthetic data

4. **Check the console:**
   - Look for pattern detection logs
   - Verify sequential, thematic, and temporal patterns are identified
   - Check LLM-generated content quality

5. **Inspect raw data:**
   ```bash
   # View generated activities
   cat ~/Library/Application\ Support/blueberry-browser/users/user-data/test-user-shopping/raw-activity/2025-10-*.json
   
   # View content analyses (with LLM-generated text)
   cat ~/Library/Application\ Support/blueberry-browser/users/user-data/test-user-shopping/content-analysis/2025-10-*.json
   ```

## Features

### LLM-Powered Content Generation
- **Realistic URLs**: Uses GPT-5-nano to generate authentic-looking URLs for various categories
- **Page Content**: Generates realistic page descriptions, full text content, and metadata
- **Browsing Journeys**: Creates coherent multi-step user journeys with natural progression
- **Search Queries**: Generates human-like search queries with natural language

### Realistic Timing Patterns
- **Peak Hours**: Activity concentrated during typical browsing hours
- **Weekend Reduction**: Less activity on weekends for work scenarios
- **Dwell Time**: Realistic page visit durations based on content type
- **Session Duration**: Natural distribution of session lengths

### Activity Types
Generates 13 different activity types:
- `page_visit` - URL visits with load times
- `page_interaction` - Engagement metrics (time, scrolling, clicks)
- `navigation_event` - Transitions between pages
- `tab_action` - Tab management (create, switch, close)
- `search_query` - Search behavior
- `click_event` - Click interactions
- `scroll_event` - Scrolling patterns
- `keyboard_input` - Text input
- And more...

### Browsing Patterns
Four distinct pattern types:
1. **Sequential**: Goal-oriented journeys (e.g., shopping research)
2. **Thematic**: Related content on similar topics (e.g., news reading)
3. **Random**: Unfocused browsing across topics
4. **Temporal**: Repeated visits to routine sites (e.g., email, social media)

## Architecture

```
scripts/synthetic-data/
├── types.ts                      # TypeScript type definitions
├── generators/
│   ├── data-generator.ts         # Main orchestrator
│   └── pattern-generator.ts      # Pattern-specific generation
├── utils/
│   ├── llm-content-generator.ts  # LLM-powered content
│   └── realistic-timing.ts       # Timing utilities
└── scenarios/
    ├── shopping-journey.ts       # Shopping scenario config
    ├── work-research.ts          # Work scenario config
    ├── mixed-browsing.ts         # Mixed scenario config
    └── news-reader.ts            # News scenario config
```

## Requirements

- **OpenAI API Key**: Required for LLM-powered content generation
  - Set in `.env` file: `OPENAI_API_KEY=your-key-here`
  - Uses GPT-5-nano model (cost-effective)
  - Falls back to simple generation if API unavailable

## Performance

- **Generation Speed**: ~10-30 seconds per day of data (depending on LLM calls)
- **LLM Caching**: Intelligent caching reduces duplicate API calls
- **Content Analysis**: Optional, configurable percentage (50-80% recommended)
- **Cost**: ~$0.01-0.05 per 1000 activities with GPT-5-nano

## Troubleshooting

### "No .env file found" Warning
Add your OpenAI API key to `.env` in project root:
```
OPENAI_API_KEY=sk-...
```

### LLM Generation Fails
The generator will fall back to simple content generation if the LLM fails.
Check your API key and network connection.

### No Data Appears in Browser
1. Verify the user ID matches: Check generation output
2. Restart the browser: `pnpm dev`
3. Check file paths: Look in `~/Library/Application Support/blueberry-browser/users/user-data/`

### Insights Not Showing
1. Wait a few seconds for analysis to complete
2. Check browser console for errors
3. Verify content analysis files were generated
4. Try generating more data (at least 3-5 days recommended)

## Tips

- **Start small**: Test with 2-3 days before generating months of data
- **Use verbose mode**: `-v` flag shows detailed progress
- **Try dry-run first**: `--dry-run` to preview without writing files
- **Clean between tests**: Use `--clean` to start fresh
- **Mix scenarios**: Generate different users with different scenarios for varied testing

## License

Part of Blueberry Browser - see main project LICENSE

