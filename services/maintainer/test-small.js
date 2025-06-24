require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testSmallBatch() {
  console.log('Testing with small batch of products...');
  
  // Create test products
  const testProducts = [
    {
      id: 'TEST001',
      name: 'Test Product 1',
      price_cents: 999,
      raw: { id: 'TEST001', name: 'Test Product 1', price: 9.99 }
    },
    {
      id: 'TEST002',
      name: 'Test Product 2',
      price_cents: 1999,
      raw: { id: 'TEST002', name: 'Test Product 2', price: { cents: 1999 } }
    },
    {
      id: 'TEST003',
      name: 'Test Product 3',
      price_cents: null,
      raw: { id: 'TEST003', title: 'Test Product 3' }
    }
  ];
  
  try {
    // Insert test products
    console.log('Inserting test products...');
    const { data, error } = await supabase
      .from('products')
      .insert(testProducts);
    
    if (error) {
      console.error('Insert error:', error);
      return;
    }
    
    console.log('✓ Successfully inserted test products');
    
    // Verify insertion
    const { data: products, error: selectError } = await supabase
      .from('products')
      .select('*')
      .in('id', ['TEST001', 'TEST002', 'TEST003']);
    
    if (selectError) {
      console.error('Select error:', selectError);
      return;
    }
    
    console.log('✓ Found products in database:');
    products.forEach(p => {
      console.log(`  - ${p.id}: ${p.name} ($${(p.price_cents || 0) / 100})`);
    });
    
    // Test update
    console.log('\nTesting update...');
    const { error: updateError } = await supabase
      .from('products')
      .update({ price_cents: 1499 })
      .eq('id', 'TEST001');
    
    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('✓ Successfully updated TEST001');
    }
    
    // Clean up
    console.log('\nCleaning up test data...');
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .in('id', ['TEST001', 'TEST002', 'TEST003']);
    
    if (deleteError) {
      console.error('Delete error:', deleteError);
    } else {
      console.log('✓ Test data cleaned up');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

async function testStorageDownload() {
  console.log('\nTesting storage download...');
  
  try {
    const { data, error } = await supabase.storage
      .from('medipim-raw')
      .download('latest.ndjson');
    
    if (error) {
      console.error('Download error:', error);
      return;
    }
    
    console.log('✓ Successfully downloaded file');
    console.log(`  Size: ${data.size} bytes (${(data.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Read first few lines
    const text = await data.text();
    const lines = text.split('\n').slice(0, 3);
    console.log('\nFirst 3 lines:');
    lines.forEach((line, i) => {
      if (line.trim()) {
        try {
          const obj = JSON.parse(line);
          console.log(`  Line ${i + 1}: ${obj.id || 'no-id'} - ${obj.name || obj.title || 'no-name'}`);
        } catch (e) {
          console.log(`  Line ${i + 1}: Invalid JSON`);
        }
      }
    });
    
  } catch (error) {
    console.error('Storage test failed:', error);
  }
}

async function runTests() {
  await testSmallBatch();
  await testStorageDownload();
}

runTests().then(() => {
  console.log('\nAll tests completed');
  process.exit(0);
}).catch(error => {
  console.error('\nTests failed:', error);
  process.exit(1);
});