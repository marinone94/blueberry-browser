#!/usr/bin/env tsx
/**
 * Synthetic Data Generator for Blueberry Browser (gsd - Generate Synthetic Data)
 * 
 * Generates realistic browsing history and activity data for testing
 * proactive insights and other AI features.
 * 
 * Usage:
 *   pnpm gsd --scenario shopping-journey --days 7
 *   pnpm gsd --config ./scenarios/custom.json
 *   pnpm gsd --help
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import { Command } from 'commander';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SyntheticDataGenerator } from './synthetic-data/generators/data-generator';
import type { GeneratorConfig } from './synthetic-data/types';

// Pre-built scenarios
import { shoppingJourneyScenario } from './synthetic-data/scenarios/shopping-journey';
import { workResearchScenario } from './synthetic-data/scenarios/work-research';
import { mixedBrowsingScenario } from './synthetic-data/scenarios/mixed-browsing';
import { newsReaderScenario } from './synthetic-data/scenarios/news-reader';
import { workflowFocusedScenario } from './synthetic-data/scenarios/workflow-focused';

const scenarios: Record<string, GeneratorConfig> = {
  'shopping-journey': shoppingJourneyScenario,
  'shopping': shoppingJourneyScenario,
  'work-research': workResearchScenario,
  'work': workResearchScenario,
  'mixed-browsing': mixedBrowsingScenario,
  'mixed': mixedBrowsingScenario,
  'news-reader': newsReaderScenario,
  'news': newsReaderScenario,
  'workflow-focused': workflowFocusedScenario,
  'workflow': workflowFocusedScenario,
};

async function main() {
  const program = new Command();

  program
    .name('gsd')
    .description('🍇 Generate Synthetic Data - Create realistic browsing history for testing')
    .version('1.0.0');

  program
    .option('-s, --scenario <name>', 'Pre-built scenario (shopping, work, mixed, news)')
    .option('-c, --config <path>', 'Path to custom configuration JSON file')
    .option('-u, --user-id <id>', 'Target user ID (overrides scenario default)')
    .option('-d, --days <number>', 'Number of days to generate (overrides scenario)', '7')
    .option('--start-date <date>', 'Start date YYYY-MM-DD (default: 7 days ago)')
    .option('--clean', 'Clean existing data before generating')
    .option('--dry-run', 'Show what would be generated without writing files')
    .option('-v, --verbose', 'Verbose output with detailed logging');

  program.parse();

  const options = program.opts();

  console.log('🍇 Blueberry Browser - Generate Synthetic Data (gsd)\n');

  try {
    // Check for .env file
    const envPath = join(process.cwd(), '.env');
    await fs.access(envPath);

    // Determine configuration
    let config: GeneratorConfig;

    if (options.config) {
      // Load from file
      console.log(`📁 Loading configuration from: ${options.config}`);
      const configContent = await fs.readFile(options.config, 'utf-8');
      config = JSON.parse(configContent);
    } else if (options.scenario) {
      // Use pre-built scenario
      const scenarioKey = options.scenario.toLowerCase();
      if (!scenarios[scenarioKey]) {
        console.error(`❌ Unknown scenario: ${options.scenario}`);
        console.log(`\nAvailable scenarios:`);
        console.log(`   shopping, shopping-journey - Shopping research and comparison`);
        console.log(`   work, work-research        - Professional technical research`);
        console.log(`   mixed, mixed-browsing      - Casual varied browsing (default)`);
        console.log(`   news, news-reader          - News consumption patterns`);
        console.log(`   workflow, workflow-focused - Repeated workflows for pattern detection`);
        process.exit(1);
      }
      console.log(`📋 Using scenario: ${options.scenario}`);
      config = scenarios[scenarioKey];
    } else {
      // Default: mixed browsing
      console.log('📋 Using default scenario: mixed-browsing');
      console.log('   (Use --scenario to choose a different one)\n');
      config = scenarios['mixed'];
    }

    // Override with CLI options
    if (options.userId) {
      config.userId = options.userId;
    }
    if (options.days) {
      config.dateRange.days = parseInt(options.days, 10);
    }
    if (options.startDate) {
      config.dateRange.start = options.startDate;
    }

    // Show configuration
    console.log('⚙️  Configuration:');
    console.log(`   User ID:      ${config.userId}`);
    console.log(`   Start Date:   ${config.dateRange.start}`);
    console.log(`   Duration:     ${config.dateRange.days} days`);
    console.log(`   Sessions/Day: ${config.sessions.perDay.min}-${config.sessions.perDay.max}`);
    console.log(`   Patterns:     ${config.patterns.map(p => `${p.type}(${Math.round(p.weight * 100)}%)`).join(', ')}`);
    console.log(`   Content AI:   ${config.contentAnalysis.generate ? `Yes (${Math.round(config.contentAnalysis.percentage * 100)}%)` : 'No'}`);

    if (options.dryRun) {
      console.log('\n🔍 DRY RUN MODE - No files will be written\n');
    } else {
      console.log('');
    }

    // Clean existing data if requested
    if (options.clean && !options.dryRun) {
      console.log('🧹 Cleaning existing data...');
      await cleanUserData(config.userId);
      console.log('');
    }

    // Generate data
    console.log('🎲 Generating synthetic data...');
    console.log('   (This may take a while with LLM content generation)\n');
    
    const generator = new SyntheticDataGenerator(config, {
      verbose: options.verbose,
      dryRun: options.dryRun,
    });

    const result = await generator.generate();

    // Register user account if not dry run
    if (!options.dryRun) {
      await ensureUserAccount(config.userId);
      
      // Populate browsing history from activities
      console.log('\n📚 Populating browsing history from activities...');
      const historyCount = await populateBrowsingHistory(config.userId);
      console.log(`   ✓ Added ${historyCount} history entries`);
    }

    // Show results
    console.log('\n✅ Generation Complete!\n');
    console.log('📊 Statistics:');
    console.log(`   Total Activities:    ${result.totalActivities}`);
    console.log(`   Browsing Sessions:   ${result.totalSessions}`);
    console.log(`   Unique URLs:         ${result.uniqueUrls}`);
    console.log(`   Content Analyses:    ${result.contentAnalyses}`);
    console.log(`   Days Generated:      ${result.daysGenerated}`);
    
    if (result.patterns && Object.keys(result.patterns).length > 0) {
      console.log('\n🔍 Pattern Distribution:');
      for (const [type, count] of Object.entries(result.patterns)) {
        const percentage = ((count as number) / result.totalSessions * 100).toFixed(1);
        console.log(`   ${type.padEnd(15)} ${count} sessions (${percentage}%)`);
      }
    }

    if (!options.dryRun) {
      console.log('\n📁 Data Location:');
      console.log(`   ${getUserDataPath(config.userId)}`);
      
      console.log('\n🧪 Testing Instructions:');
      console.log('   1. Install dependencies:  pnpm install');
      console.log('   2. Start the browser:     pnpm dev');
      console.log(`   3. Select user:           ${config.userId}`);
      console.log('   4. Open Insights panel:   Sidebar → Insights tab');
      console.log('   5. Watch the magic:       Proactive insights will analyze the data');
      console.log('\n   💡 Tip: Check browser console logs for pattern detection details');
    }

  } catch (error) {
    console.error('\n❌ Error generating data:', error);
    if (options.verbose && error instanceof Error) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Clean existing user data
 */
