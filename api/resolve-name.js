const axios = require('axios');

// Ghana Telecom Network Prefixes & Paystack Bank Codes
const NETWORK_MAP = {
    MTN: {
        code: 'MTN',
        prefixes: ['024', '054', '055', '059', '025', '053']
    },
    TELECEL: {
        code: 'VOD',
        prefixes: ['020', '050']
    },
    AIRTELTIGO: {
        code: 'ATL',
        prefixes: ['026', '056', '027', '057']
    }
};

function getBankCodeFromNumber(phone) {
    const prefix = phone.substring(0, 3);
    for (const key in NETWORK_MAP) {
        if (NETWORK_MAP[key].prefixes.includes(prefix)) {
            return NETWORK_MAP[key].code;
        }
    }
    return null;
}

module.exports = async (req, res) => {
    // 1. Enable CORS for cross-origin requests
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); // Replace '*' with your frontend domain in production for extra security
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // Handle preflight CORS request
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    try {
        const { phone } = req.body;

        if (!phone || phone.length !== 10 || !/^\d+$/.test(phone)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid phone number format. Must be 10 digits.' 
            });
        }

        const bankCode = getBankCodeFromNumber(phone);
        if (!bankCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'Unsupported or unallocated Ghanaian network prefix.' 
            });
        }

        const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!paystackSecretKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'Server Configuration Error: Paystack Secret Key missing.' 
            });
        }

        // Request to Paystack
        const paystackResponse = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${phone}&bank_code=${bankCode}`,
            {
                headers: {
                    Authorization: `Bearer ${paystackSecretKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );

        if (paystackResponse.data && paystackResponse.data.status) {
            return res.status(200).json({
                success: true,
                account_name: paystackResponse.data.data.account_name,
                account_number: paystackResponse.data.data.account_number
            });
        } else {
            return res.status(404).json({
                success: false,
                message: 'Could not resolve registered name for this number.'
            });
        }

    } catch (error) {
        console.error('Paystack Error:', error.response ? error.response.data : error.message);
        const statusCode = error.response ? error.response.status : 500;
        const errorMessage = error.response && error.response.data && error.response.data.message
            ? error.response.data.message
            : 'Error connecting to network verification service.';

        return res.status(statusCode).json({
            success: false,
            message: errorMessage
        });
    }
};