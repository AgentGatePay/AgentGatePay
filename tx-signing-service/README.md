# AgentGatePay Transaction Signing Service

**One-Click Deploy for Autonomous n8n Payments**

This is a lightweight transaction signing service that enables autonomous AI agent payments in n8n workflows. Deploy to Railway in 2 minutes, then use in n8n to sign blockchain transactions automatically.

---

## Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/agentgatepay)

**Setup time:** 4 minutes
**Cost:** $0/month (Railway free tier)

---

## What Is This?

This service implements the **x402 Facilitator Pattern** - an official pattern from the x402 payment protocol specification. It allows n8n workflows (which cannot import crypto libraries) to sign blockchain transactions by calling a simple HTTP API.

### What It Does

1. Receives payment requests from n8n (HTTP POST)
2. Signs ERC20 token transfers using your wallet
3. Broadcasts transactions to blockchain
4. Returns tx_hash for payment verification

### Security

- ✅ **Your private key stays with YOU** - stored in Railway (not AgentGatePay)
- ✅ **Railway encrypts environment variables** - SOC 2 Type II certified
- ✅ **Open source** - audit the code yourself
- ✅ **You control everything** - delete service anytime

---

## Supported Networks & Tokens

| Chain | USDC | USDT | DAI |
|-------|------|------|-----|
| Ethereum | ✅ | ✅ | ✅ |
| Base | ✅ | ❌ | ✅ |
| Polygon | ✅ | ✅ | ✅ |
| Arbitrum | ✅ | ✅ | ✅ |

---

## Setup Guide

### Step 1: Deploy to Railway (30 seconds)

1. Click the "Deploy on Railway" button above
2. Railway will open with pre-configured service
3. Click "Deploy"
4. Wait for deployment (~30 seconds)
5. Copy your service URL: `https://your-service-abc123.railway.app`

### Step 2: Add Private Key (2 minutes)

1. Go to Railway dashboard
2. Click your deployed service
3. Go to "Variables" tab
4. Click "New Variable"
5. Add:
   - **Name:** `PRIVATE_KEY`
   - **Value:** `0x...` (your wallet private key)
6. Service will auto-restart

**⚠️ Security:**
- Don't use your main wallet - create a new one for agents
- Fund with only what you need
- Railway encrypts environment variables

### Step 3: Fund Your Wallet (2 minutes)

Your wallet needs:
- **ETH (for gas):** $5-10 worth
- **Tokens (for payments):** USDC/USDT/DAI as needed

**Get your wallet address:**
```bash
curl https://your-service-abc123.railway.app/wallet
```

Send funds to that address.

### Step 4: Use in n8n

Import our n8n workflow template (see `/examples/n8n/` folder) or create HTTP Request nodes:

```javascript
// n8n HTTP Request Node
POST https://your-service-abc123.railway.app/sign-and-send

Body (JSON):
{
  "to": "0x742d35...",      // Recipient wallet
  "amount": "15000000",     // 15 USDC (6 decimals)
  "token": "USDC",
  "chain": "base"
}

Response:
{
  "success": true,
  "tx_hash": "0xabc123...",
  "block_number": 12345,
  "explorer_url": "https://basescan.org/tx/0xabc123..."
}
```

---

## API Endpoints

### `GET /health`

Health check - verify service is running.

**Response:**
```json
{
  "status": "healthy",
  "configured": true,
  "supported_chains": ["base", "ethereum", "polygon", "arbitrum"],
  "supported_tokens": ["USDC", "USDT", "DAI"]
}
```

### `GET /wallet`

Get your wallet address.

**Response:**
```json
{
  "address": "0x1234...",
  "message": "Wallet configured successfully"
}
```

### `POST /sign-and-send`

Sign and broadcast ERC20 token transfer.

**Request:**
```json
{
  "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbB",
  "amount": "15000000",
  "token": "USDC",
  "chain": "base"
}
```

**Parameters:**
- `to` (string, required): Recipient wallet address
- `amount` (string, required): Amount in token units (6 decimals for USDC/USDT, 18 for DAI)
- `token` (string, required): Token symbol (USDC, USDT, or DAI)
- `chain` (string, required): Blockchain (base, ethereum, polygon, arbitrum)

