# Vector Database Inspector CLI

A command-line tool to inspect and search the vector database that stores embeddings of browsing content.

## Quick Start

```bash
# List all users
pnpm inspect-vectors list-users

# Show stats for a user
pnpm inspect-vectors stats <userId>

# List documents
pnpm inspect-vectors list <userId> --limit 10

# Show a specific document
pnpm inspect-vectors show <userId> <documentId>

# Search by semantic similarity
pnpm inspect-vectors search <userId> "your search query" --limit 10
```

## Commands

### `list-users`
Lists all users in the system and shows which ones have vector databases.

```bash
pnpm inspect-vectors list-users
```

**Example output:**
```
📁 Found 3 user(s):

  ✅ 07bb0c68-fc82-45e2-8d7b-8f5df9d31044
     Tables: browsing_content
  ❌ a5e8f4bf-99cf-418e-b2b5-156f6ca0f4a8
  ❌ c9c7210f-7f9d-4b9e-a7e5-e31d97ce226d
```

### `stats <userId>`
Shows statistics about a user's vector database.

```bash
pnpm inspect-vectors stats 07bb0c68-fc82-45e2-8d7b-8f5df9d31044
```

**Example output:**
```
📊 Vector Database Stats for 07bb0c68-fc82-45e2-8d7b-8f5df9d31044

Database Path: /Users/.../blueberry-browser/users/user-data/07bb0c68.../vector-db

Table: browsing_content
  Total Documents: 8
  Fields: id, analysisId, userId, url, contentType, content, timestamp
  Vector Dimension: 384
```

### `list <userId> [--limit N]`
Lists documents in the vector database. Default limit is 10.

```bash
pnpm inspect-vectors list 07bb0c68-fc82-45e2-8d7b-8f5df9d31044 --limit 5
```

**Example output:**
```
📄 Documents (showing 3):

ID: analysis-1759302883037-cocd2e5d7-title
  Analysis: analysis-1759302883037-cocd2e5d7
  Type: title
  URL: https://www.juventus.com/it
  Content: Juventus Football Club - Sito Ufficiale | Juventus.com
  Timestamp: 2025-10-01T07:14:52.810Z
  Vector: [0.0097, 0.0941, -0.0419, -0.0791, 0.0126, ... 379 more]
```

### `show <userId> <documentId>`
Shows detailed information about a specific document, including the full vector.

```bash
pnpm inspect-vectors show 07bb0c68-fc82-45e2-8d7b-8f5df9d31044 analysis-123-title
```

**Example output:**
```
📄 Document Details:

ID: analysis-1759302883037-cocd2e5d7-title
Analysis ID: analysis-1759302883037-cocd2e5d7
User ID: 07bb0c68-fc82-45e2-8d7b-8f5df9d31044
Content Type: title
URL: https://www.juventus.com/it
Timestamp: 2025-10-01T07:14:52.810Z

Content:
Juventus Football Club - Sito Ufficiale | Juventus.com

Vector (384 dimensions):
[0.0097, 0.0941, -0.0419, -0.0791, 0.0126, 0.0483, -0.0294, -0.0577, -0.0023, 0.0357, ... 374 more]

Full vector: [0.009715..., ...]
```

### `search <userId> <query> [--limit N]`
Performs semantic search on the vector database. Default limit is 10.

```bash
pnpm inspect-vectors search 07bb0c68-fc82-45e2-8d7b-8f5df9d31044 "customer service" --limit 5
```

**Example output:**
```
🔍 Searching for: "customer service"

Loading embeddings model...
Generating query embedding...
Searching vector database...

Found 3 result(s):

1. Score: 0.5944 (distance: 0.6823)
   Type: title
   URL: https://www.intercom.com/
   Content: The AI customer service company
   ID: analysis-1759303156530-gsioe6aiu-title

2. Score: 0.4744 (distance: 1.1078)
   Type: pageDescription
   URL: https://www.intercom.com/
   Content: Intercom's marketing page presents its AI-powered customer service solutions...
   ID: analysis-1759303156530-gsioe6aiu-pageDescription
```

## Understanding Results

### Content Types
Each analyzed page creates 4 separate documents:
- `pageDescription` - AI-generated description of the page
- `title` - Page title from HTML
- `metaDescription` - Meta description tag
- `screenshotDescription` - AI-generated description of the page screenshot

### Scores
- **Score**: Normalized similarity (0-1, higher is better)
  - Calculated as `1 / (1 + distance)`
  - Close to 1.0 = very similar
  - Close to 0 = very different
- **Distance**: Raw L2 distance from LanceDB (lower is better)
  - 0 = identical
  - Higher = more different

### Document IDs
Format: `{analysisId}-{contentType}`

Example: `analysis-1759302883037-cocd2e5d7-title`
- Analysis ID: `analysis-1759302883037-cocd2e5d7`
- Content type: `title`

## Use Cases

### Debugging Vector Search
```bash
# Check if vectors are being created
pnpm inspect-vectors stats <userId>

# Verify content is indexed correctly
pnpm inspect-vectors list <userId> --limit 5

# Test search relevance
pnpm inspect-vectors search <userId> "test query"
```

### Inspecting Specific Pages
```bash
# Find all documents for a URL
pnpm inspect-vectors list <userId> | grep "intercom.com"

# Look at a specific document's vector
pnpm inspect-vectors show <userId> <documentId>
```

### Quality Assurance
```bash
# Verify embeddings are diverse (not all zeros)
pnpm inspect-vectors show <userId> <documentId>

# Check that similar content has similar vectors
pnpm inspect-vectors search <userId> "banking" --limit 3
pnpm inspect-vectors search <userId> "financial services" --limit 3
```

## Notes

- The embeddings model (~25MB) downloads on first use
- Search requires loading the model (takes a few seconds)
- Stats and list commands are fast (no model loading needed)
- The tool reads from the same database the app uses
- Safe to use while the app is running

## Troubleshooting

**"Vector database not found"**
- The user hasn't visited any pages yet, or content analysis hasn't completed
- Check that the app has analyzed some pages

**"No documents found"**
- The vector table exists but is empty
- Check the content analysis logs in the app

**Model download fails**
- Check internet connection
- Model cache location: `~/Library/Application Support/blueberry-browser/models`

## Technical Details

- **Database**: LanceDB (embedded, disk-based)
- **Embeddings Model**: `Xenova/all-MiniLM-L6-v2` (384 dimensions)
- **Search Algorithm**: L2 distance with vector similarity
- **Storage Location**: `~/Library/Application Support/blueberry-browser/users/user-data/{userId}/vector-db/`

