require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCount() {
  console.log('Checking product count in database...');
  
  const { count, error } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`Total products in database: ${count}`);
  }
  
  // Get a sample
  const { data: sample, error: sampleError } = await supabase
    .from('products')
    .select('id, name, price_cents')
    .limit(5);
  
  if (!sampleError && sample) {
    console.log('\nSample products:');
    sample.forEach(p => {
      console.log(`- ${p.id}: ${p.name} ($${(p.price_cents || 0) / 100})`);
    });
  }
}

checkCount();