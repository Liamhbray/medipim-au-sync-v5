require('dotenv').config();
const axios = require('axios');

const BASE_URL = `http://localhost:${process.env.PORT || 3001}`;
const ADMIN_KEY = process.env.ADMIN_KEY || 'your-admin-key-here';

async function testHealthEndpoint() {
  try {
    console.log('Testing health endpoint...');
    const response = await axios.get(`${BASE_URL}/healthz`);
    console.log('✓ Health check passed:', response.data);
  } catch (error) {
    console.error('✗ Health check failed:', error.message);
  }
}

async function testRunEndpoint() {
  try {
    console.log('\nTesting run endpoint with valid admin key...');
    const response = await axios.post(`${BASE_URL}/run`, {}, {
      headers: {
        'X-ADMIN-KEY': ADMIN_KEY
      }
    });
    console.log('✓ Run endpoint passed:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('✗ Run endpoint failed:', error.response.data);
    } else {
      console.error('✗ Run endpoint failed:', error.message);
    }
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

async function runTests() {
  console.log('Starting fetcher service tests...\n');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await testHealthEndpoint();
  await testUnauthorizedAccess();
  
  console.log('\nNote: Testing actual MediPim sync with valid credentials...');
  await testRunEndpoint();
}

runTests().then(() => {
  console.log('\nTests completed');
  process.exit(0);
}).catch(error => {
  console.error('\nTests failed:', error);
  process.exit(1);
});