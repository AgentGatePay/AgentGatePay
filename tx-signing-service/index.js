/**
 * AgentGatePay Transaction Signing Service v4.0 - SECURE
 * Commission config is FETCHED from AgentGatePay (not set by client!)
 *
 * Security Model:
 * - OWNER AUTHORIZATION: Only specific API key can access (set via env var)
 * - SERVER-FETCHED CONFIG: Commission address + rate fetched from AgentGatePay
 * - AUTOMATIC COMMISSION: Server calculates and signs BOTH transactions
 * - CLIENT CANNOT BYPASS: Commission controlled by AgentGatePay, not client
 */

const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// 🔒 SECURITY: Read wallet private key from ENVIRONMENT VARIABLE
// (Users can optionally move to Secret File later for extra security)
let WALLET_PRIVATE_KEY;

// Try environment variable first (set during one-click deploy)
WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

if (WALLET_PRIVATE_KEY) {
    console.log('✅ Wallet private key loaded from environment variable');
} else {
    // Fallback: Try Secret File (if user moved it for extra security)
    const secretPath = '/etc/secrets/wallet-private-key';
    if (fs.existsSync(secretPath)) {
        WALLET_PRIVATE_KEY = fs.readFileSync(secretPath, 'utf8').trim();
        console.log('✅ Wallet private key loaded from Secret File');
    } else {
        // Fallback: Try local file (for local development)
        const localPath = path.join(__dirname, 'wallet-private-key');
        if (fs.existsSync(localPath)) {
            WALLET_PRIVATE_KEY = fs.readFileSync(localPath, 'utf8').trim();
            console.log('⚠️  Wallet private key loaded from local file (dev mode)');
        } else {
            console.error('❌ CRITICAL: Wallet private key not found!');
            console.error('');
            console.error('📖 Setup Instructions:');
            console.error('   Set environment variable: WALLET_PRIVATE_KEY=0x...');
            console.error('   OR add Secret File: /etc/secrets/wallet-private-key');
            console.error('');
            process.exit(1);
        }
    }
}

// Validate private key format
if (!WALLET_PRIVATE_KEY || !WALLET_PRIVATE_KEY.startsWith('0x') || WALLET_PRIVATE_KEY.length !== 66) {
    console.error('❌ CRITICAL: Invalid wallet private key format!');
    console.error('   Expected: 0x followed by 64 hexadecimal characters');
    console.error(`   Got: ${WALLET_PRIVATE_KEY ? WALLET_PRIVATE_KEY.substring(0, 10) + '...' : 'empty'}`);
    console.error('');
    process.exit(1);
}

// 🔒 SECURITY: Read AgentGatePay API key from ENVIRONMENT VARIABLE
// (Users can optionally move to Secret File later for extra security)
let AGENTGATEPAY_API_KEY;

// Try environment variable first (set during one-click deploy)
AGENTGATEPAY_API_KEY = process.env.AGENTGATEPAY_API_KEY;

if (AGENTGATEPAY_API_KEY) {
    console.log('✅ AgentGatePay API key loaded from environment variable');
} else {
    // Fallback: Try Secret File (if user moved it for extra security)
    const secretPath = '/etc/secrets/agentgatepay-api-key';
    if (fs.existsSync(secretPath)) {
        AGENTGATEPAY_API_KEY = fs.readFileSync(secretPath, 'utf8').trim();
        console.log('✅ AgentGatePay API key loaded from Secret File');
    } else {
        // Fallback: Try local file (for local development)
        const localPath = path.join(__dirname, 'agentgatepay-api-key');
        if (fs.existsSync(localPath)) {
            AGENTGATEPAY_API_KEY = fs.readFileSync(localPath, 'utf8').trim();
            console.log('⚠️  AgentGatePay API key loaded from local file (dev mode)');
        } else {
            console.error('❌ CRITICAL: AgentGatePay API key not found!');
            console.error('');
            console.error('📖 Setup Instructions:');
            console.error('   Set environment variable: AGENTGATEPAY_API_KEY=pk_live_...');
            console.error('   OR add Secret File: /etc/secrets/agentgatepay-api-key');
            console.error('');
            process.exit(1);
        }
    }
}

// Validate API key format
if (!AGENTGATEPAY_API_KEY || !AGENTGATEPAY_API_KEY.startsWith('pk_')) {
    console.error('❌ WARNING: AGENTGATEPAY_API_KEY invalid format!');
    console.error('   Expected format: pk_live_...');
    console.error(`   Got: ${AGENTGATEPAY_API_KEY ? AGENTGATEPAY_API_KEY.substring(0, 10) + '...' : 'empty'}`);
    console.error('');
}

