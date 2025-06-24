require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = `http://localhost:${process.env.PORT || 3002}`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testHealthEndpoint() {
  try {
    console.log('Testing health endpoint...');
    const response = await axios.get(`${BASE_URL}/healthz`);
    console.log('✓ Health check passed:', response.data);
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
  }
}

async function testUnauthorizedAccess() {
  try {
    console.log('\nTesting run endpoint with invalid admin key...');
    const response = await axios.post(`${BASE_URL}/run`, {}, {
      headers: {
        'X-ADMIN-KEY': 'wrong-key'
      }
    });
    console.error('✗ Security test failed - endpoint accepted invalid key');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✓ Security test passed - correctly rejected invalid key');
    } else {
      console.error('✗ Security test failed:', error.message);
    }
  }
}

async function checkPrerequisites() {
  try {
    console.log('\nChecking prerequisites...');
    
    // Check if latest.ndjson exists
    const { data: files, error: listError } = await supabase.storage
      .from('medipim-raw')
      .list();
    
    if (listError) {
      console.error('✗ Failed to list storage files:', listError.message);
      return false;
    }
    
    const hasFile = files.some(f => f.name === 'latest.ndjson');
    if (!hasFile) {
      console.error('✗ latest.ndjson not found in storage. Run fetcher service first.');
      return false;
    }
    
    console.log('✓ latest.ndjson found in storage');
    
    // Check products table exists
    const { data: tables, error: tableError } = await supabase
      .from('products')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.code !== 'PGRST116') {
      console.error('✗ Cannot access products table:', tableError.message);
      return false;
    }
    
    console.log('✓ Products table accessible');
    
    return true;
  } catch (error) {
    console.error('✗ Prerequisites check failed:', error.message);
    return false;
  }
}

async function testRunEndpoint() {
  try {
    console.log('\nTesting run endpoint with valid admin key...');
    console.log('This may take a while depending on file size...');
    
    const startTime = Date.now();
    
    const response = await axios.post(`${BASE_URL}/run`, {}, {
      headers: {
        'X-ADMIN-KEY': ADMIN_KEY
      },
      timeout: 600000 // 10 minute timeout
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('✓ Processing completed in', duration, 'seconds');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    // Verify some data was processed
    if (response.data.stats && response.data.stats.totalRecords > 0) {
      console.log(`✓ Processed ${response.data.stats.totalRecords} records`);
      
      // Check database for records
      const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });
      
      if (!error) {
        console.log(`✓ Database now contains ${count} products`);
      }
    }
    
  } catch (error) {
    if (error.response) {
      console.error('✗ Run endpoint failed:', error.response.data);
    } else if (error.code === 'ECONNABORTED') {
      console.error('✗ Request timed out - processing may still be running');
    } else {
      console.error('✗ Run endpoint failed:', error.message);
    }
  }
}

async function testConcurrentRequests() {
  try {
    console.log('\nTesting concurrent request protection...');
    
    // Start first request (don't await)
    const firstRequest = axios.post(`${BASE_URL}/run`, {}, {
      headers: { 'X-ADMIN-KEY': ADMIN_KEY },
      timeout: 60000
    });
    
    // Wait a moment then try second request
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await axios.post(`${BASE_URL}/run`, {}, {
        headers: { 'X-ADMIN-KEY': ADMIN_KEY }
      });
      console.error('✗ Concurrency test failed - second request was accepted');
    } catch (error) {
      if (error.response && error.response.status === 409) {
        console.log('✓ Concurrency test passed - second request rejected');
      } else {
        console.error('✗ Concurrency test failed:', error.message);
      }
    }
    
    // Cancel first request
    firstRequest.catch(() => {});
    
  } catch (error) {
    console.error('✗ Concurrency test error:', error.message);
  }
}

async function runTests() {
  console.log('Starting maintainer service tests...\n');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await testHealthEndpoint();
  await testUnauthorizedAccess();
  
  const ready = await checkPrerequisites();
  if (!ready) {
    console.log('\nSkipping processing tests due to missing prerequisites');
    console.log('Please run the fetcher service first to populate latest.ndjson');
    return;
  }
  
  await testConcurrentRequests();
  
  console.log('\nNote: To test actual processing, uncomment the line below');
  console.log('This will process the entire NDJSON file and may take several minutes');
  // await testRunEndpoint();
}

runTests().then(() => {
  console.log('\nTests completed');
  process.exit(0);
}).catch(error => {
  console.error('\nTests failed:', error);
  process.exit(1);
});