#!/usr/bin/env tsx
/**
 * Vector Database Inspector CLI
 * 
 * Usage:
 *   pnpm inspect-vectors list-users
 *   pnpm inspect-vectors stats <userId>
 *   pnpm inspect-vectors list <userId> [--limit 10]
 *   pnpm inspect-vectors show <userId> <documentId>
 *   pnpm inspect-vectors search <userId> <query> [--limit 10]
 */

import { connect } from 'vectordb';
import { pipeline, env } from '@huggingface/transformers';
import { join } from 'path';
import { readdirSync, existsSync } from 'fs';
import { homedir } from 'os';

// Configure model cache
const APP_DATA = join(homedir(), 'Library', 'Application Support', 'blueberry-browser');
env.cacheDir = join(APP_DATA, 'models');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Type definitions for LanceDB results
interface LanceDBDocument {
  id: string;
  analysisId: string;
  userId: string;
  url: string;
  contentType: string;
  content: string;
  timestamp: string;
  vector: number[];
  _distance?: number;
}

const USERS_DIR = join(APP_DATA, 'users', 'user-data');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getUserIds(): string[] {
  if (!existsSync(USERS_DIR)) {
    return [];
  }
  return readdirSync(USERS_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);
}

async function getVectorDb(userId: string) {
  const dbPath = join(USERS_DIR, userId, 'vector-db');
  if (!existsSync(dbPath)) {
    throw new Error(`Vector database not found for user ${userId}`);
  }
  return await connect(dbPath);
}

function formatVector(vector: number[], maxItems = 5): string {
  if (!vector || vector.length === 0) return '[]';
  const preview = vector.slice(0, maxItems).map(v => v.toFixed(4)).join(', ');
  const remaining = vector.length - maxItems;
  return `[${preview}${remaining > 0 ? `, ... ${remaining} more]` : ']'}`;
}

