# Exchange 360. Node 22 plus PowerShell 7 and ExchangeOnlineManagement, so the container
# can call Connect-ExchangeOnline -AccessToken. No client secret is baked in.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft.gpg \
 && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/microsoft.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends powershell \
 && pwsh -NoProfile -Command "Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; Install-Module ExchangeOnlineManagement -Scope AllUsers -Force" \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY lib ./lib
COPY public ./public
COPY server ./server
# The read-only mail flow export, for the NextHop live read (server/Invoke-Ex360NextHop.ps1).
COPY export ./export
ENV NODE_ENV=production PORT=8360 HOST=0.0.0.0
EXPOSE 8360
USER node
CMD ["node", "server/index.mjs"]
