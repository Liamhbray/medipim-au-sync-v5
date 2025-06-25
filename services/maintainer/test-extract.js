require('dotenv').config();

// Test data extraction function
function extractProductData(record) {
  // Handle the MediPim structure where data is in record.result
  const product = record.result || record;
  
  // Extract meta.updatedAt for change detection
  const metaUpdatedAt = record.meta?.updatedAt || null;
  
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
  
  // Extract all new fields
  const status = product.status || null;
  const organization = product.organization || null;
  const brand = product.brand || null;
  const eanGtin13 = product.eanGtin13 || null;
  const eanGtin14 = product.eanGtin14 || null;
  const artgId = product.artgId || null;
  const pbs = product.pbs || null;
  const snomedMpp = product.snomedMpp || null;
  const snomedTpp = product.snomedTpp || null;
  const gs1Category = product.gs1Category || null;
  const createdAt = product.createdAt ? new Date(product.createdAt) : null;
  const updatedSince = product.updatedSince ? new Date(product.updatedSince) : null;
  
  return {
    id,
    name: name.substring(0, 255), // Limit name length
    status,
    organization,
    brand,
    eanGtin13,
    eanGtin14,
    artgId,
    pbs,
    snomedMpp,
    snomedTpp,
    gs1Category,
    createdAt,
    updatedSince,
    metaUpdatedAt: metaUpdatedAt ? new Date(metaUpdatedAt * 1000) : null, // Convert unix timestamp to Date
    raw: product // Store just the result, not the meta wrapper
  };
}

// Test with sample data
const testRecord = {
  "meta": {
    "total": 108022,
    "index": 0,
    "updatedAt": 1735120800  // Unix timestamp: 2024-12-25 10:00:00 UTC
  },
  "result": {
    "id": "M34C3D3A5E",
    "name": {
      "en": "Apo-lansoprazole Cap 30mg 28"
    },
    "status": "active",
    "publicPrice": 12.99,
    "pharmacistPrice": 10.50,
    "manufacturerPrice": 8.00
  }
};

console.log('Testing data extraction...\n');
const extracted = extractProductData(testRecord);
console.log('Extracted data:', JSON.stringify(extracted, null, 2));

// Test direct insert
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
  console.log('\nTesting database insert...');
  
  // Clean up any test record first
  await supabase.from('products').delete().eq('id', extracted.id);
  
  const { error } = await supabase
    .from('products')
    .insert([extracted]);
  
  if (error) {
    console.error('Insert error:', error);
  } else {
    console.log('✓ Insert successful');
    
    // Verify
    const { data: product, error: selectError } = await supabase
      .from('products')
      .select('*')
      .eq('id', extracted.id)
      .single();
    
    if (selectError) {
      console.error('Select error:', selectError);
    } else {
      console.log('✓ Product in database:', {
        id: product.id,
        name: product.name,
        price_cents: product.price_cents
      });
    }
    
    // Clean up
    await supabase.from('products').delete().eq('id', extracted.id);
    console.log('✓ Cleaned up test data');
  }
}

testInsert().then(() => {
  console.log('\nTest completed successfully!');
  process.exit(0);
}).catch(error => {
  console.error('\nTest failed:', error);
  process.exit(1);
});