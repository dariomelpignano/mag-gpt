#!/bin/bash

# MAG-GPT AWS EC2 Deployment Script
# This script deploys MAG-GPT to an AWS EC2 instance

set -e

echo "🚀 MAG-GPT AWS Deployment Script"
echo "================================="

# Configuration
INSTANCE_USER=${INSTANCE_USER:-"ubuntu"}
INSTANCE_IP=${INSTANCE_IP}
KEY_PATH=${KEY_PATH:-"~/.ssh/your-key.pem"}
LM_STUDIO_URL=${LM_STUDIO_URL:-"http://192.168.97.3:5002"}
DOMAIN_NAME=${DOMAIN_NAME:-""}

# Check required variables
if [ -z "$INSTANCE_IP" ]; then
    echo "❌ Error: INSTANCE_IP is required"
    echo "Usage: INSTANCE_IP=your-ec2-ip ./deploy-aws.sh"
    exit 1
fi

echo "📋 Deployment Configuration:"
echo "   Instance: $INSTANCE_USER@$INSTANCE_IP"
echo "   Key: $KEY_PATH"
echo "   LM Studio: $LM_STUDIO_URL"
echo "   Domain: ${DOMAIN_NAME:-"Not set (will use IP)"}"
echo ""

# Function to run commands on remote server
run_remote() {
    ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$INSTANCE_USER@$INSTANCE_IP" "$1"
}

# Function to copy files to remote server
copy_to_remote() {
    scp -i "$KEY_PATH" -o StrictHostKeyChecking=no -r "$1" "$INSTANCE_USER@$INSTANCE_IP:$2"
}

echo "🔧 Step 1: Installing Docker and dependencies on EC2..."
run_remote "
    sudo apt-get update
    sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo \"deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable\" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker $USER
    sudo systemctl enable docker
    sudo systemctl start docker
"

echo "📦 Step 2: Creating project directory..."
run_remote "mkdir -p ~/mag-gpt"

echo "📤 Step 3: Uploading project files..."
copy_to_remote "../" "~/mag-gpt/"

echo "🔐 Step 4: Setting up environment variables..."
run_remote "cd ~/mag-gpt && cat > .env << EOF
NODE_ENV=production
LM_STUDIO_BASE_URL=$LM_STUDIO_URL
LM_STUDIO_EMBEDDINGS_MODEL=text-embedding-nomic-embed-text-v2-moe
NEXTAUTH_SECRET=\$(openssl rand -base64 32)
NEXTAUTH_URL=http://$INSTANCE_IP:3000
USER_colleague_company_com=securepassword123
USER_admin_company_com=adminpassword456
EOF"

echo "🏗️  Step 5: Building and starting the application..."
run_remote "
    cd ~/mag-gpt
    sudo docker compose down --remove-orphans
    sudo docker compose build --no-cache
    sudo docker compose up -d
"

echo "🔍 Step 6: Checking deployment status..."
sleep 10
run_remote "sudo docker compose ps"
run_remote "sudo docker compose logs --tail=20 mag-gpt"

echo "🎉 Deployment Complete!"
echo ""
echo "📍 Your MAG-GPT app should be available at:"
if [ -n "$DOMAIN_NAME" ]; then
    echo "   🌐 https://$DOMAIN_NAME"
    echo "   🌐 http://$DOMAIN_NAME"
else
    echo "   🌐 http://$INSTANCE_IP:3000"
fi
echo ""
echo "🔧 Useful commands:"
echo "   View logs: ssh -i $KEY_PATH $INSTANCE_USER@$INSTANCE_IP 'cd ~/mag-gpt && sudo docker compose logs -f'"
echo "   Restart app: ssh -i $KEY_PATH $INSTANCE_USER@$INSTANCE_IP 'cd ~/mag-gpt && sudo docker compose restart'"
echo "   Update app: Re-run this script"
echo ""
echo "⚠️  Next steps:"
echo "   1. Update your LM Studio URL in the environment if needed"
echo "   2. Configure SSL certificate if using a domain"
echo "   3. Set up user accounts by modifying the .env file"
echo "   4. Configure firewall rules (port 3000 or 80/443)" 