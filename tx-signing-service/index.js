/**
 * AgentGatePay Transaction Signing Service
 *
 * One-click deploy to Railway for autonomous n8n payments
 *
 * This service signs and broadcasts ERC20 token transfers
 * to multiple chains (Ethereum, Base, Polygon, Arbitrum)
 * for multiple tokens (USDC, USDT, DAI).
 *
 * Security: Private key stored in Railway environment variables (encrypted)
 * x402 Compliant: Implements facilitator pattern from x402 specification
 *
 * GitHub: https://github.com/agentgatepay/tx-signing-service
 * Docs: https://docs.agentgatepay.com
 */

const express = require('express');
const { ethers } = require('ethers');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Configuration from environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const AUTH_TOKEN = process.env.AUTH_TOKEN; // Optional: Add basic auth

// Token configurations (contract addresses)
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

// RPC endpoints (public, free)
const RPCS = {
    base: process.env.BASE_RPC || 'https://mainnet.base.org',
    ethereum: process.env.ETHEREUM_RPC || 'https://cloudflare-eth.com',
    polygon: process.env.POLYGON_RPC || 'https://polygon-rpc.com',
    arbitrum: process.env.ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc'
};

// Chain IDs
const CHAIN_IDS = {
    base: 8453,
    ethereum: 1,
    polygon: 137,
    arbitrum: 42161
};

// Block explorers
const EXPLORERS = {
    base: 'https://basescan.org',
    ethereum: 'https://etherscan.io',
    polygon: 'https://polygonscan.com',
    arbitrum: 'https://arbiscan.io'
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'AgentGatePay Transaction Signing Service',
        version: '1.0.0',
        configured: !!PRIVATE_KEY,
        supported_chains: Object.keys(RPCS),
        supported_tokens: Object.keys(TOKENS)
    });
});

// Wallet info endpoint
app.get('/wallet', (req, res) => {
    if (!PRIVATE_KEY) {
        return res.status(500).json({
            error: 'PRIVATE_KEY not configured',
            message: 'Set PRIVATE_KEY environment variable in Railway dashboard'
        });
    }

    try {
        const wallet = new ethers.Wallet(PRIVATE_KEY);
        res.json({
            address: wallet.address,
            message: 'Wallet configured successfully'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Invalid PRIVATE_KEY',
            message: error.message
        });
    }
});

