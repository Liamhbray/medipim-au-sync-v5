#!/bin/bash

# Fly.io Deployment Script for MediPim AU Sync Services

set -e

echo "MediPim AU Sync - Fly.io Deployment"
echo "====================================="

# Check if fly CLI is installed
if ! command -v flyctl &> /dev/null; then
    echo "Error: flyctl CLI not found. Please install from https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Check if logged in
if ! flyctl auth whoami &> /dev/null; then
    echo "Please log in to Fly.io first:"
    flyctl auth login
fi

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_dir=$2
    
    echo ""
    echo "Deploying $service_name..."
    echo "------------------------"
    
    cd "$service_dir"
    
    # Create app if it doesn't exist
    if ! flyctl apps list | grep -q "$service_name"; then
        echo "Creating app: $service_name"
        flyctl apps create "$service_name" --org personal
    fi
    
    # Deploy the service
    flyctl deploy --remote-only
    
    cd - > /dev/null
}

# Function to set secrets for a service
set_secrets() {
    local app_name=$1
    shift
    local secrets=("$@")
    
    echo "Setting secrets for $app_name..."
    flyctl secrets set "${secrets[@]}" --app "$app_name"
}

# Main deployment flow
echo ""
echo "This script will deploy three services to Fly.io:"
echo "1. medipim-fetcher"
echo "2. medipim-maintainer"
echo "3. medipim-orchestrator"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Check for .env file
if [ ! -f "../../.env" ]; then
    echo "Error: .env file not found in project root"
    echo "Please create .env file with required configuration"
    exit 1
fi

# Load environment variables
source ../../.env

# Deploy services
deploy_service "medipim-fetcher" "../../services/fetcher"
deploy_service "medipim-maintainer" "../../services/maintainer"
deploy_service "medipim-orchestrator" "../../services/orchestrator"

echo ""
echo "Setting environment secrets..."
echo "------------------------------"

# Set secrets for fetcher
set_secrets "medipim-fetcher" \
    "MEDIPIM_API_URL=$MEDIPIM_API_URL" \
    "MEDIPIM_API_KEY_ID=$MEDIPIM_API_KEY_ID" \
    "MEDIPIM_API_KEY_SECRET=$MEDIPIM_API_KEY_SECRET" \
    "SUPABASE_URL=$SUPABASE_URL" \
    "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
    "ADMIN_KEY=$ADMIN_KEY"

# Set secrets for maintainer
set_secrets "medipim-maintainer" \
    "SUPABASE_URL=$SUPABASE_URL" \
    "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" \
    "ADMIN_KEY=$ADMIN_KEY" \
    "BATCH_SIZE=${BATCH_SIZE:-100}"

# Set secrets for orchestrator
set_secrets "medipim-orchestrator" \
    "ADMIN_KEY=$ADMIN_KEY"

echo ""
echo "Deployment complete!"
echo ""
echo "Service URLs:"
echo "- Fetcher: https://medipim-fetcher.fly.dev"
echo "- Maintainer: https://medipim-maintainer.fly.dev"
echo "- Orchestrator: https://medipim-orchestrator.fly.dev"
echo ""
echo "To trigger a sync:"
echo "curl -X POST https://medipim-orchestrator.fly.dev/sync \\"
echo "  -H 'X-ADMIN-KEY: $ADMIN_KEY'"
echo ""
echo "To check sync status:"
echo "curl https://medipim-orchestrator.fly.dev/status \\"
echo "  -H 'X-ADMIN-KEY: $ADMIN_KEY'"