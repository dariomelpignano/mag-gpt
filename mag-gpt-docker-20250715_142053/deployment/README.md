# 🚀 MAG-GPT AWS Deployment Guide

This guide explains how to deploy MAG-GPT on a dedicated AWS EC2 instance.

## 📋 Prerequisites

### AWS Setup
1. **EC2 Instance**: Ubuntu 20.04 LTS or newer
   - Recommended: `t3.medium` or larger (2+ vCPU, 4+ GB RAM)
   - Storage: 20+ GB SSD
   - Security Group: Allow inbound ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 3000 (development)

2. **Key Pair**: Download your `.pem` key file

3. **LM Studio Server**: Separate machine running LM Studio with:
   - `text-embedding-nomic-embed-text-v2-moe` model loaded
   - API accessible at `http://your-lm-studio-ip:5002`

### Local Requirements
- SSH client
- SCP/RSYNC capability
- Basic shell access

## 🚀 Quick Deployment

### Step 1: Configure Environment
```bash
# Set your deployment variables
export INSTANCE_IP="your-ec2-public-ip"
export KEY_PATH="~/.ssh/your-key.pem" 
export LM_STUDIO_URL="http://your-lm-studio-ip:5002"
export DOMAIN_NAME="yourdomain.com"  # Optional

# Make sure key has correct permissions
chmod 400 ~/.ssh/your-key.pem
```

### Step 2: Run Deployment Script
```bash
cd deployment
chmod +x deploy-aws.sh
./deploy-aws.sh
```

The script will:
- ✅ Install Docker on your EC2 instance
- ✅ Upload your MAG-GPT code
- ✅ Build the Docker container
- ✅ Start the application
- ✅ Configure health checks

### Step 3: Access Your App
- **Direct access**: `http://your-ec2-ip:3000`
- **With domain**: `https://yourdomain.com` (after SSL setup)

## 🔐 User Management

### Adding Users
Users are defined via environment variables. Edit the `.env` file on your server:

```bash
# SSH to your server
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip

# Edit environment file
cd ~/mag-gpt
nano .env

# Add users in format: USER_email_domain_com=password
USER_john_company_com=securepassword123
USER_jane_company_com=anotherpassword456

# Restart the application
sudo docker compose restart
```

### User Format
- Email: `john@company.com` → Variable: `USER_john_company_com`
- Email: `jane.doe@example.org` → Variable: `USER_jane_doe_example_org`

## 🔧 Configuration

### Environment Variables
Edit `/home/ubuntu/mag-gpt/.env`:

```bash
NODE_ENV=production
LM_STUDIO_BASE_URL=http://your-lm-studio-ip:5002
LM_STUDIO_EMBEDDINGS_MODEL=text-embedding-nomic-embed-text-v2-moe
NEXTAUTH_SECRET=your-generated-secret
NEXTAUTH_URL=https://yourdomain.com

# Add your users
USER_colleague_company_com=securepassword123
USER_admin_company_com=adminpassword456
```

### LM Studio Connection
Make sure your LM Studio server:
1. Has the embedding model loaded: `text-embedding-nomic-embed-text-v2-moe`
2. Is accessible from your EC2 instance
3. Has CORS enabled if needed

## 🛡️ SSL Certificate Setup

### Option 1: Let's Encrypt (Free)
```bash
# SSH to your server
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip

# Install certbot
sudo apt update
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates
sudo mkdir -p ~/mag-gpt/deployment/ssl
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ~/mag-gpt/deployment/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ~/mag-gpt/deployment/ssl/key.pem
sudo chown ubuntu:ubuntu ~/mag-gpt/deployment/ssl/*

# Restart with SSL
cd ~/mag-gpt
sudo docker compose restart nginx
```

### Option 2: Self-Signed (Development)
```bash
# SSH to your server
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip

# Create self-signed certificate
mkdir -p ~/mag-gpt/deployment/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ~/mag-gpt/deployment/ssl/key.pem \
  -out ~/mag-gpt/deployment/ssl/cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=yourdomain.com"

# Restart nginx
cd ~/mag-gpt
sudo docker compose restart nginx
```

## 🔍 Monitoring & Maintenance

### View Logs
```bash
# Application logs
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose logs -f mag-gpt'

# Nginx logs
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose logs -f nginx'

# All services
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose logs -f'
```

### Restart Services
```bash
# Restart application only
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose restart mag-gpt'

# Restart all services
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose restart'

# Stop all services
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose down'

# Start all services
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose up -d'
```

### Health Checks
```bash
# Check if services are running
ssh -i ~/.ssh/your-key.pem ubuntu@your-ec2-ip 'cd ~/mag-gpt && sudo docker compose ps'

# Test application endpoint
curl http://your-ec2-ip:3000/api/models

# Test nginx health
curl http://your-ec2-ip/health
```

### Updates
To update the application:
1. Make changes to your local code
2. Re-run the deployment script: `./deploy-aws.sh`

## 🚨 Troubleshooting

### Common Issues

**1. Connection Refused**
- Check security group allows port 3000/80/443
- Verify Docker containers are running: `sudo docker compose ps`

**2. LM Studio Connection Failed**
- Test connectivity: `curl http://your-lm-studio-ip:5002/v1/models`
- Check firewall settings on LM Studio server
- Verify LM Studio is running and accessible

**3. SSL Certificate Issues**
- Check certificate files exist in `~/mag-gpt/deployment/ssl/`
- Verify domain DNS points to your EC2 IP
- Check Let's Encrypt rate limits

**4. File Upload Errors**
- Check disk space: `df -h`
- Verify permissions on upload directory
- Check nginx client_max_body_size setting

### Performance Tuning

**For High Traffic:**
```bash
# Scale up the application
cd ~/mag-gpt
# Edit docker-compose.yml to add more replicas
sudo docker compose up -d --scale mag-gpt=3
```

**For Large Files:**
- Increase `client_max_body_size` in nginx.conf
- Add more storage to EC2 instance
- Consider using S3 for file storage

## 📞 Support

If you encounter issues:
1. Check the logs first
2. Verify all prerequisites are met
3. Test connectivity to LM Studio
4. Check AWS security groups and firewall rules

For production deployments, consider:
- Using an Application Load Balancer
- Setting up auto-scaling groups
- Implementing CloudWatch monitoring
- Using RDS for session storage
- Setting up automated backups 