// Main signing endpoint
app.post('/sign-and-send', async (req, res) => {
    try {
        // Validate configuration
        if (!PRIVATE_KEY) {
            return res.status(500).json({
                error: 'Service not configured',
                message: 'PRIVATE_KEY environment variable not set'
            });
        }

        // Optional authentication
        if (AUTH_TOKEN) {
            const providedToken = req.headers.authorization?.replace('Bearer ', '');
            if (providedToken !== AUTH_TOKEN) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
        }

        // Extract parameters
        const { to, amount, token, chain } = req.body;

        // Validate parameters
        if (!to || !amount || !token || !chain) {
            return res.status(400).json({
                error: 'Missing required parameters',
                required: ['to', 'amount', 'token', 'chain'],
                provided: { to: !!to, amount: !!amount, token: !!token, chain: !!chain }
            });
        }

        // Validate chain
        if (!RPCS[chain]) {
            return res.status(400).json({
                error: `Unsupported chain: ${chain}`,
                supported: Object.keys(RPCS)
            });
        }

        // Validate token
        if (!TOKENS[token]) {
            return res.status(400).json({
                error: `Unsupported token: ${token}`,
                supported: Object.keys(TOKENS)
            });
        }

        // Check if token is supported on chain
        const tokenAddress = TOKENS[token].contracts[chain];
        if (!tokenAddress) {
            return res.status(400).json({
                error: `${token} not supported on ${chain}`,
                message: `${token} is not available on ${chain} network`
            });
        }

        // Validate amount
        const amountInt = parseInt(amount);
        if (isNaN(amountInt) || amountInt <= 0) {
            return res.status(400).json({
                error: 'Invalid amount',
                message: 'Amount must be a positive integer in token units'
            });
        }

        // Connect to blockchain
        const provider = new ethers.JsonRpcProvider(RPCS[chain]);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

        console.log(`[${new Date().toISOString()}] Signing transaction:`);
        console.log(`  From: ${wallet.address}`);
        console.log(`  To: ${to}`);
        console.log(`  Amount: ${amount} (${token})`);
        console.log(`  Chain: ${chain}`);

        // Create ERC20 contract instance
        const erc20Abi = [
            'function transfer(address to, uint256 amount) returns (bool)'
        ];
        const contract = new ethers.Contract(tokenAddress, erc20Abi, wallet);

        // Send transaction
        const tx = await contract.transfer(to, amountInt);
        console.log(`  TX Hash: ${tx.hash}`);

        // Wait for confirmation (with 60 second timeout)
        const receipt = await tx.wait(1, 60000);

        console.log(`  Block: ${receipt.blockNumber}`);
        console.log(`  Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`  Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);

        // Return result
        return res.json({
            success: true,
            tx_hash: tx.hash,
            from: wallet.address,
            to: to,
            amount: amount,
            token: token,
            chain: chain,
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed.toString(),
            explorer_url: `${EXPLORERS[chain]}/tx/${tx.hash}`,
            message: 'Transaction signed and confirmed successfully'
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error:`, error.message);

        // Handle specific errors
        if (error.code === 'INSUFFICIENT_FUNDS') {
            return res.status(400).json({
                error: 'Insufficient funds',
                message: 'Wallet does not have enough tokens or ETH for gas',
                details: error.message
            });
        }

        if (error.code === 'NONCE_EXPIRED' || error.code === 'REPLACEMENT_UNDERPRICED') {
            return res.status(400).json({
                error: 'Transaction conflict',
                message: 'Another transaction is pending. Try again in a few seconds.',
                details: error.message
            });
        }

        if (error.code === 'TIMEOUT') {
            return res.status(408).json({
                error: 'Transaction timeout',
                message: 'Transaction was sent but confirmation timed out. Check explorer.',
                details: error.message
            });
        }

        return res.status(500).json({
            error: 'Transaction failed',
            message: error.message,
            code: error.code
        });
    }
});

// Alternative endpoint (alias for compatibility)
app.post('/sign', async (req, res) => {
    return app._router.handle(req, res);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        message: 'Use POST /sign-and-send to sign transactions',
        docs: 'https://docs.agentgatepay.com'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n╔════════════════════════════════════════════════════════════╗`);
    console.log(`║  AgentGatePay Transaction Signing Service                 ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Status: RUNNING                                           ║`);
    console.log(`║  Port: ${PORT.toString().padEnd(52)}║`);
    console.log(`║  Private Key: ${(PRIVATE_KEY ? 'Configured ✅' : 'NOT CONFIGURED ⚠️').padEnd(47)}║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Endpoints:                                                ║`);
    console.log(`║    GET  /health          - Health check                    ║`);
    console.log(`║    GET  /wallet          - Show wallet address             ║`);
    console.log(`║    POST /sign-and-send   - Sign transaction                ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Supported:                                                ║`);
    console.log(`║    Chains: Ethereum, Base, Polygon, Arbitrum               ║`);
    console.log(`║    Tokens: USDC, USDT, DAI                                 ║`);
    console.log(`╠════════════════════════════════════════════════════════════╣`);
    console.log(`║  Docs: https://docs.agentgatepay.com                       ║`);
    console.log(`║  GitHub: https://github.com/agentgatepay                   ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝\n`);

    if (!PRIVATE_KEY) {
        console.log(`⚠️  WARNING: PRIVATE_KEY not set!`);
        console.log(`   Set it in Railway dashboard: Settings → Variables → Add Variable`);
        console.log(`   Name: PRIVATE_KEY`);
        console.log(`   Value: 0x... (your wallet private key)\n`);
    }
});
