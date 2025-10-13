# Synthetic Data Generator (GSD)

Generate realistic browsing history and activity data for testing Blueberry Browser's proactive insights and AI features.

## Features

- **Multiple Browsing Patterns**: Sequential journeys, thematic browsing, random exploration, and temporal routines
- **Realistic Timing**: Peak hours, weekend variations, natural dwell times
- **AI-Generated Content**: Uses LLM to generate realistic URLs, titles, and page content
- **Parallel Processing**: Optimized with `p-limit` for fast concurrent LLM API calls
- **Configurable Concurrency**: Control parallel execution limits for optimal performance

## Usage

```bash
# Quick start with pre-built scenarios
pnpm gsd --scenario shopping --days 7
pnpm gsd --scenario work --days 14
pnpm gsd --scenario news --days 3
pnpm gsd --scenario mixed --days 30

# Advanced options
pnpm gsd --scenario shopping --days 7 --clean --verbose
pnpm gsd --config ./custom-scenario.json --user-id my-test-user

# Dry run (preview without writing files)
pnpm gsd --scenario shopping --days 2 --dry-run
```

## Performance Optimization

The GSD library has been optimized with **parallel processing** using [`p-limit`](https://github.com/sindresorhus/p-limit):

### Parallelization Strategy

1. **URL Generation**: All URLs in a pattern are generated in parallel (up to 10 concurrent)
2. **Content Analysis**: Multiple content analyses run concurrently (configurable, default 5)
3. **LLM API Calls**: Controlled concurrency prevents rate limiting (configurable, default 10)

### Concurrency Configuration

Control parallelism in your scenario config:

```typescript
{
  userId: 'test-user',
  // ... other config
  concurrency: {
    llmCalls: 10,        // Max concurrent LLM API calls (default: 10)
    contentAnalysis: 5   // Max concurrent content analyses (default: 5)
  }
}
```

### Performance Benefits

- **URL Generation**: 5-10x faster for thematic/random patterns (generates 10-12 URLs in parallel)
- **Content Analysis**: 3-5x faster when generating multiple analyses per session
- **Overall**: ~3-4x improvement for typical scenarios with content analysis enabled

### How It Works

The library uses `p-limit` to create concurrency limiters:

```typescript
// In LLMContentGenerator
this.limit = pLimit(concurrency);
await this.limit(async () => {
  // LLM API call happens here with controlled concurrency
});

// In PatternGenerator
const limit = pLimit(10);
const urls = await Promise.all(
  pageParams.map(params => 
    limit(async () => await this.llm.generateURL(...))
  )
);
```

## Pre-built Scenarios

### Shopping Journey
Simulates product research and comparison:
- Search queries
- Product pages
- Reviews and comparisons
- Related product exploration

### Work Research
Professional technical research pattern:
- Documentation browsing
- Stack Overflow searches
- GitHub repositories
- Technical articles

### Mixed Browsing
Casual varied browsing across topics:
- Social media
- News sites
- Entertainment
- Shopping
- Productivity tools

### News Reader
News consumption patterns:
- Multiple news sources
- Category switching
- Article reading
- Related content

## Files Generated

Data is stored in `~/Library/Application Support/blueberry-browser/users/user-data/{userId}/`:

- `raw-activity/{date}.json` - Daily activity logs
- `content-analysis/{date}.json` - LLM-generated page content
- `browsing-history.json` - Aggregated browsing history

## Architecture

```
scripts/synthetic-data/
├── generators/
│   ├── data-generator.ts      # Main orchestrator
│   └── pattern-generator.ts   # Pattern implementations
├── scenarios/
│   ├── shopping-journey.ts
│   ├── work-research.ts
│   ├── mixed-browsing.ts
│   └── news-reader.ts
├── utils/
│   ├── llm-content-generator.ts  # LLM integration with p-limit
│   └── realistic-timing.ts       # Timing/realism utilities
└── types.ts                      # TypeScript definitions
```

## Dependencies

- **p-limit** (v7.1.1): Concurrency control for async operations
- **ai SDK**: OpenAI/Anthropic integration
- **commander**: CLI argument parsing
- **cli-progress**: Progress bar visualization

## Tips

1. **Rate Limiting**: Adjust `concurrency.llmCalls` if you hit API rate limits
2. **Memory**: Large datasets (30+ days) may require higher Node.js memory limits
3. **Caching**: LLM responses are cached within a generation run for efficiency
4. **Clean Data**: Use `--clean` flag to remove existing data before generating
5. **Verbose Mode**: Use `--verbose` to see detailed generation logs and timing

## Examples

### Generate 7 days of shopping data with custom concurrency
```bash
pnpm gsd --scenario shopping --days 7 --verbose
```

### Clean and regenerate test data
```bash
pnpm gsd --scenario work --days 3 --clean
```

### Test a custom scenario config
```bash
pnpm gsd --config ./my-scenario.json --user-id custom-user
```

## Contributing

When adding new patterns or features:

1. Follow the existing pattern structure in `pattern-generator.ts`
2. Use `p-limit` for any concurrent operations
3. Add realistic timing variations
4. Test with `--dry-run` first
5. Document new scenario types
