require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());
const PORT = process.env.ORCHESTRATOR_PORT || process.env.PORT || 3003;

// Use Fly.io internal DNS when running on Fly
const isProduction = process.env.NODE_ENV === 'production';
const FETCHER_URL = isProduction 
  ? 'http://medipim-fetcher.internal:3001/run'
  : `http://localhost:${process.env.FETCHER_PORT || 3001}/run`;
const MAINTAINER_URL = isProduction 
  ? 'http://medipim-maintainer.internal:3002/run'
  : `http://localhost:${process.env.MAINTAINER_PORT || 3002}/run`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';

// Configuration
const CHUNK_SIZE = 20000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

let syncStatus = {
  isRunning: false,
  startTime: null,
  currentPhase: null,
  progress: {
    fetched: false,
    chunksProcessed: 0,
    totalRecords: 0,
    errors: []
  }
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLatestData() {
  console.log('Phase 1: Fetching latest data from MediPim...');
  syncStatus.currentPhase = 'fetching';
  
  try {
    const response = await axios.post(FETCHER_URL, {}, {
      headers: { 'X-ADMIN-KEY': ADMIN_KEY },
      timeout: parseInt(process.env.REQUEST_TIMEOUT) || 1800000 // Default 30 minutes (increased from 15)
    });
    
    console.log('✓ Data fetched successfully:', response.data);
    syncStatus.progress.fetched = true;
    return true;
  } catch (error) {
    console.error('✗ Failed to fetch data:', error.message);
    syncStatus.progress.errors.push({
      phase: 'fetch',
      error: error.message,
      timestamp: new Date()
    });
    return false;
  }
}

async function processChunk(offset, limit, retryCount = 0) {
  try {
    const response = await axios.post(MAINTAINER_URL, {
      offset,
      limit
    }, {
      headers: {
        'X-ADMIN-KEY': ADMIN_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 600000 // 10 minute timeout per chunk
    });
    
    const { stats, nextOffset, hasMore } = response.data;
    return { 
      success: true, 
      nextOffset, 
      hasMore, 
      processed: stats.totalRecords,
      inserted: stats.inserted,
      updated: stats.updated,
      errors: stats.errors
    };
  } catch (error) {
    // Don't retry on 409 (conflict) - maintainer is already processing
    if (error.response && error.response.status === 409) {
      console.log('  Maintainer is already processing another request');
      return { success: false, error: 'Maintainer busy', skipRetry: true };
    }
    
    if (retryCount < MAX_RETRIES) {
      console.log(`  Retry ${retryCount + 1}/${MAX_RETRIES} after delay...`);
      await sleep(RETRY_DELAY);
      return processChunk(offset, limit, retryCount + 1);
    }
    
    return { success: false, error: error.message };
  }
}

async function processAllChunks() {
  console.log('\nPhase 2: Processing data in chunks...');
  syncStatus.currentPhase = 'processing';
  
  let offset = 0;
  let hasMore = true;
  let chunkNumber = 0;
  
  while (hasMore) {
    chunkNumber++;
    console.log(`\nProcessing chunk ${chunkNumber} (offset: ${offset})...`);
    
    const result = await processChunk(offset, CHUNK_SIZE);
    
    if (!result.success) {
      console.error(`✗ Chunk ${chunkNumber} failed:`, result.error);
      syncStatus.progress.errors.push({
        phase: 'process',
        chunk: chunkNumber,
        offset: offset,
        error: result.error,
        timestamp: new Date()
      });
      return false;
    }
    
    console.log(`✓ Chunk ${chunkNumber}: ${result.processed} records (${result.inserted} new, ${result.updated} updated)`);
    
    syncStatus.progress.chunksProcessed = chunkNumber;
    syncStatus.progress.totalRecords += result.processed;
    
    offset = result.nextOffset;
    hasMore = result.hasMore && result.processed === CHUNK_SIZE;
    
    // Small delay between chunks
    if (hasMore) {
      await sleep(1000);
    }
  }
  
  return true;
}

async function runFullSync() {
  if (syncStatus.isRunning) {
    return {
      success: false,
      error: 'Sync already in progress',
      status: syncStatus
    };
  }
  
  // Reset status
  syncStatus = {
    isRunning: true,
    startTime: new Date(),
    currentPhase: 'starting',
    progress: {
      fetched: false,
      chunksProcessed: 0,
      totalRecords: 0,
      errors: []
    }
  };
  
  console.log('\n========================================');
  console.log('Starting full MediPim sync');
  console.log('Time:', new Date().toISOString());
  console.log('========================================\n');
  
  try {
    // Phase 1: Fetch latest data
    const fetchSuccess = await fetchLatestData();
    if (!fetchSuccess) {
      throw new Error('Failed to fetch data from MediPim');
    }
    
    // Phase 2: Process all chunks
    const processSuccess = await processAllChunks();
    if (!processSuccess) {
      throw new Error('Failed to process all chunks');
    }
    
    // Calculate duration
    const duration = ((Date.now() - syncStatus.startTime) / 1000 / 60).toFixed(2);
    
    console.log('\n========================================');
    console.log('✅ Sync completed successfully!');
    console.log(`Total records: ${syncStatus.progress.totalRecords}`);
    console.log(`Total chunks: ${syncStatus.progress.chunksProcessed}`);
    console.log(`Duration: ${duration} minutes`);
    console.log('========================================\n');
    
    syncStatus.isRunning = false;
    syncStatus.currentPhase = 'completed';
    
    return {
      success: true,
      duration: duration,
      stats: {
        totalRecords: syncStatus.progress.totalRecords,
        chunksProcessed: syncStatus.progress.chunksProcessed,
        errors: syncStatus.progress.errors.length
      }
    };
    
  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    syncStatus.isRunning = false;
    syncStatus.currentPhase = 'failed';
    
    return {
      success: false,
      error: error.message,
      status: syncStatus
    };
  }
}

// API Endpoints
app.get('/healthz', (_, res) => {
  res.status(200).send('OK');
});

app.get('/status', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({
    isRunning: syncStatus.isRunning,
    currentPhase: syncStatus.currentPhase,
    startTime: syncStatus.startTime,
    progress: syncStatus.progress,
    uptime: process.uptime()
  });
});

app.post('/sync', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Run sync asynchronously
  setImmediate(async () => {
    await runFullSync();
  });
  
  res.json({
    message: 'Sync started',
    status: syncStatus
  });
});

// For cron jobs - simple GET endpoint
app.get('/sync', async (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (syncStatus.isRunning) {
    return res.json({
      message: 'Sync already in progress',
      status: syncStatus
    });
  }
  
  // Run sync asynchronously
  setImmediate(async () => {
    await runFullSync();
  });
  
  res.json({
    message: 'Sync started',
    status: syncStatus
  });
});

app.listen(PORT, () => {
  console.log(`Orchestrator service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
  console.log(`Status: GET http://localhost:${PORT}/status (requires X-ADMIN-KEY)`);
  console.log(`Start sync: POST http://localhost:${PORT}/sync (requires X-ADMIN-KEY)`);
  console.log(`Cron endpoint: GET http://localhost:${PORT}/sync?key=YOUR_KEY`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});