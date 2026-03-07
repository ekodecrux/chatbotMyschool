# MySchool Chatbot - Hostinger Deployment Guide

## Overview
This guide provides step-by-step instructions to deploy the MySchool Chatbot on a Hostinger VPS server. The deployment includes setting up the React frontend, Node.js backend with tRPC, MySQL database, and Nginx reverse proxy.

---

## Prerequisites

### Server Requirements
- Hostinger VPS (minimum 1GB RAM, 1 vCPU)
- Ubuntu 22.04 LTS or later
- Root or sudo access
- Domain name pointed to server IP

### Local Requirements
- Git installed
- SSH client
- Node.js 18+ and pnpm

---

## Step 1: Initial Server Setup

### 1.1 Connect to Server
```bash
ssh root@YOUR_SERVER_IP
```

### 1.2 Update System
```bash
apt update && apt upgrade -y
```

### 1.3 Install Essential Packages
```bash
apt install -y curl wget git nano unzip
```

---

## Step 2: Install Required Software

### 2.1 Install Node.js 18+
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
node --version
npm --version
```

### 2.2 Install pnpm
```bash
npm install -g pnpm
pnpm --version
```

### 2.3 Install PM2
```bash
npm install -g pm2
pm2 --version
```

### 2.4 Install MySQL
```bash
apt install -y mysql-server
systemctl start mysql
systemctl enable mysql

# Secure MySQL installation
mysql_secure_installation
```

### 2.5 Install Nginx
```bash
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

---

## Step 3: Setup MySQL Database

### 3.1 Create Database and User
```bash
mysql -u root -p
```

```sql
CREATE DATABASE myschool_chatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'chatbot_user'@'localhost' IDENTIFIED BY 'your_secure_password';

GRANT ALL PRIVILEGES ON myschool_chatbot.* TO 'chatbot_user'@'localhost';

FLUSH PRIVILEGES;

EXIT;
```

### 3.2 Create Tables
```bash
mysql -u chatbot_user -p myschool_chatbot
```

```sql
-- Chat messages table
CREATE TABLE chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    message TEXT NOT NULL,
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session (session_id),
    INDEX idx_created (created_at)
);

-- Search analytics table
CREATE TABLE search_queries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    query VARCHAR(500) NOT NULL,
    translated_query VARCHAR(500),
    language VARCHAR(10) DEFAULT 'en',
    results_count INT DEFAULT 0,
    top_result_url VARCHAR(1000),
    top_result_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_query (query),
    INDEX idx_created (created_at)
);

EXIT;
```

---

## Step 4: Deploy Chatbot Application

### 4.1 Create Application Directory
```bash
mkdir -p /var/www/myschool-chatbot
cd /var/www/myschool-chatbot
```

### 4.2 Clone Repository
```bash
git clone https://github.com/YOUR_ORG/myschool-chatbot.git .
```

### 4.3 Install Dependencies
```bash
pnpm install
```

### 4.4 Configure Environment Variables
```bash
nano .env
```

Add the following:
```
# Server Configuration
NODE_ENV=production
PORT=3006

# Database Configuration
DATABASE_URL=mysql://chatbot_user:your_secure_password@localhost:3306/myschool_chatbot

# API Keys
GROQ_API_KEY=gsk_your_groq_api_key_here

# Portal Integration
PORTAL_API_URL=https://portal.myschoolct.com/api/rest

# Optional
SKIP_AUTH=true
OPENAI_API_KEY=sk_your_openai_key_if_needed
```

### 4.5 Build Application
```bash
pnpm run build
```

### 4.6 Test Application
```bash
node dist/index.js
# Should show: Server running on http://localhost:3006/
# Press Ctrl+C to stop
```

---

## Step 5: Setup PM2 Process Manager

### 5.1 Create PM2 Ecosystem File
```bash
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'myschool-chatbot',
    script: 'dist/index.js',
    cwd: '/var/www/myschool-chatbot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3006
    },
    error_file: '/var/log/pm2/chatbot-error.log',
    out_file: '/var/log/pm2/chatbot-out.log',
    time: true
  }]
};
```

### 5.2 Create Log Directory
```bash
mkdir -p /var/log/pm2
```

### 5.3 Start Application with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5.4 Verify Application
```bash
pm2 status
pm2 logs myschool-chatbot
curl http://localhost:3006
```

---

## Step 6: Configure Nginx

### 6.1 Create Nginx Configuration
```bash
nano /etc/nginx/sites-available/myschoolchatbot.in
```

