# Update Logic Explained

## How the meta.updatedAt Comparison Works

The maintainer service uses MediPim's `meta.updatedAt` timestamp to efficiently determine which products need updating.

### The Process:

1. **MediPim provides a timestamp** with each product:
   ```json
   {
     "meta": {
       "updatedAt": 1735120800  // Unix timestamp when product last changed
     },
     "result": {
       "id": "M34C3D3A5E",
       "name": "Product Name",
       // ... other fields
     }
   }
   ```

2. **We store this timestamp** in our database:
   ```sql
   products table:
   - id: "M34C3D3A5E"
   - metaUpdatedAt: "2024-12-25 10:00:00"  -- Converted from unix timestamp
   - name: "Product Name"
   - ... other fields
   ```

3. **On each sync, we compare timestamps**:
   ```javascript
   // Fetch what we have stored
   SELECT id, metaUpdatedAt FROM products WHERE id IN (...)
   
   // Compare with new data
   if (newData.metaUpdatedAt > storedData.metaUpdatedAt) {
     // Product has been updated in MediPim - update our record
   }
   ```

### Example Scenarios:

#### Scenario 1: Product Updated in MediPim
- Stored in DB: `metaUpdatedAt = 2024-12-24 10:00:00`
- New from API: `meta.updatedAt = 1735207200` (2024-12-26 10:00:00)
- Result: **UPDATE** (new timestamp is newer)

#### Scenario 2: Product Not Changed
- Stored in DB: `metaUpdatedAt = 2024-12-25 10:00:00`
- New from API: `meta.updatedAt = 1735120800` (2024-12-25 10:00:00)
- Result: **SKIP** (timestamps are equal)

#### Scenario 3: New Product
- Stored in DB: (doesn't exist)
- New from API: `meta.updatedAt = 1735120800`
- Result: **INSERT** (product not in database)

### Benefits:

1. **Single comparison** instead of checking every field
2. **Guaranteed accuracy** - MediPim updates this timestamp for ANY change
3. **Efficient queries** - only fetch id and metaUpdatedAt from DB
4. **Fast processing** - simple timestamp comparison is very fast
5. **No false positives** - only updates when truly needed

### Important Notes:

- The `meta.updatedAt` is MediPim's timestamp (when they last modified the product)
- The `updated_at` column is our timestamp (when we last updated our database)
- We trust MediPim's timestamp as the source of truth for changes
- If a product has no `meta.updatedAt`, we treat it as timestamp 0 (always update)