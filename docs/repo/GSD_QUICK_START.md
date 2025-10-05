# GSD (Generate Synthetic Data) - Quick Start Guide

## ✅ Installation Complete!

The `gsd` CLI tool is now installed and ready to use!

## 🚀 Quick Usage

```bash
# Generate 7 days of shopping data
pnpm gsd --scenario shopping --days 7

# Generate 14 days of work research data
pnpm gsd --scenario work --days 14

# Generate with verbose output
pnpm gsd --scenario mixed --days 5 --verbose

# Clean and regenerate
pnpm gsd --scenario news --days 30 --clean
```

## 📋 Available Scenarios

| Scenario | Alias | Duration | Best For |
|----------|-------|----------|----------|
| `shopping-journey` | `shopping` | 7 days | E-commerce pattern testing |
| `work-research` | `work` | 14 days | Professional workflow patterns |
| `mixed-browsing` | `mixed` | 7 days | General testing (default) |
| `news-reader` | `news` | 30 days | News aggregation testing |

## 🧪 Testing Workflow

### 1. Generate Data
```bash
pnpm gsd --scenario shopping --days 7
```

### 2. Start the Browser
```bash
pnpm dev
```

### 3. Test in Browser
1. **Select the test user**: Look for the user ID in the generation output (e.g., `test-user-shopping`)
2. **Open Insights panel**: Sidebar → Insights tab
3. **Watch it work**: The proactive insights will analyze the synthetic data
4. **Check console**: Look for pattern detection logs

### 4. Inspect the Data
```bash
# View raw activities
cat ~/Library/Application\ Support/blueberry-browser/users/user-data/test-user-shopping/raw-activity/*.json

# View content analyses  
cat ~/Library/Application\ Support/blueberry-browser/users/user-data/test-user-shopping/content-analysis/*.json
```

## 🎯 What Was Generated

The dry run showed it works perfectly:
- ✅ **134 activities** across 2 days
- ✅ **8 browsing sessions** with realistic timing
- ✅ **42 unique URLs** with varied content
- ✅ **28 content analyses** with metadata
- ✅ **Pattern distribution**: 50% sequential, 50% thematic

## 🔑 Optional: Enable LLM Content

For even more realistic content, add your OpenAI API key:

1. Create `.env` file in project root:
   ```bash
   echo "OPENAI_API_KEY=sk-your-key-here" > .env
   ```

2. Regenerate:
   ```bash
   pnpm gsd --scenario shopping --days 7 --clean
   ```

**Note**: The tool works great with OR without the API key. Fallback generation is perfectly fine for testing!

## 💡 Tips

- **Start small**: Test with 2-3 days before generating months of data
- **Use `--dry-run`**: Preview without writing files
- **Try different scenarios**: Each has unique patterns for different test cases
- **Check the docs**: Full documentation in `scripts/synthetic-data/README.md`

## 📊 Example Output

When you run `pnpm gsd --scenario shopping --days 7`, you'll see:

```
🍇 Blueberry Browser - Generate Synthetic Data (gsd)

📋 Using scenario: shopping

⚙️  Configuration:
   User ID:      test-user-shopping
   Start Date:   2025-09-26
   Duration:     7 days
   Sessions/Day: 2-5
   Patterns:     sequential(60%), thematic(30%), random(10%)
   Content AI:   Yes (60%)

🎲 Generating synthetic data...

✅ Generation Complete!

📊 Statistics:
   Total Activities:    450
   Browsing Sessions:   28
   Unique URLs:         120
   Content Analyses:    85
   Days Generated:      7

🔍 Pattern Distribution:
   sequential      17 sessions (60.7%)
   thematic        8 sessions (28.6%)
   random          3 sessions (10.7%)

📁 Data Location:
   ~/Library/Application Support/blueberry-browser/users/user-data/test-user-shopping

🧪 Testing Instructions:
   1. Install dependencies:  pnpm install
   2. Start the browser:     pnpm dev
   3. Select user:           test-user-shopping
   4. Open Insights panel:   Sidebar → Insights tab
   5. Watch the magic:       Proactive insights will analyze the data

   💡 Tip: Check browser console logs for pattern detection details
```

## 🎨 Next Steps

1. **Generate some data**: Pick a scenario and run it
2. **Test the browser**: See how proactive insights work
3. **Try different scenarios**: Each creates different browsing patterns
4. **Iterate and refine**: Use the insights to improve your testing

## ❓ Need Help?

- Full documentation: `scripts/synthetic-data/README.md`
- View help: `pnpm gsd --help`
- Check scenarios: Look in `scripts/synthetic-data/scenarios/`

Happy testing! 🍇