```nginx
server {
    listen 80;
    server_name myschoolchatbot.in www.myschoolchatbot.in YOUR_SERVER_IP;
    
    # Redirect to HTTPS (after SSL setup)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name myschoolchatbot.in www.myschoolchatbot.in;

    # SSL certificates (will be added by Certbot)
    ssl_certificate /etc/letsencrypt/live/myschoolchatbot.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myschoolchatbot.in/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Proxy all requests to Node.js
    location / {
        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }

    # API endpoint
    location /api/ {
        proxy_pass http://127.0.0.1:3006/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
}
```

### 6.2 Enable Site
```bash
ln -s /etc/nginx/sites-available/myschoolchatbot.in /etc/nginx/sites-enabled/
```

### 6.3 Test and Reload Nginx
```bash
nginx -t
systemctl reload nginx
```

---

## Step 7: SSL Certificate Setup

### 7.1 Install Certbot
```bash
apt install -y certbot python3-certbot-nginx
```

### 7.2 Obtain SSL Certificate
```bash
certbot --nginx -d myschoolchatbot.in -d www.myschoolchatbot.in
```

### 7.3 Verify Auto-Renewal
```bash
certbot renew --dry-run
```

---

## Step 8: Firewall Configuration

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

---

## Step 9: Verify Deployment

### 9.1 Check All Services
```bash
# Check PM2
pm2 status

# Check Nginx
systemctl status nginx

# Check MySQL
systemctl status mysql

# Check Ports
netstat -tulnp | grep -E '3006|80|443|3306'
```

### 9.2 Test Endpoints
```bash
# Test local
curl http://localhost:3006

# Test via Nginx
curl https://myschoolchatbot.in

# Test API
curl -X POST https://myschoolchatbot.in/api/trpc/chatbot.chat \
  -H "Content-Type: application/json" \
  -d '{"json":{"message":"hello","sessionId":"test123"}}'
```

---

## Monitoring and Maintenance

### View Logs
```bash
# PM2 logs
pm2 logs myschool-chatbot

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# MySQL logs
tail -f /var/log/mysql/error.log
```

### Restart Services
```bash
# Restart chatbot
pm2 restart myschool-chatbot

# Restart Nginx
systemctl restart nginx

# Restart MySQL
systemctl restart mysql
```

### Update Application
```bash
cd /var/www/myschool-chatbot
git pull origin main
pnpm install
pnpm run build
pm2 restart myschool-chatbot
```

---

## Backup Configuration

### Create Backup Script
```bash
nano /root/backup-chatbot.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/root/backups/chatbot"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup MySQL database
mysqldump -u chatbot_user -p'your_password' myschool_chatbot > $BACKUP_DIR/db_$DATE.sql

# Backup .env file
cp /var/www/myschool-chatbot/.env $BACKUP_DIR/env_$DATE

# Keep only last 7 days
find $BACKUP_DIR -mtime +7 -delete

echo "Backup completed: $DATE"
```

```bash
chmod +x /root/backup-chatbot.sh
```

### Schedule Daily Backup
```bash
crontab -e

# Add:
0 3 * * * /root/backup-chatbot.sh >> /var/log/chatbot-backup.log 2>&1
```

---

## Troubleshooting

### Application Won't Start
```bash
# Check PM2 logs
pm2 logs myschool-chatbot --lines 50

# Check if port is in use
netstat -tulnp | grep 3006

# Verify environment
cat /var/www/myschool-chatbot/.env
```

### Database Connection Issues
```bash
# Test MySQL connection
mysql -u chatbot_user -p -e "SELECT 1"

# Check MySQL status
systemctl status mysql
```

### Nginx 502 Bad Gateway
```bash
# Check if chatbot is running
pm2 status

# Check Nginx config
nginx -t

# Check Nginx error log
tail -f /var/log/nginx/error.log
```

### Translation Not Working
```bash
# Check Groq API key
grep GROQ_API_KEY /var/www/myschool-chatbot/.env

# Test API key
curl -s https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer YOUR_GROQ_API_KEY" | head -20
```

---

## Quick Reference Commands

| Action | Command |
|--------|---------|
| Start chatbot | `pm2 start myschool-chatbot` |
| Stop chatbot | `pm2 stop myschool-chatbot` |
| Restart chatbot | `pm2 restart myschool-chatbot` |
| View logs | `pm2 logs myschool-chatbot` |
| Check status | `pm2 status` |
| Reload Nginx | `systemctl reload nginx` |
| Update code | `git pull && pnpm build && pm2 restart myschool-chatbot` |

---

## Security Checklist

- [ ] Strong MySQL password set
- [ ] Firewall enabled (UFW)
- [ ] SSL certificate installed
- [ ] Environment file secured (chmod 600)
- [ ] PM2 running as non-root (optional)
- [ ] Regular backups configured
- [ ] Log rotation configured

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Developer:** info@expertaid.in