**Response (Success):**
```json
{
  "success": true,
  "tx_hash": "0xabc123def456...",
  "from": "0x1234...",
  "to": "0x742d35...",
  "amount": "15000000",
  "token": "USDC",
  "chain": "base",
  "block_number": 12345678,
  "gas_used": "65000",
  "explorer_url": "https://basescan.org/tx/0xabc123...",
  "message": "Transaction signed and confirmed successfully"
}
```

**Response (Error):**
```json
{
  "error": "Insufficient funds",
  "message": "Wallet does not have enough tokens or ETH for gas"
}
```

---

## Testing

### Local Testing

```bash
# Clone repo
git clone https://github.com/agentgatepay/tx-signing-service
cd tx-signing-service

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your PRIVATE_KEY

# Start server
npm start

# Test (in another terminal)
curl http://localhost:3000/health
curl http://localhost:3000/wallet

# Sign transaction (testnet recommended first!)
curl -X POST http://localhost:3000/sign-and-send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbB",
    "amount": "1000000",
    "token": "USDC",
    "chain": "base"
  }'
```

---

## Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PRIVATE_KEY` | ✅ Yes | Wallet private key (0x...) | - |
| `AUTH_TOKEN` | ❌ No | Optional auth token for requests | - |
| `BASE_RPC` | ❌ No | Custom Base RPC endpoint | https://mainnet.base.org |
| `ETHEREUM_RPC` | ❌ No | Custom Ethereum RPC endpoint | https://cloudflare-eth.com |
| `POLYGON_RPC` | ❌ No | Custom Polygon RPC endpoint | https://polygon-rpc.com |
| `ARBITRUM_RPC` | ❌ No | Custom Arbitrum RPC endpoint | https://arb1.arbitrum.io/rpc |
| `PORT` | ❌ No | Server port | 3000 |

### Adding Authentication (Optional)

For extra security, add an AUTH_TOKEN:

1. Railway dashboard → Variables → New Variable
2. Name: `AUTH_TOKEN`, Value: `your_secret_token`
3. In n8n, add header:
   ```
   Authorization: Bearer your_secret_token
   ```

---

## Troubleshooting

### "PRIVATE_KEY not configured"

**Solution:** Add PRIVATE_KEY environment variable in Railway dashboard.

### "Insufficient funds"

**Solution:**
- Check wallet has enough tokens (USDC/USDT/DAI)
- Check wallet has enough ETH for gas ($5-10 worth)

### "Transaction timeout"

**Solution:**
- Transaction was sent but confirmation took > 60 seconds
- Check block explorer (link in error response)
- Transaction probably succeeded, just slow network

### "USDT not supported on base"

**Solution:**
- USDT not widely available on Base yet
- Use USDC or DAI on Base instead
- Or use USDT on Ethereum/Polygon/Arbitrum

---

## Cost

**Railway Free Tier:**
- 500 execution hours/month
- ~16,000 signing requests/month
- **$0/month**

**If you exceed free tier:**
- Hobby plan: $5/month
- Unlimited requests

**Blockchain gas costs:**
- Base: ~$0.01 per transaction
- Polygon: ~$0.01 per transaction
- Arbitrum: ~$0.05 per transaction
- Ethereum: ~$5-50 per transaction (not recommended)

---

## Security Best Practices

1. **Use Separate Wallet**
   - Don't use your main wallet
   - Create dedicated wallet for agent payments
   - Fund with only what you need

2. **Monitor Regularly**
   - Check wallet balance weekly
   - Set up alerts for large transactions
   - Review transaction history

3. **Limit Exposure**
   - Start with small amounts ($10-100)
   - Increase after testing
   - Use AP2 mandates to cap spending

4. **Secure Environment Variables**
   - Never commit .env to git
   - Don't share PRIVATE_KEY
   - Rotate keys if compromised

---

## Support

- **Documentation:** https://docs.agentgatepay.com
- **GitHub Issues:** https://github.com/agentgatepay/tx-signing-service/issues
- **Discord:** https://discord.gg/agentgatepay
- **Email:** support@agentgatepay.com

---

## License

MIT License - see LICENSE file

---

## Credits

Built by [AgentGatePay](https://agentgatepay.com) - Payment Gateway for AI Agents

Implements the x402 Facilitator Pattern from Coinbase's x402 specification.
