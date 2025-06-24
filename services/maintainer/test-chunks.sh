#!/bin/bash

# Process MediPim data in chunks
echo "Processing MediPim data in chunks..."

# Process chunks of 10,000 records at a time
for offset in 0 10000 20000 30000 40000 50000 60000 70000 80000 90000 100000; do
  echo ""
  echo "Processing chunk starting at offset $offset..."
  
  curl -X POST http://localhost:3002/run \
    -H "X-ADMIN-KEY: your-secure-admin-key-here" \
    -H "Content-Type: application/json" \
    -d "{\"offset\": $offset, \"limit\": 10000}" \
    -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n"
  
  # Wait a bit between chunks to avoid overwhelming the system
  sleep 2
done

echo ""
echo "All chunks processed!"