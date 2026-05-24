const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const axios = require('axios');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const LOCAL_BROWSER_HOST = HOST === '0.0.0.0' ? 'localhost' : HOST;

// ── TinyURL ──────────────────────────────────────────────────────────────────
const TINYURL_API_TOKEN = process.env.TINYURL_API_TOKEN || null;
const TINYURL_CREATE_URL = 'https://api.tinyurl.com/create';
const TINYURL_DOMAIN = 'tinyurl.com';

// ── Bit.ly ────────────────────────────────────────────────────────────────────
const BITLY_API_TOKEN = process.env.BITLY_API_TOKEN || '563d3446358e6acf97813e4a378f2fba73391867';
const BITLY_CREATE_URL = 'https://api-ssl.bitly.com/v4/shorten';
const BITLY_DOMAIN = 'bit.ly';

// ─────────────────────────────────────────────────────────────────────────────
// TinyURL helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveTinyurlToken(requestToken) {
    if (typeof requestToken === 'string' && requestToken.trim() !== '') {
        return { token: requestToken.trim(), source: 'user' };
    }
    if (TINYURL_API_TOKEN) {
        return { token: TINYURL_API_TOKEN, source: 'server' };
    }
    return { token: null, source: 'none' };
}

function getTinyurlStatusCode(error) {
    return (error.response && error.response.status) || 500;
}

function getTinyurlErrorMessage(error) {
    const data = error.response && error.response.data;
    const statusCode = (error.response && error.response.status) || 500;

    if (statusCode === 422) {
        if (data && typeof data === 'object' && Array.isArray(data.errors) && data.errors.length > 0) {
            const firstError = String(data.errors[0]).toLowerCase();
            if (firstError.includes('reserved')) {
                return 'This custom link is reserved.';
            }
            return data.errors.map(entry => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry === 'object') return entry.message || entry.error || JSON.stringify(entry);
                return String(entry);
            }).join(', ');
        }
        return 'This custom link is already taken or reserved.';
    }

    if (data && typeof data === 'object') {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
            return data.errors.map(entry => {
                if (typeof entry === 'string') return entry;
                if (entry && typeof entry === 'object') return entry.message || entry.error || JSON.stringify(entry);
                return String(entry);
            }).join(', ');
        }
        return data.description || data.message || data.error || 'TinyURL request failed.';
    }

    return error.message || 'TinyURL request failed.';
}

function normalizeTinyurlDisplayMessage(message) {
    if (typeof message !== 'string') return 'TinyURL request failed.';
    if (message.toLowerCase().includes('unauthenticated')) {
        return 'Please enter a valid TinyURL API token.';
    }
    return message
        .replace(/\bAlias\b/g, 'Custom link')
        .replace(/\balias\b/g, 'custom link');
}

function shouldPromptForUserToken(error, message, tokenSource) {
    if (tokenSource === 'user') return false;

    const statusCode = getTinyurlStatusCode(error);
    if ([401, 403, 429].includes(statusCode)) return true;

    const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';
    return ['token', 'permission', 'unauthorized', 'forbidden', 'rate', 'limit', 'quota', 'plan']
        .some(fragment => normalizedMessage.includes(fragment));
}