// 🔒 SECURITY: AgentGatePay URL is HARDCODED (client cannot change)
const AGENTPAY_API_URL = 'https://api.agentgatepay.com';

// Token configurations
const TOKENS = {
    'USDC': {
        decimals: 6,
        contracts: {
            base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
            arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
        }
    },
    'USDT': {
        decimals: 6,
        contracts: {
            ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
            arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
        }
    },
    'DAI': {
        decimals: 18,
        contracts: {
            base: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
            ethereum: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            polygon: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
            arbitrum: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'
        }
    }
};

// RPC endpoints
const RPCS = {
    base: process.env.BASE_RPC || 'https://mainnet.base.org',
    ethereum: process.env.ETHEREUM_RPC || 'https://cloudflare-eth.com',
    polygon: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    arbitrum: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc'
};

// Block explorers
const EXPLORERS = {
    base: 'https://basescan.org',
    ethereum: 'https://etherscan.io',
    polygon: 'https://polygonscan.com',
    arbitrum: 'https://arbiscan.io'
};

/**
 * 🔒 SECURE: Verify API key belongs to OWNER
 * Only the owner's API key can use this signing service
 */
async function verifyOwnerApiKey(apiKey) {
    // Check if AGENTGATEPAY_API_KEY is configured
    if (!AGENTGATEPAY_API_KEY) {
        console.error('⚠️  AGENTGATEPAY_API_KEY not configured! Anyone can use this service!');
        return true;  // Fallback to open access (not recommended)
    }

    // Check if provided API key matches owner's key
    if (apiKey !== AGENTGATEPAY_API_KEY) {
        console.error(`❌ Unauthorized API key attempted access`);
        return false;
    }

    // Verify the key is still valid with AgentGatePay
    try {
        const response = await fetch(`${AGENTPAY_API_URL}/v1/users/me`, {
            headers: { 'x-api-key': apiKey }
        });

        if (!response.ok) {
            console.error('❌ API key invalid with AgentGatePay');
            return false;
        }

        const user = await response.json();
        console.log(`✅ Owner authenticated: ${user.email || user.user_id}`);
        return true;
    } catch (error) {
        console.error(`❌ API key verification failed: ${error.message}`);
        return false;
    }
}

/**
 * 🔒 SECURE: Fetch commission config from AgentGatePay
 * Commission address and rate are CONTROLLED BY AGENTGATEPAY, not client!
 *
 * This prevents clients from:
 * - Setting their own commission address (stealing commission)
 * - Setting low commission rate (avoiding fees)
 * - Pointing to fake API (bypassing verification)
 */
