require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tus = require('tus-js-client');
const { PassThrough } = require('stream');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
const PORT = process.env.FETCHER_PORT || process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';
const MEDIPIM_API_URL = process.env.MEDIPIM_API_URL || 'https://api.au.medipim.com/v4/products';
const MEDIPIM_API_KEY_ID = process.env.MEDIPIM_API_KEY_ID;
const MEDIPIM_API_KEY_SECRET = process.env.MEDIPIM_API_KEY_SECRET;

const UPLOAD_STATE_FILE = path.join(__dirname, '.upload-state.json');
let isUploading = false;

function saveUploadState(state) {
  fs.writeFileSync(UPLOAD_STATE_FILE, JSON.stringify(state, null, 2));
}

function loadUploadState() {
  try {
    if (fs.existsSync(UPLOAD_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(UPLOAD_STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading upload state:', error);
  }
  return null;
}

function clearUploadState() {
  try {
    if (fs.existsSync(UPLOAD_STATE_FILE)) {
      fs.unlinkSync(UPLOAD_STATE_FILE);
    }
  } catch (error) {
    console.error('Error clearing upload state:', error);
  }
}

async function streamMediPimToSupabase() {
  console.log('Starting MediPim to Supabase stream...');
  
  if (!MEDIPIM_API_KEY_ID || !MEDIPIM_API_KEY_SECRET) {
    throw new Error('MEDIPIM_API_KEY_ID and MEDIPIM_API_KEY_SECRET must be configured');
  }

  try {
    
    // Create Basic auth header
    const authString = `${MEDIPIM_API_KEY_ID}:${MEDIPIM_API_KEY_SECRET}`;
    const base64Auth = Buffer.from(authString).toString('base64');
    
    console.log('Fetching data from MediPim API...');
    const response = await axios({
      method: 'POST',
      url: MEDIPIM_API_URL,
      headers: {
        'Authorization': `Basic ${base64Auth}`,
        'Accept': 'application/x-ndjson',
        'Content-Type': 'application/json'
      },
      data: {
        filter: {
          status: "active"
        },
        sorting: {
          createdAt: "ASC"
        }
      },
      responseType: 'stream',
      timeout: 300000
    });

    // Buffer the entire response to get the size
    const chunks = [];
    let totalBytes = 0;

    for await (const chunk of response.data) {
      chunks.push(chunk);
      totalBytes += chunk.length;
      
      // Log progress every 10MB
      if (totalBytes % (10 * 1024 * 1024) < chunk.length) {
        console.log(`Downloading from MediPim: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
      }
    }

    const fullBuffer = Buffer.concat(chunks);
    console.log(`Downloaded ${totalBytes} bytes (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) from MediPim`);

    const tusEndpoint = `${process.env.SUPABASE_URL}/storage/v1/upload/resumable`;
    
    return new Promise((resolve, reject) => {
      const upload = new tus.Upload(fullBuffer, {
        endpoint: tusEndpoint,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          'authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'x-upsert': 'true'
        },
        uploadSize: totalBytes,
        metadata: {
          bucketName: 'medipim-raw',
          objectName: 'latest.ndjson',
          contentType: 'application/x-ndjson',
          cacheControl: 'no-cache'
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        onError: function(error) {
          console.error('Upload failed:', error);
          reject(error);
        },
        onProgress: function(bytesUploaded, bytesTotal) {
          const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
          console.log(`Upload progress: ${bytesUploaded}/${bytesTotal} bytes (${percentage}%)`);
          
          saveUploadState({
            uploadUrl: upload.url,
            bytesUploaded: bytesUploaded,
            bytesTotal: bytesTotal,
            timestamp: new Date().toISOString()
          });
        },
        onSuccess: function() {
          console.log('Upload completed successfully');
          clearUploadState();
          const completedAt = new Date().toISOString();
          resolve({ 
            success: true, 
            bytesUploaded: totalBytes,
            fileSizeMB: (totalBytes / (1024 * 1024)).toFixed(2),
            completedAt: completedAt
          });
        },
        onShouldRetry: function(error, retryAttempt, options) {
          const status = error.originalResponse ? error.originalResponse.getStatus() : 0;
          if (status === 403 || status === 404) {
            return false;
          }
          return retryAttempt < options.retryDelays.length;
        }
      });

      upload.findPreviousUploads().then(function(previousUploads) {
        if (previousUploads.length > 0) {
          console.log(`Found previous upload, resuming...`);
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      });
    });
  } catch (error) {
    console.error('Stream error:', error.message);
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

  if (isUploading) {
    return res.status(409).json({ 
      error: 'Upload already in progress',
      message: 'Another upload is currently running. Please wait for it to complete.' 
    });
  }

  try {
    isUploading = true;
    console.log('Manual trigger received, starting stream...');
    const result = await streamMediPimToSupabase();
    res.json({ 
      success: true, 
      message: 'Stream completed successfully',
      bytesUploaded: result.bytesUploaded,
      fileSizeMB: result.fileSizeMB,
      completedAt: result.completedAt
    });
  } catch (error) {
    console.error('Stream failed:', error);
    let errorMessage = error.message;
    
    if (error.message.includes('Maximum size exceeded')) {
      errorMessage = 'File size exceeds Supabase limit. The MediPim dataset is 601MB. Please ensure your Supabase project is on Pro plan or higher.';
    }
    
    res.status(500).json({ 
      success: false, 
      error: errorMessage 
    });
  } finally {
    isUploading = false;
  }
});

app.listen(PORT, () => {
  console.log(`Fetcher service running on port ${PORT}`);
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