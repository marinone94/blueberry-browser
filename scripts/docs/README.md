# Blueberry Browser Scripts - Quick Start Guide

## ✅ Installation Complete!

Two powerful CLI tools are now installed and ready to use:
- **`gsd`** - Generate Synthetic Data for testing
- **`inspect-vectors`** - Inspect and debug vector databases

## 🚀 GSD Quick Usage

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

---

## 🔍 Vector Database Inspector

The `inspect-vectors` CLI tool helps you debug and explore vector databases created by the semantic search system.

### Quick Usage

```bash
# List all users with vector databases
pnpm inspect-vectors list-users

# Show statistics for a user's vector database
pnpm inspect-vectors stats <userId>

# List indexed documents
pnpm inspect-vectors list <userId> --limit 10

# Show detailed information about a document
pnpm inspect-vectors show <userId> <documentId>

# Search by semantic similarity
pnpm inspect-vectors search <userId> "your search query" --limit 5
```

### Available Commands

#### `list-users`
Lists all users in the system and shows whether they have vector databases.

```bash
pnpm inspect-vectors list-users
```

**Output Example**:
```
📁 Found 3 user(s):

  ✅ test-user-shopping
     Tables: browsing_content, chat_history
  ✅ 07bb0c68-fc82-45e2-8d7b-8f5df9d31044
     Tables: browsing_content
  ❌ guest
```

#### `stats <userId>`
Shows detailed statistics about a user's vector database.

```bash
pnpm inspect-vectors stats test-user-shopping
```

**Output Example**:
```
📊 Vector Database Stats for test-user-shopping

Database Path: ~/Library/Application Support/blueberry-browser/users/user-data/test-user-shopping/vector-db

Table: browsing_content
  Total Documents: 85
  Fields: id, analysisId, userId, url, contentType, content, timestamp
  Vector Dimension: 384

Table: chat_history
  Total Documents: 42
  Fields: id, sessionId, userId, contentType, content, messageId, timestamp
  Vector Dimension: 384
```

#### `list <userId> [--limit N]`
Lists documents in the vector database with preview.

```bash
# List first 10 documents (default)
pnpm inspect-vectors list test-user-shopping

# List first 5 documents
pnpm inspect-vectors list test-user-shopping --limit 5
```

**Output Example**:
```
📄 Documents (showing 5):

ID: analysis-123-pageDescription
  Analysis: analysis-123
  Type: pageDescription
  URL: https://example.com/product/laptop
  Content: A comprehensive guide to choosing the best laptop for developers in 2...
  Timestamp: 2025-10-15T14:30:00.000Z
  Vector: [0.1234, -0.5678, 0.9012, -0.3456, 0.7890, ... 379 more]
```

#### `show <userId> <documentId>`
Shows complete details for a specific document, including the full vector.

```bash
pnpm inspect-vectors show test-user-shopping analysis-123-pageDescription
```

**Output Example**:
```
📄 Document Details:

ID: analysis-123-pageDescription
Analysis ID: analysis-123
User ID: test-user-shopping
Content Type: pageDescription
URL: https://example.com/product/laptop
Timestamp: 2025-10-15T14:30:00.000Z

Content:
A comprehensive guide to choosing the best laptop for developers in 2025...

Vector (384 dimensions):
[0.1234, -0.5678, 0.9012, -0.3456, 0.7890, 0.2345, -0.6789, 0.0123, 0.4567, -0.8901, ... 374 more]

Full vector: [0.1234, -0.5678, ...]
```

#### `search <userId> <query> [--limit N]`
Performs semantic similarity search across the vector database.

```bash
# Search with default limit (10)
pnpm inspect-vectors search test-user-shopping "mortgage rates"

# Search with custom limit
pnpm inspect-vectors search test-user-shopping "laptop reviews" --limit 5
```

**Output Example**:
```
🔍 Searching for: "mortgage rates"

Loading embeddings model...
Generating query embedding...
Searching vector database...

Found 3 result(s):

1. Score: 0.8523 (distance: 0.1732)
   Type: pageDescription
   URL: https://example.com/finance/mortgage-guide
   Content: Complete guide to understanding current mortgage rates and how to get...
   ID: analysis-456-pageDescription

2. Score: 0.7891 (distance: 0.2671)
   Type: title
   URL: https://example.com/banking/home-loans
   Content: Home Loan Interest Rates Comparison 2025
   ID: analysis-789-title
```

### 🎯 Use Cases

#### 1. Verify Content Indexing
Check if your browsing content is being properly indexed:
```bash
pnpm inspect-vectors stats <userId>
pnpm inspect-vectors list <userId> --limit 5
```

#### 2. Debug Search Results
Test semantic search to understand why certain results are returned:
```bash
pnpm inspect-vectors search <userId> "your search query"
```

#### 3. Inspect Document Structure
Examine the exact data being stored in vectors:
```bash
pnpm inspect-vectors show <userId> <documentId>
```

#### 4. Compare Embeddings
View the actual vector embeddings to understand similarity:
```bash
pnpm inspect-vectors show <userId> doc1
pnpm inspect-vectors show <userId> doc2
# Compare the vector values manually
```

### 💡 Technical Details

**Vector Model**: Uses `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- Same model as the main application
- Local processing via Transformers.js
- Models cached in app userData directory

**Database**: LanceDB vector database
- Efficient similarity search
- Supports multiple tables per user
- Tables: `browsing_content`, `chat_history`

**Content Types**:
- `pageDescription`: AI-generated page summaries
- `title`: Page titles
- `metaDescription`: Meta descriptions
- `screenshotDescription`: Screenshot descriptions
- `userMessage`: Chat user messages
- `assistantMessage`: AI assistant responses
- `sessionSummary`: Chat session summaries

### ❓ Troubleshooting

**"Vector database not found"**:
- The user hasn't browsed any pages yet
- Content analysis hasn't run
- Check if the user exists: `pnpm inspect-vectors list-users`

**"No documents found"**:
- The vector database exists but is empty
- Try generating synthetic data: `pnpm gsd --scenario shopping --days 2`

**Model loading is slow**:
- First run downloads the embedding model (~90MB)
- Subsequent runs use cached model
- Check cache: `~/Library/Application Support/blueberry-browser/models/`

### 🔗 Related Tools

- **View raw data**: Check user data directory
  ```bash
  ls ~/Library/Application\ Support/blueberry-browser/users/user-data/<userId>/
  ```

