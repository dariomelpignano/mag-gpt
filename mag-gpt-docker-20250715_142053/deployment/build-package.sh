#!/bin/bash

# MAG-GPT Build and Package Script
# Creates a deployable package for AWS EC2

set -e

echo "📦 MAG-GPT Build and Package Script"
echo "====================================="

# Configuration
PACKAGE_NAME="mag-gpt-deployment-$(date +%Y%m%d_%H%M%S)"
PACKAGE_DIR="./packages"
BUILD_DIR="$PACKAGE_DIR/$PACKAGE_NAME"

echo "🏗️  Creating package: $PACKAGE_NAME"

# Create package directory
mkdir -p "$BUILD_DIR"

# Copy application files
echo "📋 Copying application files..."
rsync -av \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'out' \
  --exclude '.git' \
  --exclude 'packages' \
  --exclude '*.log' \
  --exclude '.env*' \
  --exclude 'data' \
  ../ "$BUILD_DIR/"

# Copy deployment files
echo "🚀 Copying deployment configuration..."
cp -r ./* "$BUILD_DIR/deployment/"

# Create package info
cat > "$BUILD_DIR/PACKAGE_INFO.txt" << EOF
MAG-GPT Deployment Package
==========================

Package: $PACKAGE_NAME
Created: $(date)
Version: $(cd .. && git rev-parse --short HEAD 2>/dev/null || echo "unknown")

Contents:
- Complete MAG-GPT application source code
- Docker configuration (Dockerfile, docker-compose.yml)
- AWS deployment scripts (deployment/deploy-aws.sh)
- Nginx configuration for production
- Comprehensive deployment guide (deployment/README.md)

Quick Start:
1. Extract this package on your local machine
2. Configure your AWS credentials and EC2 instance
3. Run: cd deployment && ./deploy-aws.sh

For detailed instructions, see deployment/README.md

Requirements:
- AWS EC2 instance (Ubuntu 20.04+)
- LM Studio server with text-embedding-nomic-embed-text-v2-moe
- SSH access to EC2 instance
EOF

# Create .dockerignore if it doesn't exist
if [ ! -f "$BUILD_DIR/.dockerignore" ]; then
    cat > "$BUILD_DIR/.dockerignore" << EOF
node_modules
.next
.git
*.log
.env*
README.md
packages
data
deployment/packages
EOF
fi

# Create archive
echo "📦 Creating archive..."
cd "$PACKAGE_DIR"
tar -czf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME"
rm -rf "$PACKAGE_NAME"

# Calculate size and checksum
PACKAGE_SIZE=$(du -h "${PACKAGE_NAME}.tar.gz" | cut -f1)
PACKAGE_CHECKSUM=$(shasum -a 256 "${PACKAGE_NAME}.tar.gz" | cut -d' ' -f1)

echo ""
echo "✅ Package created successfully!"
echo ""
echo "📍 Package Details:"
echo "   Name: ${PACKAGE_NAME}.tar.gz"
echo "   Location: $PACKAGE_DIR/${PACKAGE_NAME}.tar.gz"
echo "   Size: $PACKAGE_SIZE"
echo "   SHA256: $PACKAGE_CHECKSUM"
echo ""
echo "📋 Next Steps:"
echo "   1. Transfer the package to your deployment machine"
echo "   2. Extract: tar -xzf ${PACKAGE_NAME}.tar.gz"
echo "   3. Follow instructions in deployment/README.md"
echo ""
echo "🚀 Quick deployment command:"
echo "   cd ${PACKAGE_NAME}/deployment"
echo "   INSTANCE_IP=your-ec2-ip ./deploy-aws.sh"
echo "" 