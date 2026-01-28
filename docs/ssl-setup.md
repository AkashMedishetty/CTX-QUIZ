# SSL/TLS Certificate Setup for CTX Quiz Platform

This document describes how to set up SSL/TLS certificates for secure WebSocket (WSS) connections in production.

## Overview

The CTX Quiz platform requires secure WebSocket connections (WSS) in production to:
- Encrypt real-time quiz data in transit
- Protect participant answers and session tokens
- Meet security requirement 9.10

## Prerequisites

- A registered domain name pointing to your server
- Docker and Docker Compose installed
- Port 80 and 443 accessible from the internet

## Option 1: Let's Encrypt (Recommended for Production)

Let's Encrypt provides free, automated SSL certificates.

### Step 1: Create SSL Directory Structure

```bash
mkdir -p ssl/certbot/conf
mkdir -p ssl/certbot/www
```

### Step 2: Update docker-compose.yml

Add the certbot service to your `docker-compose.yml`:

```yaml
services:
  # ... existing services ...

  certbot:
    image: certbot/certbot
    volumes:
      - ./ssl/certbot/conf:/etc/letsencrypt
      - ./ssl/certbot/www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl/certbot/conf:/etc/letsencrypt:ro
      - ./ssl/certbot/www:/var/www/certbot:ro
    depends_on:
      - backend
      - frontend
```

### Step 3: Obtain Initial Certificate

Run the following command to obtain your initial certificate:

```bash
# Replace yourdomain.com with your actual domain
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d yourdomain.com \
  -d www.yourdomain.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### Step 4: Update nginx.conf Certificate Paths

Update the SSL certificate paths in `nginx.conf`:

```nginx
ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
```

### Step 5: Enable HTTPS Redirect

Uncomment the redirect line in the HTTP server block:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Enable this for production
    return 301 https://$server_name$request_uri;
    
    # ... rest of config ...
}
```

### Step 6: Restart Services

```bash
docker-compose down
docker-compose up -d
```

### Certificate Renewal

Let's Encrypt certificates expire every 90 days. The certbot container automatically handles renewal. You can manually trigger renewal with:

```bash
docker-compose run --rm certbot renew
```

## Option 2: Self-Signed Certificates (Development/Testing Only)

For local development or testing, you can use self-signed certificates.

### Generate Self-Signed Certificate

```bash
# Create SSL directory
mkdir -p ssl

# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/privkey.pem \
  -out ssl/fullchain.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

### Update docker-compose.yml

```yaml
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf:ro
    - ./ssl:/etc/nginx/ssl:ro
```

**Note:** Self-signed certificates will show browser warnings. Only use for development.

## Option 3: Commercial SSL Certificate

For enterprise deployments, you may use commercial SSL certificates.

### Step 1: Purchase Certificate

Purchase an SSL certificate from a trusted CA (e.g., DigiCert, Comodo, GlobalSign).

### Step 2: Install Certificate Files

Place your certificate files in the ssl directory:
- `fullchain.pem` - Your certificate + intermediate certificates
- `privkey.pem` - Your private key

### Step 3: Update nginx.conf

```nginx
ssl_certificate /etc/nginx/ssl/fullchain.pem;
ssl_certificate_key /etc/nginx/ssl/privkey.pem;
```

## Verifying WSS Configuration

### Test WebSocket Connection

After setting up SSL, verify WSS is working:

```javascript
// Browser console test
const socket = io('wss://yourdomain.com', {
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('WSS connection successful!');
});

socket.on('connect_error', (error) => {
  console.error('WSS connection failed:', error);
});
```

### Check SSL Configuration

Use SSL Labs to verify your SSL configuration:
```
https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

### Verify WebSocket Upgrade

Check that WebSocket upgrade headers are working:

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  https://yourdomain.com/socket.io/?EIO=4&transport=websocket
```

## Nginx Configuration Details

### Key WebSocket Settings

The nginx.conf includes these critical settings for WSS:

```nginx
# WebSocket upgrade map
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /socket.io/ {
    # Required for WebSocket upgrade
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    
    # Long timeout for persistent connections (24 hours)
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    
    # Disable buffering for real-time data
    proxy_buffering off;
    
    # Keep connections alive
    proxy_socket_keepalive on;
}
```

### SSL Security Settings

The configuration uses modern SSL settings:

- **Protocols:** TLSv1.2 and TLSv1.3 only (no legacy protocols)
- **Ciphers:** Strong cipher suites with forward secrecy
- **HSTS:** Strict Transport Security enabled
- **OCSP Stapling:** Enabled for faster certificate validation

## Troubleshooting

### WebSocket Connection Fails

1. Check that port 443 is open in your firewall
2. Verify SSL certificate is valid and not expired
3. Check nginx error logs: `docker-compose logs nginx`
4. Ensure backend is running: `docker-compose logs backend`

### Certificate Errors

1. Verify certificate chain is complete (fullchain.pem)
2. Check certificate matches domain name
3. Ensure private key matches certificate

### Mixed Content Warnings

If your frontend is served over HTTPS but tries to connect via WS (not WSS):

1. Update Socket.IO client to use secure connection:
```javascript
const socket = io({
  secure: true,
  transports: ['websocket', 'polling']
});
```

2. Or let Socket.IO auto-detect protocol:
```javascript
const socket = io(); // Automatically uses WSS when page is HTTPS
```

## Security Recommendations

1. **Always use HTTPS in production** - Never serve the quiz platform over HTTP in production
2. **Enable HSTS** - Forces browsers to use HTTPS
3. **Regular certificate renewal** - Set up automated renewal with certbot
4. **Monitor certificate expiration** - Set up alerts before certificates expire
5. **Use strong ciphers** - The provided configuration uses modern, secure ciphers

## Related Documentation

- [Nginx SSL Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Socket.IO HTTPS Setup](https://socket.io/docs/v4/using-multiple-nodes/)
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/)
