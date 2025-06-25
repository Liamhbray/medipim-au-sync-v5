require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { createReadStream } = require('fs');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');
const readline = require('readline');

const app = express();
app.use(express.json());
const PORT = process.env.MAINTAINER_PORT || process.env.PORT || 3002;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 500;

let isProcessing = false;

class NDJSONParser extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true });
    this.buffer = '';
    this.lineNumber = 0;
    this.errorCount = 0;
  }

  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    
    // Keep the last partial line in buffer
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      this.lineNumber++;
      if (line.trim()) {
        try {
          const obj = JSON.parse(line);
          this.push(obj);
        } catch (error) {
          this.errorCount++;
          console.error(`Error parsing line ${this.lineNumber}: ${error.message}`);
          console.error(`Invalid JSON: ${line.substring(0, 100)}...`);
        }
      }
    }
    callback();
  }

  _flush(callback) {
    if (this.buffer.trim()) {
      this.lineNumber++;
      try {
        const obj = JSON.parse(this.buffer);
        this.push(obj);
      } catch (error) {
        this.errorCount++;
        console.error(`Error parsing final line ${this.lineNumber}: ${error.message}`);
      }
    }
    callback();
  }
}

class BatchProcessor extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true });
    this.batchSize = options.batchSize || 100;
    this.batch = [];
  }

  _transform(record, encoding, callback) {
    this.batch.push(record);
    
    if (this.batch.length >= this.batchSize) {
      this.push([...this.batch]);
      this.batch = [];
    }
    
    callback();
  }

  _flush(callback) {
    if (this.batch.length > 0) {
      this.push(this.batch);
    }
    callback();
  }
}

async function downloadFromStorage() {
  console.log('Getting download URL for latest.ndjson...');
  
  // Get a signed URL instead of downloading the entire file
  const { data: urlData, error: urlError } = await supabase.storage
    .from('medipim-raw')
    .createSignedUrl('latest.ndjson', 3600); // 1 hour expiry
  
  if (urlError) {
    throw new Error(`Failed to get download URL: ${urlError.message}`);
  }
  
  console.log('Downloading file from signed URL...');
  
  // Use axios to download with streaming
  const axios = require('axios');
  const response = await axios({
    method: 'GET',
    url: urlData.signedUrl,
    responseType: 'stream'
  });
  
  // Get file size from headers
  const fileSize = parseInt(response.headers['content-length']) || 0;
  console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  
  return response.data;
}

function extractProductData(record) {
  // Handle the MediPim structure where data is in record.result
  const product = record.result || record;
  
  // Extract ID
  const id = product.id || null;
  
  // Extract name - handle language object structure
  let name = 'Unknown Product';
  if (product.name) {
    if (typeof product.name === 'string') {
      name = product.name;
    } else if (product.name.en) {
      name = product.name.en;
    } else {
      // Get first available language
      const langs = Object.keys(product.name);
      if (langs.length > 0) {
        name = product.name[langs[0]];
      }
    }
  }
  
  // Extract price - MediPim uses publicPrice
  let priceCents = null;
  if (product.publicPrice !== null && product.publicPrice !== undefined) {
    priceCents = Math.round(product.publicPrice * 100);
  } else if (product.pharmacistPrice !== null && product.pharmacistPrice !== undefined) {
    priceCents = Math.round(product.pharmacistPrice * 100);
  } else if (product.manufacturerPrice !== null && product.manufacturerPrice !== undefined) {
    priceCents = Math.round(product.manufacturerPrice * 100);
  }
  
  return {
    id,
    name: name.substring(0, 255), // Limit name length
    price_cents: priceCents,
    raw: product // Store just the result, not the meta wrapper
  };
}

