require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectData() {
  console.log('Getting sample data from NDJSON file...\n');
  
  try {
    // Get signed URL
    const { data: urlData, error: urlError } = await supabase.storage
      .from('medipim-raw')
      .createSignedUrl('latest.ndjson', 3600);
    
    if (urlError) throw urlError;
    
    // Download first part of file
    const response = await axios({
      method: 'GET',
      url: urlData.signedUrl,
      headers: {
        'Range': 'bytes=0-10000' // Get first 10KB
      }
    });
    
    const lines = response.data.split('\n').filter(line => line.trim());
    console.log(`Found ${lines.length} lines in first 10KB\n`);
    
    // Parse first 5 records
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      try {
        const record = JSON.parse(lines[i]);
        console.log(`\nRecord ${i + 1}:`);
        console.log('  Top-level keys:', Object.keys(record).join(', '));
        console.log('  Full structure:', JSON.stringify(record, null, 2).substring(0, 500) + '...');
        
        // Check for nested structures
        if (record.result) {
          console.log('  Has "result" field with keys:', Object.keys(record.result).join(', '));
          if (Array.isArray(record.result)) {
            console.log('  Result is an array with', record.result.length, 'items');
            if (record.result.length > 0) {
              console.log('  First item keys:', Object.keys(record.result[0]).join(', '));
            }
          }
        }
        
        if (record.data) {
          console.log('  Has "data" field with keys:', Object.keys(record.data).join(', '));
        }
      } catch (e) {
        console.error(`Failed to parse line ${i + 1}:`, e.message);
        console.log('  Raw line:', lines[i].substring(0, 200) + '...');
      }
    }
    
  } catch (error) {
    console.error('Inspection failed:', error);
  }
}

inspectData();