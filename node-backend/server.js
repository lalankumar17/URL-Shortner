const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const axios = require('axios');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const LOCAL_BROWSER_HOST = HOST === '0.0.0.0' ? 'localhost' : HOST;
const TINYURL_API_TOKEN = process.env.TINYURL_API_TOKEN || null;
const TINYURL_CREATE_URL = 'https://api.tinyurl.com/create';
const TINYURL_DOMAIN = 'tinyurl.com';

function resolveTinyurlToken(requestToken) {
    if (typeof requestToken === 'string' && requestToken.trim() !== '') {
        return {
            token: requestToken.trim(),
            source: 'user'
        };
    }

    if (TINYURL_API_TOKEN) {
        return {
            token: TINYURL_API_TOKEN,
            source: 'server'
        };
    }

    return {
        token: null,
        source: 'none'
    };
}

function getTinyurlStatusCode(error) {
    return (error.response && error.response.status) || 500;
}

function getTinyurlErrorMessage(error) {
    const data = error.response && error.response.data;

    if (data && typeof data === 'object') {
        if (Array.isArray(data.errors) && data.errors.length > 0) {
            return data.errors.map(entry => {
                if (typeof entry === 'string') {
                    return entry;
                }

                if (entry && typeof entry === 'object') {
                    return entry.message || entry.error || JSON.stringify(entry);
                }

                return String(entry);
            }).join(', ');
        }

        return data.description || data.message || data.error || 'TinyURL request failed.';
    }

    return error.message || 'TinyURL request failed.';
}

function normalizeTinyurlDisplayMessage(message) {
    if (typeof message !== 'string') {
        return 'TinyURL request failed.';
    }

    return message
        .replace(/\bAlias\b/g, 'Custom link')
        .replace(/\balias\b/g, 'custom link');
}

function shouldPromptForUserToken(error, message, tokenSource) {
    if (tokenSource === 'user') {
        return false;
    }

    const statusCode = getTinyurlStatusCode(error);
    if ([401, 403, 429].includes(statusCode)) {
        return true;
    }

    const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';
    return ['token', 'permission', 'unauthorized', 'forbidden', 'rate', 'limit', 'quota', 'plan']
        .some(fragment => normalizedMessage.includes(fragment));
}

async function createTinyurlShortLink(longUrl, alias, tinyurlToken) {
    const payload = {
        url: longUrl,
        domain: TINYURL_DOMAIN
    };

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

    if (!shortUrl) {
        throw new Error('TinyURL did not return a short URL.');
    }

    return {
        alias: responseData.alias || new URL(shortUrl).pathname.replace(/^\//, ''),
        shortUrl
    };
}

app.use(express.json());

app.post('/api/shorten', async (req, res) => {
    try {
        const { longUrl } = req.body;
        const alias = req.body.alias;
        const tokenConfig = resolveTinyurlToken(req.body.tinyurlToken);

        if (!longUrl) {
            return res.status(400).json({ error: 'longUrl is required' });
        }

        if (!tokenConfig.token) {
            return res.status(400).json({
                error: 'Enter your TinyURL API token to create TinyURL links.',
                requiresUserToken: true
            });
        }

        const shortLink = await createTinyurlShortLink(longUrl, alias, tokenConfig.token);
        return res.json(shortLink);
    } catch (error) {
        const errorMessage = normalizeTinyurlDisplayMessage(getTinyurlErrorMessage(error));
        const tokenConfig = resolveTinyurlToken(req.body.tinyurlToken);
        const requiresUserToken = shouldPromptForUserToken(error, errorMessage, tokenConfig.source);

        return res.status(getTinyurlStatusCode(error)).json({
            error: requiresUserToken
                ? `${errorMessage} Enter your own TinyURL API token to continue.`
                : errorMessage,
            requiresUserToken
        });
    }
});

app.post('/api/qr', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const qrCodeDataUrl = await qrcode.toDataURL(url, {
            color: {
                dark: '#0f172a',
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
    res.status(200).json({
        status: 'ok'
    });
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
    console.log('Shortener mode: TinyURL only');
});
