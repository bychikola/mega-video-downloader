#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  YouTube Downloader — VPS Auto-Installer (Ubuntu 20.04 / 22.04)
# ─────────────────────────────────────────────────────────────
#  One-command setup:
#    chmod +x install.sh && sudo ./install.sh
#
#  What it does:
#    1. Updates system packages
#    2. Installs Node.js 20 LTS
#    3. Installs yt-dlp (latest)
#    4. Installs ffmpeg
#    5. Installs PM2 process manager
#    6. Installs nginx + certbot
#    7. Clones this repo, installs deps, builds the app
#    8. Starts app with PM2
#    9. Configures nginx reverse proxy
#   10. Optional: sets up HTTPS via Let's Encrypt
# ─────────────────────────────────────────────────────────────

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ── Config (edit these) ─────────────────────────────────────
DOMAIN="${DOMAIN:-}"               # Your domain (e.g. dl.example.com)
APP_DIR="${APP_DIR:-/opt/youtube-downloader}"
APP_PORT="${APP_PORT:-3000}"
NODE_VERSION="20"

# ── Must be root ────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    err "This script must be run as root: sudo ./install.sh"
    exit 1
fi

# ── Step 1: System update ───────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  YouTube Downloader — VPS Installer"
echo "══════════════════════════════════════════════════════════"
echo ""
log "Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq
log "System up to date."

# ── Step 2: Node.js ─────────────────────────────────────────
if command -v node &>/dev/null; then
    CURRENT_NODE=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$CURRENT_NODE" -ge "$NODE_VERSION" ]]; then
        log "Node.js $(node -v) already installed."
    else
        warn "Node.js $(node -v) found, upgrading to v${NODE_VERSION}..."
        install_node=true
    fi
else
    install_node=true
fi

if [[ "${install_node:-false}" == true ]]; then
    log "Installing Node.js ${NODE_VERSION} LTS..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
    log "Node.js $(node -v) installed."
fi

# ── Step 3: yt-dlp ──────────────────────────────────────────
if command -v yt-dlp &>/dev/null; then
    log "yt-dlp $(yt-dlp --version 2>/dev/null || echo 'ok') already installed."
else
    log "Installing yt-dlp..."
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
    chmod a+rx /usr/local/bin/yt-dlp
    log "yt-dlp installed."
fi

# ── Step 4: ffmpeg ──────────────────────────────────────────
if command -v ffmpeg &>/dev/null; then
    log "ffmpeg already installed."
else
    log "Installing ffmpeg..."
    apt-get install -y ffmpeg
    log "ffmpeg $(ffmpeg -version 2>&1 | head -1 | cut -d' ' -f3) installed."
fi

# ── Step 5: PM2 ─────────────────────────────────────────────
if command -v pm2 &>/dev/null; then
    log "PM2 $(pm2 -v) already installed."
else
    log "Installing PM2..."
    npm install -g pm2
    log "PM2 installed."
fi

# ── Step 6: Nginx ───────────────────────────────────────────
if command -v nginx &>/dev/null; then
    log "nginx already installed."
else
    log "Installing nginx..."
    apt-get install -y nginx
    log "nginx installed."
fi

# ── Step 7: Clone & build ───────────────────────────────────
REPO_URL="https://github.com/bychikola/mega-video-downloader.git"

if [[ -d "$APP_DIR" ]]; then
    warn "App directory $APP_DIR already exists. Pulling latest..."
    cd "$APP_DIR"
    git pull origin main
else
    log "Cloning repository to $APP_DIR..."
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

log "Installing npm dependencies..."
npm install

log "Building Next.js app..."
npm run build

# ── Step 8: Start with PM2 ──────────────────────────────────
log "Starting app with PM2..."

# Stop if already running
pm2 delete youtube-downloader 2>/dev/null || true

PORT="$APP_PORT" pm2 start npm --name "youtube-downloader" -- start -- -p "$APP_PORT"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

log "PM2 process started on port $APP_PORT."

# ── Step 9: Nginx config ────────────────────────────────────
NGINX_CONF="/etc/nginx/sites-available/youtube-downloader"

cat > "$NGINX_CONF" << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN:-_};

    client_max_body_size 4G;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
NGINXEOF

# Enable the site
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/youtube-downloader

# Remove default if it exists (to avoid conflicts)
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
log "nginx configured and reloaded."

# ── Step 10: SSL (if domain provided) ────────────────────────
if [[ -n "$DOMAIN" ]]; then
    if command -v certbot &>/dev/null; then
        log "certbot already installed."
    else
        log "Installing certbot..."
        apt-get install -y certbot python3-certbot-nginx
    fi

    warn "Setting up HTTPS for $DOMAIN..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@${DOMAIN}" 2>&1 || {
        warn "certbot auto-setup failed. Run manually:"
        info "  sudo certbot --nginx -d $DOMAIN"
    }
else
    warn "No domain set. Skipping HTTPS."
    info "To enable HTTPS later, set DOMAIN and re-run:"
    info "  sudo DOMAIN=dl.example.com ./install.sh"
fi

# ── Step 11: Firewall ───────────────────────────────────────
if command -v ufw &>/dev/null; then
    ufw allow 80/tcp 2>/dev/null || true
    ufw allow 443/tcp 2>/dev/null || true
    ufw allow 22/tcp 2>/dev/null || true
    log "Firewall: ports 80, 443, 22 open."
fi

# ── Done ────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Installation complete!${NC}"
echo "══════════════════════════════════════════════════════════"
echo ""
echo -e "  App directory: ${CYAN}$APP_DIR${NC}"
echo -e "  PM2 status:    ${CYAN}pm2 status${NC}"
echo -e "  App logs:      ${CYAN}pm2 logs youtube-downloader${NC}"
echo -e "  Restart app:   ${CYAN}pm2 restart youtube-downloader${NC}"
echo ""

if [[ -n "$DOMAIN" ]]; then
    echo -e "  URL:           ${CYAN}https://$DOMAIN${NC}"
else
    echo -e "  URL:           ${CYAN}http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_SERVER_IP')${NC}"
fi

echo ""
echo -e "  ${YELLOW}To set up a domain, re-run with:${NC}"
echo -e "  ${CYAN}  sudo DOMAIN=dl.example.com ./install.sh${NC}"
echo ""