async function cleanUserData(userId: string): Promise<void> {
  const userDataPath = getUserDataPath(userId);
  try {
    await fs.rm(userDataPath, { recursive: true, force: true });
    console.log(`   ✓ Cleaned: ${userDataPath}`);
  } catch (error) {
    // Ignore if doesn't exist
  }
  
  // Also clean insights metadata to force fresh analysis
  const { homedir } = require('os');
  const appSupportPath = join(homedir(), 'Library', 'Application Support', 'blueberry-browser');
  const insightsMetadataPath = join(appSupportPath, 'users', 'user-data', userId, 'proactive-insights', 'generation-metadata.json');
  try {
    await fs.rm(insightsMetadataPath, { force: true });
    console.log(`   ✓ Cleaned insights metadata`);
  } catch (error) {
    // Ignore if doesn't exist
  }
}

/**
 * Get user data directory path
 * Uses the same path as the Electron app for consistency
 */
function getUserDataPath(userId: string): string {
  const { homedir } = require('os');
  const appSupportPath = join(homedir(), 'Library', 'Application Support', 'blueberry-browser');
  return join(appSupportPath, 'users', 'user-data', userId);
}

/**
 * Get accounts.json path
 */
function getAccountsPath(): string {
  const { homedir } = require('os');
  const appSupportPath = join(homedir(), 'Library', 'Application Support', 'blueberry-browser');
  return join(appSupportPath, 'users', 'accounts.json');
}