async function createTinyurlShortLink(longUrl, alias, tinyurlToken) {
    // If no token is provided:
    if (typeof tinyurlToken !== 'string' || tinyurlToken.trim() === '') {
        let url = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
        if (typeof alias === 'string' && alias.trim() !== '') {
            url += `&alias=${encodeURIComponent(alias.trim())}`;
        }

        const response = await axios.get(url);
        const shortUrl = response.data;
        
        if (typeof shortUrl !== 'string' || !shortUrl.startsWith('http')) {
            if (shortUrl === 'Error' && typeof alias === 'string' && alias.trim() !== '') {
                throw new Error('This custom link is already taken.');
            }
            throw new Error('TinyURL public API did not return a valid short URL.');
        }
        
        return {
            alias: new URL(shortUrl).pathname.replace(/^\//, ''),
            shortUrl
        };
    }

    const payload = { url: longUrl, domain: TINYURL_DOMAIN };
    if (typeof alias === 'string' && alias.trim() !== '') {
        payload.alias = alias.trim();
    }

    const response = await axios({
        method: 'post',
        url: TINYURL_CREATE_URL,
        headers: {
            Authorization: `Bearer ${tinyurlToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        data: payload
    });

    const responseData = response.data && typeof response.data === 'object'
        ? (response.data.data || response.data)
        : {};
    const shortUrl = responseData.tiny_url || responseData.short_url || responseData.link;

    if (!shortUrl) throw new Error('TinyURL did not return a short URL.');

    return {
        alias: responseData.alias || new URL(shortUrl).pathname.replace(/^\//, ''),
        shortUrl
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bit.ly helpers
// ─────────────────────────────────────────────────────────────────────────────

function resolveBitlyToken(requestToken) {
    if (typeof requestToken === 'string' && requestToken.trim() !== '') {
        return { token: requestToken.trim(), source: 'user' };
    }
    if (BITLY_API_TOKEN) {
        return { token: BITLY_API_TOKEN, source: 'server' };
    }
    return { token: null, source: 'none' };
}

function getBitlyStatusCode(error) {
    return (error.response && error.response.status) || 500;
}

function getBitlyErrorMessage(error) {
    const data = error.response && error.response.data;
    if (data && typeof data === 'object') {
        return data.description || data.message || data.errors || 'Bit.ly request failed.';
    }
    return error.message || 'Bit.ly request failed.';
}

async function createBitlyShortLink(longUrl, alias, bitlyToken) {
    const payload = {
        long_url: longUrl,
        domain: BITLY_DOMAIN
    };

    const response = await axios({
        method: 'post',
        url: BITLY_CREATE_URL,
        headers: {
            Authorization: `Bearer ${bitlyToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        data: payload
    });

    let shortUrl = response.data && response.data.link;
    if (!shortUrl) throw new Error('Bit.ly did not return a short URL.');

    // If an alias (custom link) is requested, attempt to customize the back-half of the bitlink!
    if (typeof alias === 'string' && alias.trim() !== '') {
        const cleanAlias = alias.trim();
        const bitlinkId = shortUrl.replace(/^https?:\/\//, ''); // e.g. "bit.ly/4wSnivA"

        try {
            const customResponse = await axios({
                method: 'post',
                url: 'https://api-ssl.bitly.com/v4/custom_bitlinks',
                headers: {
                    Authorization: `Bearer ${bitlyToken}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/json'
                },
                data: {
                    bitlink_id: bitlinkId,
                    custom_bitlink: `${BITLY_DOMAIN}/${cleanAlias}`
                }
            });

            const customLink = customResponse.data && customResponse.data.custom_bitlink;
            if (customLink) {
                shortUrl = `https://${customLink}`;
            }
        } catch (customError) {
            const data = customError.response && customError.response.data;
            const status = (customError.response && customError.response.status) || 500;

            if (data && typeof data === 'object') {
                const message = data.description || data.message;
                if (message) {
                    if (message.toLowerCase().includes('already exists') || message === 'ALREADY_EXISTS') {
                        throw new Error('This custom link is already taken.');
                    }
                    if (message.toLowerCase().includes('value provided') || message.toLowerCase().includes('invalid')) {
                        throw new Error('This custom link is already taken or reserved.');
                    }
                    throw new Error(message);
                }
            }

            if (status === 403 || status === 402) {
                throw new Error('Custom links are not supported by your Bit.ly account plan.');
            } else if (status === 409 || status === 422) {
                throw new Error('This custom link is already taken.');
            } else {
                throw new Error('Failed to customize the Bit.ly link.');
            }
        }
    }

    return {
        alias: new URL(shortUrl).pathname.replace(/^\//, ''),
        shortUrl
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/shorten', async (req, res) => {
    try {
        const { longUrl, alias, provider } = req.body;

        if (!longUrl) {
            return res.status(400).json({ error: 'longUrl is required' });
        }

        // ── Route to Bit.ly ───────────────────────────────────────────────────
        if (provider === 'bitly') {
            const tokenConfig = resolveBitlyToken(req.body.bitlyToken);

            if (!tokenConfig.token) {
                return res.status(400).json({
                    error: 'Enter your Bit.ly access token to create Bit.ly links.',
                    requiresUserToken: true,
                    provider: 'bitly'
                });
            }

            try {
                const shortLink = await createBitlyShortLink(longUrl, alias, tokenConfig.token);
                return res.json(shortLink);
            } catch (error) {
                const errorMessage = getBitlyErrorMessage(error);
                const statusCode = getBitlyStatusCode(error);
                const requiresUserToken = [401, 403, 429].includes(statusCode) || 
                                          ['token', 'permission', 'unauthorized', 'forbidden', 'rate', 'limit', 'quota', 'plan', 'credential', 'api key', 'unauthenticated'].some(kw => errorMessage.toLowerCase().includes(kw));

                return res.status(statusCode).json({
                    error: errorMessage,
                    requiresUserToken: requiresUserToken,
                    provider: 'bitly'
                });
            }
        }

        // ── Default: TinyURL ──────────────────────────────────────────────────
        const tokenConfig = resolveTinyurlToken(req.body.tinyurlToken);
        const shortLink = await createTinyurlShortLink(longUrl, alias, tokenConfig.token);
        return res.json(shortLink);

    } catch (error) {
        const errorMessage = normalizeTinyurlDisplayMessage(getTinyurlErrorMessage(error));
        const statusCode = getTinyurlStatusCode(error);
        const requiresUserToken = [401, 403, 429].includes(statusCode) ||
                                  ['token', 'permission', 'unauthorized', 'forbidden', 'rate', 'limit', 'quota', 'plan', 'unauthenticated'].some(kw => errorMessage.toLowerCase().includes(kw));

        return res.status(statusCode).json({
            error: errorMessage,
            requiresUserToken: requiresUserToken
        });
    }
});

app.post('/api/qr', async (req, res) => {
    try {
        const { url, darkColor } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const qrCodeDataUrl = await qrcode.toDataURL(url, {
            color: {
                dark: darkColor || '#0f172a',
                light: '#ffffff'
            },
            width: 300,
            margin: 2
        });

        return res.json({ qrCode: qrCodeDataUrl });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to generate QR code.' });
    }
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, '../frontend')));

app.use((req, res) => {
    if (req.path.startsWith('/api') || req.path === '/health') {
        return res.status(404).json({ error: 'Not found' });
    }
    return res.status(404).sendFile(path.join(__dirname, '../frontend/404.html'));
});

app.listen(PORT, HOST, () => {
    console.log(`Node Server is running on port ${PORT}`);
    console.log(`Open the app at: http://${LOCAL_BROWSER_HOST}:${PORT}`);
    console.log('Shortener mode: TinyURL + Bit.ly');
});
