# 🐳 MAG-GPT Docker Deployment

Complete Docker + Docker Compose deployment guide for MAG-GPT with vector embeddings and LM Studio integration.

## 🚀 Quick Start

### **Option 1: One-Command Deployment**
```bash
# Make script executable and run
chmod +x docker-start.sh
./docker-start.sh
```

### **Option 2: Manual Docker Compose**
```bash
# 1. Configure environment
cp docker.env.example .env
nano .env  # Edit LM Studio URL and credentials

# 2. Start with simple deployment
docker-compose -f docker-compose.simple.yml up --build -d

# OR start with full deployment (includes nginx)
docker-compose up --build -d
```

## 📋 Prerequisites

### **Required:**
- Docker and Docker Compose installed
- LM Studio server running with `text-embedding-nomic-embed-text-v2-moe` model
- 4GB+ RAM for the container

### **Install Docker:**
```bash
# macOS
brew install --cask docker

# Ubuntu/Debian
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Windows: Download Docker Desktop
```

## ⚙️ Configuration

### **Environment Setup**
Edit `.env` file (created from `docker.env.example`):

```bash
# Your LM Studio server
LM_STUDIO_BASE_URL=http://192.168.97.3:5002

# Security
NEXTAUTH_SECRET=your-secure-random-string-here
NEXTAUTH_URL=http://localhost:3000

# Add users (email format: user@domain.com → USER_user_domain_com)
USER_admin_company_com=securepassword123
USER_john_doe_com=johnpassword456
```

### **LM Studio Requirements**
Your LM Studio server must have:
1. **Embedding Model**: `text-embedding-nomic-embed-text-v2-moe` loaded
2. **API Access**: Accessible at your configured URL
3. **Network**: Reachable from Docker container

## 🎯 Deployment Options

### **Simple Deployment (Recommended)**
```bash
# Uses docker-compose.simple.yml - app only
./docker-start.sh
```
- ✅ **Direct access**: `http://localhost:3000`
- ✅ **No nginx complexity**
- ✅ **Perfect for development/testing**

### **Full Production Deployment**
```bash
# Uses docker-compose.yml - app + nginx + SSL
./docker-start.sh --full
```
- ✅ **Nginx reverse proxy**
- ✅ **SSL/HTTPS ready**
- ✅ **Rate limiting**
- ✅ **Production security headers**

### **Development with Hot Reload**
```bash
# Uses docker-compose.ngrok.yml - includes ngrok
docker-compose -f docker-compose.ngrok.yml up --build -d
```

## 🔧 Management Commands

### **Container Management**
```bash
# View status
docker-compose -f docker-compose.simple.yml ps

# View logs
docker-compose -f docker-compose.simple.yml logs -f

# Restart
docker-compose -f docker-compose.simple.yml restart

# Stop
docker-compose -f docker-compose.simple.yml down

# Rebuild after code changes
docker-compose -f docker-compose.simple.yml up --build -d
```

### **Data Management**
```bash
# View volumes
docker volume ls | grep mag-gpt

# Backup data
docker run --rm -v mag-gpt_mag-gpt-data:/data alpine tar czf - -C /data . > mag-gpt-backup.tar.gz

# Restore data
docker run --rm -v mag-gpt_mag-gpt-data:/data alpine sh -c "cd /data && tar xzf -" < mag-gpt-backup.tar.gz
```

## 🔍 Health Checks & Monitoring

### **Application Health**
```bash
# Test app is running
curl http://localhost:3000/api/models

# Test LM Studio connection
curl http://your-lm-studio-ip:5002/v1/models

# View real-time logs
docker logs -f mag-gpt-app
```

### **Container Stats**
```bash
# Resource usage
docker stats mag-gpt-app

# Container details
docker inspect mag-gpt-app
```

## 🛠️ Troubleshooting

### **Common Issues**

**1. Container won't start**
```bash
# Check logs
docker-compose logs mag-gpt

# Check if port 3000 is busy
lsof -i :3000
```

**2. Can't connect to LM Studio**
```bash
# Test connectivity from container
docker exec -it mag-gpt-app wget -qO- http://your-lm-studio-ip:5002/v1/models

# Check if LM Studio allows external connections
curl http://your-lm-studio-ip:5002/v1/models
```

**3. Authentication not working**
```bash
# Check environment variables are loaded
docker exec -it mag-gpt-app printenv | grep USER_

# Restart after .env changes
docker-compose restart
```

**4. Out of disk space**
```bash
# Clean up Docker
docker system prune -a

# Clean up unused volumes
docker volume prune
```

### **Performance Issues**

**Slow startup:**
- Increase Docker memory allocation (4GB+)
- Use SSD storage for Docker
- Check LM Studio server performance

**High memory usage:**
- Monitor with `docker stats`
- Consider reducing embedding cache size
- Use Docker resource limits

## 🔒 Security Considerations

### **Production Security**
1. **Change default passwords** in `.env`
2. **Use strong NEXTAUTH_SECRET**
3. **Enable HTTPS** with nginx deployment
4. **Firewall rules** for port access
5. **Regular updates** of Docker images

### **Network Security**
```bash
# Run on custom network
docker network create mag-gpt-secure
# Add network: mag-gpt-secure to compose file
```

## 📊 Monitoring & Logs

### **Application Logs**
```bash
# Real-time logs
docker-compose logs -f mag-gpt

# Last 100 lines
docker-compose logs --tail=100 mag-gpt

# Specific timeframe
docker-compose logs --since="1h" mag-gpt
```

### **System Monitoring**
```bash
# Resource usage
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Health status
docker-compose ps
```

## 🚀 Scaling & Performance

### **Horizontal Scaling**
```bash
# Run multiple app instances
docker-compose up --scale mag-gpt=3 -d
```

### **Resource Limits**
Add to `docker-compose.yml`:
```yaml
services:
  mag-gpt:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          memory: 2G
```

## 🔄 Updates & Maintenance

### **Update Application**
```bash
# Pull latest code
git pull

# Rebuild and restart
./docker-start.sh

# OR manual update
docker-compose down
docker-compose up --build -d
```

### **Backup Strategy**
```bash
# Regular backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker run --rm -v mag-gpt_mag-gpt-data:/data alpine tar czf - -C /data . > "backup_${DATE}.tar.gz"
```

## 📞 Support

**Useful Commands:**
- **Status**: `docker-compose ps`
- **Logs**: `docker-compose logs -f`
- **Shell**: `docker exec -it mag-gpt-app sh`
- **Reset**: `docker-compose down -v && docker-compose up --build -d`

**Common URLs:**
- **App**: http://localhost:3000
- **Health**: http://localhost:3000/api/models
- **Docker UI**: http://localhost:9000 (if Portainer installed)

Your MAG-GPT app is now fully containerized and ready for deployment anywhere Docker runs! 🐳🚀 