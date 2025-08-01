#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const db = require('../src/database/connection');
const { logger } = require('../src/utils/logger');

/**
 * Database migration runner
 */
class MigrationRunner {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../src/database/migrations');
  }

  /**
   * Initialize migrations table
   */
  async initializeMigrationsTable() {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP DEFAULT NOW()
        )
      `);
      logger.info('Migrations table initialized');
    } catch (error) {
      logger.error('Failed to initialize migrations table', { error: error.message });
      throw error;
    }
  }

  /**
   * Get executed migrations
   */
  async getExecutedMigrations() {
    try {
      const result = await db.query('SELECT filename FROM migrations ORDER BY id');
      return result.rows.map(row => row.filename);
    } catch (error) {
      logger.error('Failed to get executed migrations', { error: error.message });
      throw error;
    }
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations() {
    try {
      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.js'))
        .sort();
      
      const executed = await this.getExecutedMigrations();
      return files.filter(file => !executed.includes(file));
    } catch (error) {
      logger.error('Failed to get pending migrations', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a single migration
   */
  async executeMigration(filename, direction = 'up') {
    try {
      const migrationPath = path.join(this.migrationsPath, filename);
      const migration = require(migrationPath);

      if (typeof migration[direction] !== 'function') {
        throw new Error(`Migration ${filename} does not export a ${direction} function`);
      }

      logger.info(`Executing migration: ${filename} (${direction})`);
      await migration[direction]();

      if (direction === 'up') {
        await db.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
        logger.info(`Migration completed: ${filename}`);
      } else {
        await db.query('DELETE FROM migrations WHERE filename = $1', [filename]);
        logger.info(`Migration rolled back: ${filename}`);
      }
    } catch (error) {
      logger.error(`Migration failed: ${filename}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate() {
    try {
      await db.initialize();
      await this.initializeMigrationsTable();

      const pending = await this.getPendingMigrations();
      
      if (pending.length === 0) {
        logger.info('No pending migrations');
        return;
      }

      logger.info(`Found ${pending.length} pending migrations`);

      for (const filename of pending) {
        await this.executeMigration(filename, 'up');
      }

      logger.info('All migrations completed successfully');
    } catch (error) {
      logger.error('Migration process failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Rollback last migration
   */
  async rollback() {
    try {
      await db.initialize();
      await this.initializeMigrationsTable();

      const executed = await this.getExecutedMigrations();
      
      if (executed.length === 0) {
        logger.info('No migrations to rollback');
        return;
      }

      const lastMigration = executed[executed.length - 1];
      await this.executeMigration(lastMigration, 'down');

      logger.info('Rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Show migration status
   */
  async status() {
    try {
      await db.initialize();
      await this.initializeMigrationsTable();

      const files = fs.readdirSync(this.migrationsPath)
        .filter(file => file.endsWith('.js'))
        .sort();
      
      const executed = await this.getExecutedMigrations();

      console.log('\nMigration Status:');
      console.log('================');

      for (const file of files) {
        const status = executed.includes(file) ? '✓ Executed' : '✗ Pending';
        console.log(`${status} - ${file}`);
      }

      console.log(`\nTotal: ${files.length}, Executed: ${executed.length}, Pending: ${files.length - executed.length}\n`);
    } catch (error) {
      logger.error('Failed to get migration status', { error: error.message });
      throw error;
    }
  }

  /**
   * Reset database (rollback all migrations)
   */
  async reset() {
    try {
      await db.initialize();
      await this.initializeMigrationsTable();

      const executed = await this.getExecutedMigrations();
      
      if (executed.length === 0) {
        logger.info('No migrations to reset');
        return;
      }

      logger.info(`Rolling back ${executed.length} migrations`);

      // Rollback in reverse order
      for (let i = executed.length - 1; i >= 0; i--) {
        await this.executeMigration(executed[i], 'down');
      }

      logger.info('Database reset completed');
    } catch (error) {
      logger.error('Database reset failed', { error: error.message });
      throw error;
    }
  }
}

/**
 * CLI interface
 */
async function main() {
  const command = process.argv[2];
  const runner = new MigrationRunner();

  try {
    switch (command) {
      case 'migrate':
      case 'up':
        await runner.migrate();
        break;
      
      case 'rollback':
      case 'down':
        await runner.rollback();
        break;
      
      case 'status':
        await runner.status();
        break;
      
      case 'reset':
        await runner.reset();
        break;
      
      default:
        console.log('Usage: node migrate.js <command>');
        console.log('Commands:');
        console.log('  migrate   - Run all pending migrations');
        console.log('  rollback  - Rollback the last migration');
        console.log('  status    - Show migration status');
        console.log('  reset     - Rollback all migrations');
        process.exit(1);
    }
    
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error.message);
    await db.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = MigrationRunner;