async function upsertBatch(products) {
  const validProducts = products.filter(p => p.id);
  
  if (validProducts.length === 0) {
    console.warn('No valid products in batch (missing IDs)');
    return { inserted: 0, updated: 0, errors: products.length };
  }
  
  try {
    // First, check which products already exist
    const ids = validProducts.map(p => p.id);
    const { data: existingProducts, error: selectError } = await supabase
      .from('products')
      .select('id')
      .in('id', ids);
    
    if (selectError) throw selectError;
    
    const existingIds = new Set((existingProducts || []).map(p => p.id));
    const toInsert = validProducts.filter(p => !existingIds.has(p.id));
    const toUpdate = validProducts.filter(p => existingIds.has(p.id));
    
    let inserted = 0;
    let updated = 0;
    
    // Insert new products
    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('products')
        .insert(toInsert);
      
      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }
      inserted = toInsert.length;
    }
    
    // Update existing products
    if (toUpdate.length > 0) {
      // Update one by one for now (bulk update is more complex with Supabase)
      for (const product of toUpdate) {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            name: product.name,
            price_cents: product.price_cents,
            raw: product.raw,
            updated_at: new Date().toISOString()
          })
          .eq('id', product.id);
        
        if (updateError) {
          console.error(`Update error for product ${product.id}:`, updateError);
        } else {
          updated++;
        }
      }
    }
    
    return {
      inserted,
      updated,
      errors: products.length - validProducts.length
    };
  } catch (error) {
    console.error('Batch upsert error:', error.message);
    throw error;
  }
}

async function processNDJSON(offset = 0, limit = null) {
  const startTime = Date.now();
  let totalRecords = 0;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let batchCount = 0;
  let lineNumber = 0;
  let recordsProcessed = 0;
  
  try {
    // Download file from storage as stream
    const stream = await downloadFromStorage();
    
    console.log(`Processing NDJSON file (offset: ${offset}, limit: ${limit || 'all'})...`);
    
    // Create readline interface for line-by-line processing
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });
    
    const records = [];
    
    for await (const line of rl) {
      if (line.trim()) {
        // Skip lines before offset
        if (lineNumber < offset) {
          lineNumber++;
          continue;
        }
        
        // Stop if we've reached the limit
        if (limit && recordsProcessed >= limit) {
          break;
        }
        
        try {
          const record = JSON.parse(line);
          records.push(record);
          recordsProcessed++;
          
          if (records.length >= BATCH_SIZE) {
            const batch = records.splice(0, BATCH_SIZE);
            await processBatch(batch);
          }
        } catch (error) {
          totalErrors++;
          console.error(`Error parsing JSON at line ${lineNumber}: ${error.message}`);
        }
        
        lineNumber++;
      }
    }
    
    // Process remaining records
    if (records.length > 0) {
      await processBatch(records);
    }
    
    async function processBatch(batch) {
      batchCount++;
      totalRecords += batch.length;
      
      try {
        const products = batch.map(extractProductData);
        const result = await upsertBatch(products);
        
        totalInserted += result.inserted;
        totalUpdated += result.updated;
        totalErrors += result.errors;
        
        console.log(`Batch ${batchCount}: ${batch.length} records (${result.inserted} new, ${result.updated} updated, ${result.errors} errors)`);
      } catch (error) {
        console.error(`Batch ${batchCount} error:`, error.message);
        totalErrors += batch.length;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n=== Processing Complete ===');
    console.log(`Total records processed: ${totalRecords}`);
    console.log(`Records inserted: ${totalInserted}`);
    console.log(`Records updated: ${totalUpdated}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Processing time: ${duration} seconds`);
    console.log(`Average speed: ${(totalRecords / duration).toFixed(2)} records/second`);
    
    return {
      totalRecords,
      inserted: totalInserted,
      updated: totalUpdated,
      errors: totalErrors,
      duration: parseFloat(duration)
    };
  } catch (error) {
    console.error('Processing failed:', error);
    throw error;
  }
}

app.get('/healthz', (_, res) => {
  res.status(200).send('OK');
});

app.post('/run', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (isProcessing) {
    return res.status(409).json({ 
      error: 'Processing already in progress',
      message: 'Another maintenance job is currently running. Please wait for it to complete.' 
    });
  }
  
  // Get offset and limit from query params or body
  const offset = parseInt(req.query.offset || req.body?.offset || 0);
  const limit = parseInt(req.query.limit || req.body?.limit || 10000);
  
  try {
    isProcessing = true;
    console.log(`Manual trigger received, processing records ${offset} to ${offset + limit}...`);
    
    const result = await processNDJSON(offset, limit);
    
    res.json({ 
      success: true, 
      message: 'Maintenance completed successfully',
      stats: result,
      nextOffset: offset + limit,
      hasMore: result.totalRecords === limit
    });
  } catch (error) {
    console.error('Maintenance failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    isProcessing = false;
  }
});

app.listen(PORT, () => {
  console.log(`Maintainer service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/healthz`);
  console.log(`Manual trigger: POST http://localhost:${PORT}/run (requires X-ADMIN-KEY header)`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});