/**
 * Ensure user account exists in accounts.json
 */
async function ensureUserAccount(userId: string): Promise<void> {
  const accountsPath = getAccountsPath();
  
  try {
    // Ensure directory exists
    await fs.mkdir(join(accountsPath, '..'), { recursive: true });
    
    // Load existing accounts
    let accounts: any[] = [];
    try {
      const data = await fs.readFile(accountsPath, 'utf-8');
      accounts = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, start with empty array
    }
    
    // Check if user exists
    const existingUser = accounts.find((acc: any) => acc.id === userId);
    
    if (existingUser) {
      // Update lastActiveAt
      existingUser.lastActiveAt = new Date().toISOString();
      console.log(`   ✓ Updated user account: ${userId}`);
    } else {
      // Create new user account
      const newAccount = {
        id: userId,
        name: userId,
        email: '',
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        sessionPartition: `persist:user-${userId}`,
        isGuest: false,
      };
      accounts.push(newAccount);
      console.log(`   ✓ Created user account: ${userId}`);
    }
    
    // Write back to file
    await fs.writeFile(accountsPath, JSON.stringify(accounts, null, 2));
  } catch (error) {
    console.error(`   ⚠️  Warning: Failed to update accounts.json:`, error);
    console.log(`   💡 You may need to manually add user ${userId} in the browser`);
  }
}

/**
 * Populate browsing history from raw activities
 * Directly manipulates files without needing Electron
 */
async function populateBrowsingHistory(userId: string): Promise<number> {
  const userDataPath = getUserDataPath(userId);
  const activityDir = join(userDataPath, 'raw-activity');
  const historyPath = join(userDataPath, 'browsing-history.json');
  
  try {
    // Load all activity files
    const files = await fs.readdir(activityDir);
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort();
    
    let processedCount = 0;
    let history: any[] = [];
    
    // Load existing history
    try {
      const historyContent = await fs.readFile(historyPath, 'utf-8');
      history = JSON.parse(historyContent);
    } catch (error) {
      // No history exists yet
    }
    
    const existingUrls = new Set(history.map(h => `${h.url}|${new Date(h.visitedAt).getTime()}`));
    
    // Process each activity file
    for (const file of jsonFiles) {
      const filePath = join(activityDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const activities = JSON.parse(content);
      
      // Extract page_visit activities
      for (const activity of activities) {
        if (activity.type === 'page_visit' && activity.data.url && activity.data.title) {
          const timestamp = new Date(activity.timestamp).getTime();
          const key = `${activity.data.url}|${timestamp}`;
          
          // Skip duplicates
          if (existingUrls.has(key)) {
            continue;
          }
          
          // Add to history
          const entry = {
            id: `${timestamp}-${Math.random().toString(36).substr(2, 9)}`,
            url: activity.data.url,
            title: activity.data.title,
            visitedAt: activity.timestamp,
            favicon: undefined,
            analysisId: undefined
          };
          
          history.unshift(entry); // Add to beginning
          existingUrls.add(key);
          processedCount++;
        }
      }
    }
    
    // Limit to 1000 entries
    if (history.length > 1000) {
      history = history.slice(0, 1000);
    }
    
    // Save history
    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    
    return processedCount;
  } catch (error) {
    console.error(`   ⚠️  Warning: Failed to populate history:`, error);
    return 0;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };

