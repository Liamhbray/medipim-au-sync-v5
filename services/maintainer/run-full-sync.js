#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');

const MAINTAINER_URL = `http://localhost:${process.env.MAINTAINER_PORT || 3002}/run`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';
const CHUNK_SIZE = 5000; // Process 5000 records at a time
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processChunk(offset, limit, retryCount = 0) {
  try {
    console.log(`Processing chunk: offset=${offset}, limit=${limit}`);
    
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
    console.log(`✓ Processed ${stats.totalRecords} records (${stats.inserted} new, ${stats.updated} updated) in ${stats.duration}s`);
    
    return { success: true, nextOffset, hasMore, processed: stats.totalRecords };
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.error(`✗ Chunk failed (attempt ${retryCount + 1}/${MAX_RETRIES}): ${error.message}`);
      console.log(`  Retrying in ${RETRY_DELAY/1000} seconds...`);
      await sleep(RETRY_DELAY);
      return processChunk(offset, limit, retryCount + 1);
    }
    
    console.error(`✗ Chunk failed after ${MAX_RETRIES} attempts: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runFullSync() {
  console.log('Starting full MediPim sync...');
  console.log(`Chunk size: ${CHUNK_SIZE} records`);
  console.log('');
  
  const startTime = Date.now();
  let offset = 0;
  let totalProcessed = 0;
  let hasMore = true;
  let chunkCount = 0;
  
  while (hasMore) {
    chunkCount++;
    console.log(`\n=== Chunk ${chunkCount} ===`);
    
    const result = await processChunk(offset, CHUNK_SIZE);
    
    if (!result.success) {
      console.error('\n❌ Sync failed!');
      console.error(`Failed at offset ${offset}`);
      console.error(`Total processed before failure: ${totalProcessed}`);
      console.error('\nTo resume, run:');
      console.error(`  node run-full-sync.js --resume-from=${offset}`);
      process.exit(1);
    }
    
    totalProcessed += result.processed;
    offset = result.nextOffset;
    hasMore = result.hasMore && result.processed === CHUNK_SIZE;
    
    // Small delay between chunks to avoid overwhelming the system
    if (hasMore) {
      await sleep(1000);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  
  console.log('\n✅ Full sync completed successfully!');
  console.log(`Total records processed: ${totalProcessed}`);
  console.log(`Total chunks: ${chunkCount}`);
  console.log(`Total time: ${duration} minutes`);
}

// Check for resume flag
const args = process.argv.slice(2);
const resumeArg = args.find(arg => arg.startsWith('--resume-from='));
const startOffset = resumeArg ? parseInt(resumeArg.split('=')[1]) : 0;

// Modify the main function to accept start offset
async function runFullSyncWithResume(startOffset = 0) {
  if (startOffset > 0) {
    console.log(`Resuming from offset ${startOffset}...`);
  }
  
  console.log('Starting full MediPim sync...');
  console.log(`Chunk size: ${CHUNK_SIZE} records`);
  console.log('');
  
  const startTime = Date.now();
  let offset = startOffset;
  let totalProcessed = 0;
  let hasMore = true;
  let chunkCount = 0;
  
  while (hasMore) {
    chunkCount++;
    console.log(`\n=== Chunk ${chunkCount} ===`);
    
    const result = await processChunk(offset, CHUNK_SIZE);
    
    if (!result.success) {
      console.error('\n❌ Sync failed!');
      console.error(`Failed at offset ${offset}`);
      console.error(`Total processed before failure: ${totalProcessed}`);
      console.error('\nTo resume, run:');
      console.error(`  node run-full-sync.js --resume-from=${offset}`);
      process.exit(1);
    }
    
    totalProcessed += result.processed;
    offset = result.nextOffset;
    hasMore = result.hasMore && result.processed === CHUNK_SIZE;
    
    // Small delay between chunks to avoid overwhelming the system
    if (hasMore) {
      await sleep(1000);
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  
  console.log('\n✅ Full sync completed successfully!');
  console.log(`Total records processed: ${totalProcessed}`);
  console.log(`Total chunks: ${chunkCount}`);
  console.log(`Total time: ${duration} minutes`);
}

// Run the sync
runFullSyncWithResume(startOffset).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});