function truncate(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// ============================================================================
// COMMANDS
// ============================================================================

async function listUsers() {
  const userIds = getUserIds();
  
  if (userIds.length === 0) {
    console.log('No users found.');
    return;
  }

  console.log(`\n📁 Found ${userIds.length} user(s):\n`);
  
  for (const userId of userIds) {
    const vectorDbPath = join(USERS_DIR, userId, 'vector-db');
    const hasVectorDb = existsSync(vectorDbPath);
    
    console.log(`  ${hasVectorDb ? '✅' : '❌'} ${userId}`);
    
    if (hasVectorDb) {
      try {
        const db = await getVectorDb(userId);
        const tables = await db.tableNames();
        console.log(`     Tables: ${tables.join(', ') || 'none'}`);
      } catch (error) {
        console.log(`     Error reading DB: ${error}`);
      }
    }
  }
  console.log();
}

async function showStats(userId: string) {
  try {
    const db = await getVectorDb(userId);
    const tables = await db.tableNames();
    
    console.log(`\n📊 Vector Database Stats for ${userId}\n`);
    console.log(`Database Path: ${join(USERS_DIR, userId, 'vector-db')}\n`);
    
    if (tables.length === 0) {
      console.log('No tables found.\n');
      return;
    }
    
    for (const tableName of tables) {
      const table = await db.openTable(tableName);
      const count = await table.countRows();
      
      console.log(`Table: ${tableName}`);
      console.log(`  Total Documents: ${count}`);
      
      // Get sample document to show schema
      if (count > 0) {
        try {
          // Use search with a dummy vector to get a sample
          const dummyVector = Array(384).fill(0);
          const sample = await table.search(dummyVector).limit(1).execute() as LanceDBDocument[];
          if (sample.length > 0) {
            const doc = sample[0];
            console.log(`  Fields: ${Object.keys(doc).filter(k => k !== 'vector' && !k.startsWith('_')).join(', ')}`);
            console.log(`  Vector Dimension: ${doc.vector?.length || 0}`);
          }
        } catch (e) {
          // Ignore if we can't get a sample
        }
      }
      console.log();
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

async function listDocuments(userId: string, limit = 10) {
  try {
    const db = await getVectorDb(userId);
    const table = await db.openTable('browsing_content');
    
    // Use search with dummy vector to get documents
    const dummyVector = Array(384).fill(0);
    const documents = await table.search(dummyVector).limit(limit).execute() as LanceDBDocument[];
    
    if (documents.length === 0) {
      console.log('\nNo documents found.\n');
      return;
    }
    
    console.log(`\n📄 Documents (showing ${documents.length}):\n`);
    
    for (const doc of documents) {
      console.log(`ID: ${doc.id}`);
      console.log(`  Analysis: ${doc.analysisId}`);
      console.log(`  Type: ${doc.contentType}`);
      console.log(`  URL: ${truncate(doc.url, 60)}`);
      console.log(`  Content: ${truncate(doc.content, 100)}`);
      console.log(`  Timestamp: ${doc.timestamp}`);
      console.log(`  Vector: ${formatVector(doc.vector)}`);
      console.log();
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

async function showDocument(userId: string, documentId: string) {
  try {
    const db = await getVectorDb(userId);
    const table = await db.openTable('browsing_content');
    
    // Use search with filter
    const dummyVector = Array(384).fill(0);
    const results = await table.search(dummyVector)
      .filter(`id = '${documentId}'`)
      .limit(1)
      .execute() as LanceDBDocument[];
    
    if (results.length === 0) {
      console.log(`\nDocument ${documentId} not found.\n`);
      return;
    }
    
    const doc = results[0];
    
    console.log(`\n📄 Document Details:\n`);
    console.log(`ID: ${doc.id}`);
    console.log(`Analysis ID: ${doc.analysisId}`);
    console.log(`User ID: ${doc.userId}`);
    console.log(`Content Type: ${doc.contentType}`);
    console.log(`URL: ${doc.url}`);
    console.log(`Timestamp: ${doc.timestamp}`);
    console.log(`\nContent:\n${doc.content}\n`);
    console.log(`\nVector (${doc.vector.length} dimensions):`);
    console.log(formatVector(doc.vector, 10));
    console.log(`\nFull vector: [${doc.vector.join(', ')}]\n`);
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

async function searchDocuments(userId: string, query: string, limit = 10) {
  try {
    console.log(`\n🔍 Searching for: "${query}"\n`);
    console.log('Loading embeddings model...');
    
    const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Generating query embedding...');
    
    const output = await embedder(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output.data);
    
    const db = await getVectorDb(userId);
    const table = await db.openTable('browsing_content');
    
    console.log('Searching vector database...\n');
    
    const results = await table
      .search(queryEmbedding)
      .limit(limit)
      .execute() as LanceDBDocument[];
    
    if (results.length === 0) {
      console.log('No results found.\n');
      return;
    }
    
    console.log(`Found ${results.length} result(s):\n`);
    
    for (let i = 0; i < results.length; i++) {
      const doc = results[i];
      // LanceDB returns L2 distance, lower is better
      // Convert to similarity score (higher is better) using 1/(1+distance)
      const score = doc._distance !== undefined 
        ? 1 / (1 + doc._distance)
        : 0;
      
      console.log(`${i + 1}. Score: ${score.toFixed(4)} (distance: ${doc._distance?.toFixed(4) || 'N/A'})`);
      console.log(`   Type: ${doc.contentType}`);
      console.log(`   URL: ${truncate(doc.url, 60)}`);
      console.log(`   Content: ${truncate(doc.content, 100)}`);
      console.log(`   ID: ${doc.id}`);
      console.log();
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

// ============================================================================
// CLI PARSER
// ============================================================================

function showHelp() {
  console.log(`
Vector Database Inspector CLI

Usage:
  pnpm inspect-vectors <command> [options]

Commands:
  list-users              List all users with vector databases
  stats <userId>          Show statistics for a user's vector database
  list <userId> [--limit N]
                          List documents (default limit: 10)
  show <userId> <docId>   Show detailed information about a document
  search <userId> <query> [--limit N]
                          Search documents by semantic similarity

Examples:
  pnpm inspect-vectors list-users
  pnpm inspect-vectors stats 07bb0c68-fc82-45e2-8d7b-8f5df9d31044
  pnpm inspect-vectors list 07bb0c68-fc82-45e2-8d7b-8f5df9d31044 --limit 5
  pnpm inspect-vectors show 07bb0c68-fc82-45e2-8d7b-8f5df9d31044 analysis-123-title
  pnpm inspect-vectors search 07bb0c68-fc82-45e2-8d7b-8f5df9d31044 "mortgage rates"
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }
  
  const command = args[0];
  
  try {
    switch (command) {
      case 'list-users':
        await listUsers();
        break;
        
      case 'stats':
        if (!args[1]) {
          console.error('Error: userId required');
          process.exit(1);
        }
        await showStats(args[1]);
        break;
        
      case 'list':
        if (!args[1]) {
          console.error('Error: userId required');
          process.exit(1);
        }
        const listLimit = args.includes('--limit') 
          ? parseInt(args[args.indexOf('--limit') + 1]) 
          : 10;
        await listDocuments(args[1], listLimit);
        break;
        
      case 'show':
        if (!args[1] || !args[2]) {
          console.error('Error: userId and documentId required');
          process.exit(1);
        }
        await showDocument(args[1], args[2]);
        break;
        
      case 'search':
        if (!args[1] || !args[2]) {
          console.error('Error: userId and query required');
          process.exit(1);
        }
        const searchLimit = args.includes('--limit')
          ? parseInt(args[args.indexOf('--limit') + 1])
          : 10;
        await searchDocuments(args[1], args[2], searchLimit);
        break;
        
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();