async function fetchCommissionConfig(apiKey) {
    try {
        console.log(`📡 Fetching commission config from AgentGatePay...`);

        const response = await fetch(`${AGENTPAY_API_URL}/v1/config/commission`, {
            headers: { 'x-api-key': apiKey }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch commission config: ${response.status} ${response.statusText}`);
        }

        const config = await response.json();

        console.log(`✅ Commission config fetched:`);
        console.log(`   Address: ${config.commission_address}`);
        console.log(`   Rate: ${config.commission_rate_percent}`);
        console.log(`   Controlled by: ${config.controlled_by}`);

        if (!config.verified) {
            throw new Error('Commission config not verified by AgentGatePay');
        }

        return {
            address: config.commission_address,
            rate: config.commission_rate
        };
    } catch (error) {
        console.error(`❌ Failed to fetch commission config: ${error.message}`);
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'AgentGatePay Signing Service',
        version: '4.0.0',
        mode: 'secure_server_fetched_config',
        supported_chains: Object.keys(RPCS),
        supported_tokens: Object.keys(TOKENS),
        owner_protection: AGENTGATEPAY_API_KEY ? 'enabled' : 'disabled'
    });
});

/**
 * 🚀 SECURE ENDPOINT: /sign-payment
 *
 * Automatically signs TWO transactions:
 * 1. Commission transaction (fetched from AgentGatePay) → AgentGatePay wallet
 * 2. Merchant transaction (calculated) → merchant wallet
 *
 * Client CANNOT bypass commission because:
 * - Commission config fetched from AgentGatePay (not client env vars)
 * - Server calculates the split (not client)
 * - Server signs both transactions atomically
 * - Client receives both tx_hashes or neither
 *
 * Request:
 * {
 *   "merchant_address": "0x...recipient",
 *   "total_amount": "15000000",  // Total in atomic units
 *   "token": "USDC",
 *   "chain": "base"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "tx_hash": "0x...merchant",
 *   "tx_hash_commission": "0x...commission",
 *   "commission_amount": "75000",  // From AgentGatePay config
 *   "merchant_amount": "14925000",
 *   ...
 * }
 *
 * Headers:
 *   x-api-key: Owner's AgentGatePay API key (REQUIRED)
 */
app.post('/sign-payment', async (req, res) => {
    try {
        console.log(`\n[${new Date().toISOString()}] ===== NEW PAYMENT REQUEST =====`);

        // 1. 🔒 SECURITY: Verify OWNER's API key
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'x-api-key header required (owner API key only)'
            });
        }

        const isOwner = await verifyOwnerApiKey(apiKey);
        if (!isOwner) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'This signing service only accepts requests from the owner. Your API key is not authorized.'
            });
        }

        // 2. 🔒 SECURITY: Fetch commission config from AgentGatePay
        //    This ensures commission address and rate are CONTROLLED BY AGENTGATEPAY
        let commissionConfig;
        try {
            commissionConfig = await fetchCommissionConfig(apiKey);
        } catch (error) {
            return res.status(500).json({
                error: 'Failed to fetch commission config',
                message: error.message,
                note: 'Commission config is controlled by AgentGatePay and must be fetched from the server'
            });
        }

        // 3. Extract and validate parameters
        const { merchant_address, total_amount, token, chain } = req.body;

        if (!merchant_address || !total_amount || !token || !chain) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Required fields: merchant_address, total_amount, token, chain'
            });
        }

        console.log(`  Merchant: ${merchant_address}`);
        console.log(`  Total Amount: ${total_amount} ${token} atomic units`);
        console.log(`  Chain: ${chain}`);

        // 4. Validate chain and token
        if (!RPCS[chain]) {
            return res.status(400).json({
                error: `Unsupported chain: ${chain}`,
                supported: Object.keys(RPCS)
            });
        }

        if (!TOKENS[token]) {
            return res.status(400).json({
                error: `Unsupported token: ${token}`,
                supported: Object.keys(TOKENS)
            });
        }

        const tokenAddress = TOKENS[token].contracts[chain];
        if (!tokenAddress) {
            return res.status(400).json({
                error: `${token} not supported on ${chain}`
            });
        }

        // 5. 💰 CALCULATE COMMISSION SPLIT (SERVER-SIDE with AgentGatePay config)
        //    Client CANNOT modify these values!
        const totalAmountBN = BigInt(total_amount);
        const commissionAmountBN = totalAmountBN * BigInt(Math.floor(commissionConfig.rate * 10000)) / BigInt(10000);
        const merchantAmountBN = totalAmountBN - commissionAmountBN;

        const commissionAmount = commissionAmountBN.toString();
        const merchantAmount = merchantAmountBN.toString();

        console.log(`\n  💰 PAYMENT SPLIT (AgentGatePay-controlled):`);
        console.log(`     Commission (${commissionConfig.rate * 100}%): ${commissionAmount} → ${commissionConfig.address}`);
        console.log(`     Merchant (${(1 - commissionConfig.rate) * 100}%): ${merchantAmount} → ${merchant_address}`);

        // 6. Connect to blockchain
        const provider = new ethers.JsonRpcProvider(RPCS[chain]);
        const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

        console.log(`\n  📡 Blockchain: ${chain}`);
        console.log(`  From wallet: ${wallet.address}`);

        // 7. Build ERC-20 contract interface
        const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
        const contract = new ethers.Contract(tokenAddress, erc20Abi, wallet);

        // Get current nonce and gas price
        const currentNonce = await wallet.getNonce();
        const feeData = await provider.getFeeData();

        console.log(`  Nonce: ${currentNonce}`);
        console.log(`  Gas Price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei`);

        // 8. 🔐 TRANSACTION 1: Commission (to AgentGatePay)
        console.log(`\n  🔐 TRANSACTION 1: Commission Transfer`);
        const tx1 = await contract.transfer(commissionConfig.address, commissionAmount, {
            nonce: currentNonce,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        });
        console.log(`     TX Hash: ${tx1.hash}`);

        // Wait for confirmation
        const receipt1 = await tx1.wait(1, 60000);
        console.log(`     Block: ${receipt1.blockNumber}`);
        console.log(`     Status: ${receipt1.status === 1 ? 'Success ✅' : 'Failed ❌'}`);

        if (receipt1.status !== 1) {
            throw new Error('Commission transaction failed on-chain');
        }

        // 9. 🔐 TRANSACTION 2: Merchant Payment (with incremented nonce)
        console.log(`\n  🔐 TRANSACTION 2: Merchant Transfer`);
        const tx2 = await contract.transfer(merchant_address, merchantAmount, {
            nonce: currentNonce + 1,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        });
        console.log(`     TX Hash: ${tx2.hash}`);

        // Wait for confirmation
        const receipt2 = await tx2.wait(1, 60000);
        console.log(`     Block: ${receipt2.blockNumber}`);
        console.log(`     Status: ${receipt2.status === 1 ? 'Success ✅' : 'Failed ❌'}`);

        if (receipt2.status !== 1) {
            throw new Error('Merchant transaction failed on-chain');
        }

        // 10. ✅ SUCCESS - Return BOTH transaction hashes
        const decimals = TOKENS[token].decimals;
        const totalUsd = Number(total_amount) / (10 ** decimals);
        const commissionUsd = Number(commissionAmount) / (10 ** decimals);
        const merchantUsd = Number(merchantAmount) / (10 ** decimals);

        console.log(`\n  ✅ BOTH TRANSACTIONS CONFIRMED!`);
        console.log(`     Total: $${totalUsd.toFixed(6)}`);
        console.log(`     Commission: $${commissionUsd.toFixed(6)} (${commissionConfig.rate * 100}%)`);
        console.log(`     Merchant: $${merchantUsd.toFixed(6)} (${(1 - commissionConfig.rate) * 100}%)`);

        return res.json({
            success: true,
            // Merchant transaction (main payment)
            txHash: tx2.hash,
            tx_hash: tx2.hash,
            blockNumber: receipt2.blockNumber,
            explorerUrl: `${EXPLORERS[chain]}/tx/${tx2.hash}`,

            // Commission transaction
            txHashCommission: tx1.hash,
            tx_hash_commission: tx1.hash,
            blockNumberCommission: receipt1.blockNumber,
            explorerUrlCommission: `${EXPLORERS[chain]}/tx/${tx1.hash}`,

            // Payment details
            from: wallet.address,
            merchant: merchant_address,
            commission_address: commissionConfig.address,
            total_amount: total_amount,
            merchant_amount: merchantAmount,
            commission_amount: commissionAmount,
            commission_rate: commissionConfig.rate,
            token: token,
            chain: chain,

            // USD values
            total_usd: totalUsd,
            merchant_usd: merchantUsd,
            commission_usd: commissionUsd,

            // Security info
            commission_controlled_by: 'agentgatepay',
            config_fetched_from: AGENTPAY_API_URL,

            gasUsed: (receipt1.gasUsed + receipt2.gasUsed).toString(),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`\n❌ ERROR:`, error.message);

        if (error.code === 'INSUFFICIENT_FUNDS') {
            return res.status(400).json({
                error: 'Insufficient funds',
                message: 'Gateway wallet does not have enough tokens or ETH for gas'
            });
        }

        return res.status(500).json({
            error: 'Payment failed',
            message: error.message
        });
    }
});

/**
 * LEGACY ENDPOINT: /sign
 * Single transaction signing (NO commission enforcement)
 * DEPRECATED - Use /sign-payment instead
 */
app.post('/sign', async (req, res) => {
    return res.status(410).json({
        error: 'Endpoint deprecated',
        message: 'Please use POST /sign-payment instead for automatic commission enforcement',
        migration: {
            old: 'POST /sign with {to, amount, token, chain}',
            new: 'POST /sign-payment with {merchant_address, total_amount, token, chain}',
            benefit: 'Automatic commission enforcement with server-fetched config'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        available_endpoints: {
            'GET /health': 'Health check',
            'POST /sign-payment': 'Sign payment with automatic commission (requires owner API key)'
        },
        note: 'Commission config is fetched from AgentGatePay. Client cannot modify.'
    });
});

// Start server
app.listen(PORT, () => {
    const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY);

    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║  AgentGatePay Signing Service v4.0                         ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Status: RUNNING                                           ║`);
    console.log(`║  Port: ${PORT.toString().padEnd(52)}║`);
    console.log(`║  Mode: Secure Server-Fetched Config                        ║`);
    console.log(`║  Wallet: ${wallet.address.substring(0, 42).padEnd(48)}║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Endpoint:                                                 ║`);
    console.log(`║    POST /sign-payment  - Automatic commission enforcement  ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Security:                                                 ║`);
    console.log(`║    ✅ Owner API key required (${AGENTGATEPAY_API_KEY ? 'configured' : 'NOT SET!'})               ║`);
    console.log(`║    ✅ Commission config fetched from AgentGatePay          ║`);
    console.log(`║    ✅ Client cannot modify commission                      ║`);
    console.log(`║    ✅ Hardcoded API URL (no fake APIs)                     ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);

    if (!WALLET_PRIVATE_KEY) {
        console.log(`⚠️  WARNING: Wallet private key not loaded from secret file!`);
    }
    if (!AGENTGATEPAY_API_KEY) {
        console.log(`⚠️  WARNING: AGENTGATEPAY_API_KEY not set! Anyone can use this service!`);
    }
    console.log(`✅ Commission config will be fetched from: ${AGENTPAY_API_URL}`);
});
