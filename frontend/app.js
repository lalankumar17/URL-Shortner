document.addEventListener('DOMContentLoaded', () => {
    const TINYURL_TOKEN_STORAGE_KEY = 'shorturl.tinyurlToken';
    const BITLY_TOKEN_STORAGE_KEY = 'shorturl.bitlyToken';
    const TINYURL_DOMAIN = 'tinyurl';
    const BITLY_DOMAIN   = 'bitly';

    // ── Tab switching ─────────────────────────────────────────────────────────
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    // ── DOM references ────────────────────────────────────────────────────────
    const domainSelect   = document.getElementById('domain-select');
    const qrDomainSelect = document.getElementById('qr-domain-select');

    const shortenTinyurlSection = document.getElementById('shorten-tinyurl-section');
    const qrTinyurlSection      = document.getElementById('qr-tinyurl-section');
    const shortenBitlySection   = document.getElementById('shorten-bitly-section');
    const qrBitlySection        = document.getElementById('qr-bitly-section');

    const shortenTinyurlTokenInput = document.getElementById('shorten-tinyurl-token');
    const qrTinyurlTokenInput      = document.getElementById('qr-tinyurl-token');
    const shortenBitlyTokenInput   = document.getElementById('shorten-bitly-token');
    const qrBitlyTokenInput        = document.getElementById('qr-bitly-token');

    const tinyurlTokenInputs = [shortenTinyurlTokenInput, qrTinyurlTokenInput].filter(Boolean);
    const bitlyTokenInputs   = [shortenBitlyTokenInput, qrBitlyTokenInput].filter(Boolean);

    const tokenToggleButtons = document.querySelectorAll('.token-toggle-btn');

    // ── Populate & enable domain dropdowns ────────────────────────────────────
    populateDomainSelect(domainSelect);
    populateDomainSelect(qrDomainSelect);

    // Default: hide all token sections on load
    if (shortenTinyurlSection) shortenTinyurlSection.classList.add('hidden');
    if (qrTinyurlSection) qrTinyurlSection.classList.add('hidden');
    if (shortenBitlySection) shortenBitlySection.classList.add('hidden');
    if (qrBitlySection) qrBitlySection.classList.add('hidden');

    // ── Restore saved TinyURL token ───────────────────────────────────────────
    const storedTinyurlToken = loadToken(TINYURL_TOKEN_STORAGE_KEY);
    if (storedTinyurlToken) setTinyurlTokenValue(storedTinyurlToken);

    // ── Restore saved Bitly token ─────────────────────────────────────────────
    const storedBitlyToken = loadToken(BITLY_TOKEN_STORAGE_KEY);
    if (storedBitlyToken) setBitlyTokenValue(storedBitlyToken);

    // ── Sync & persist TinyURL token inputs ───────────────────────────────────
    tinyurlTokenInputs.forEach(input => {
        input.addEventListener('input', () => {
            syncInputs(tinyurlTokenInputs, input);
            saveToken(TINYURL_TOKEN_STORAGE_KEY, input.value);
        });
    });

    // ── Sync & persist Bitly token inputs ─────────────────────────────────────
    bitlyTokenInputs.forEach(input => {
        input.addEventListener('input', () => {
            syncInputs(bitlyTokenInputs, input);
            saveToken(BITLY_TOKEN_STORAGE_KEY, input.value);
        });
    });

    // ── Show/hide password toggle buttons ─────────────────────────────────────
    tokenToggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetInput = document.getElementById(button.dataset.target);
            if (!targetInput) return;
            const isPassword = targetInput.type === 'password';
            targetInput.type = isPassword ? 'text' : 'password';
            button.innerHTML = isPassword
                ? '<i class="fa-regular fa-eye-slash"></i>'
                : '<i class="fa-regular fa-eye"></i>';
            button.setAttribute('aria-label', isPassword ? 'Hide API token' : 'Show API token');
        });
    });

    // ── Shorten tab ───────────────────────────────────────────────────────────
    const shortenBtn        = document.getElementById('shorten-btn');
    const longUrlInput      = document.getElementById('long-url');
    const longUrlShell      = document.getElementById('long-url-shell');
    const longUrlValidation = document.getElementById('long-url-validation');
    const aliasInput        = document.getElementById('short-alias');
    const shortenResultBox  = document.getElementById('shorten-result');
    const resultUrlInput    = document.getElementById('result-url');
    const errorMessage      = document.getElementById('error-message');
    const copyBtn           = document.getElementById('copy-btn');

    longUrlInput.addEventListener('input', () => {
        if (longUrlInput.value.trim()) clearFieldValidation(longUrlShell, longUrlValidation);
    });

    // ── Domain change (shorten tab) ───────────────────────────────────────────
    if (domainSelect) {
        domainSelect.addEventListener('change', () => {
            if (shortenTinyurlSection) shortenTinyurlSection.classList.add('hidden');
            if (shortenBitlySection) shortenBitlySection.classList.add('hidden');
            hideError(errorMessage);
        });
    }

    shortenBtn.addEventListener('click', async () => {
        const longUrl  = longUrlInput.value.trim();
        const alias    = aliasInput.value.trim();
        const provider = getProvider(domainSelect);
        const tinyurlToken = provider === 'tinyurl' ? getTinyurlTokenValue() : '';
        const bitlyToken   = provider === 'bitly' ? getBitlyTokenValue() : '';

        if (!longUrl) {
            hideError(errorMessage);
            showFieldValidation(longUrlInput, longUrlShell, longUrlValidation, 'Required field');
            return;
        }

        clearFieldValidation(longUrlShell, longUrlValidation);
        shortenBtn.disabled = true;
        shortenBtn.textContent = 'Shortening...';
        hideError(errorMessage);
        shortenResultBox.classList.add('hidden');

        try {
            const body = { longUrl, provider };
            if (provider === 'tinyurl') {
                body.alias = alias;
                body.tinyurlToken = tinyurlToken;
            } else if (provider === 'bitly') {
                body.alias = alias;
                body.bitlyToken = bitlyToken;
            }

            const response = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json();

            if (response.ok) {
                resultUrlInput.value = data.shortUrl;
                shortenResultBox.classList.remove('hidden');
                longUrlInput.value = '';
                aliasInput.value   = '';
            } else {
                if (provider === 'tinyurl' && shouldRequestUserToken(data, tinyurlToken)) {
                    revealTinyurlSection(shortenTinyurlSection, shortenTinyurlTokenInput);
                    hideError(errorMessage);
                } else if (provider === 'bitly' && shouldRequestUserToken(data, bitlyToken)) {
                    revealTinyurlSection(shortenBitlySection, shortenBitlyTokenInput);
                    hideError(errorMessage);
                } else {
                    showError(errorMessage, data.error || 'Failed to shorten URL.');
                }
            }
        } catch {
            showError(errorMessage, 'An error occurred. Please try again.');
        } finally {
            shortenBtn.disabled = false;
            shortenBtn.textContent = 'Shorten URL';
        }
    });

    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(resultUrlInput.value);
            const orig = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(() => { copyBtn.innerHTML = orig; }, 2000);
        } catch {
            resultUrlInput.select();
            document.execCommand('copy');
        }
    });

    // ── QR tab ────────────────────────────────────────────────────────────────
    const generateQrBtn   = document.getElementById('generate-qr-btn');
    const qrUrlInput      = document.getElementById('qr-url');
    const qrUrlShell      = document.getElementById('qr-url-shell');
    const qrUrlValidation = document.getElementById('qr-url-validation');
    const qrAliasInput    = document.getElementById('qr-short-alias');
    const qrResultBox     = document.getElementById('qr-result');
    const qrImg           = document.getElementById('qr-img');
    const qrDownload      = document.getElementById('qr-download');
    const qrErrorMessage  = document.getElementById('qr-error-message');

    qrUrlInput.addEventListener('input', () => {
        if (qrUrlInput.value.trim()) clearFieldValidation(qrUrlShell, qrUrlValidation);
    });

    // ── Domain change (QR tab) ────────────────────────────────────────────────
    if (qrDomainSelect) {
        qrDomainSelect.addEventListener('change', () => {
            if (qrTinyurlSection) qrTinyurlSection.classList.add('hidden');
            if (qrBitlySection) qrBitlySection.classList.add('hidden');
            hideError(qrErrorMessage);
        });
    }

    // ── QR Color click handler ───────────────────────────────────────────────
    const colorOpts = document.querySelectorAll('.color-opt');
    colorOpts.forEach(opt => {
        opt.addEventListener('click', async () => {
            const shortUrl = qrResultBox.dataset.shortUrl;
            if (!shortUrl) return;

            // Update active state
            colorOpts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');

            const selectedColor = opt.dataset.color;

            try {
                qrImg.style.opacity = '0.5';
                const qrResponse = await fetch('/api/qr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: shortUrl, darkColor: selectedColor })
                });
                const qrData = await qrResponse.json();

                if (qrResponse.ok) {
                    qrImg.src       = qrData.qrCode;
                    qrDownload.href = qrData.qrCode;
                } else {
                    showError(qrErrorMessage, qrData.error || 'Failed to regenerate QR.');
                }
            } catch {
                showError(qrErrorMessage, 'An error occurred while changing QR color.');
            } finally {
                qrImg.style.opacity = '1';
            }
        });
    });

    generateQrBtn.addEventListener('click', async () => {
        const longUrl  = qrUrlInput.value.trim();
        const alias    = qrAliasInput ? qrAliasInput.value.trim() : '';
        const provider = getProvider(qrDomainSelect);
        const tinyurlToken = provider === 'tinyurl' ? getTinyurlTokenValue() : '';
        const bitlyToken   = provider === 'bitly' ? getBitlyTokenValue() : '';

        if (!longUrl) {
            hideError(qrErrorMessage);
            showFieldValidation(qrUrlInput, qrUrlShell, qrUrlValidation, 'Required field');
            return;
        }

        clearFieldValidation(qrUrlShell, qrUrlValidation);
        generateQrBtn.disabled = true;
        generateQrBtn.textContent = 'Generating...';
        hideError(qrErrorMessage);
        qrResultBox.classList.add('hidden');

        try {
            const body = { longUrl, provider };
            if (provider === 'tinyurl') {
                body.alias = alias;
                body.tinyurlToken = tinyurlToken;
            } else if (provider === 'bitly') {
                body.alias = alias;
                body.bitlyToken = bitlyToken;
            }

            const shortenResponse = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const shortenData = await shortenResponse.json();

            if (!shortenResponse.ok) {
                if (provider === 'tinyurl' && shouldRequestUserToken(shortenData, tinyurlToken)) {
                    revealTinyurlSection(qrTinyurlSection, qrTinyurlTokenInput);
                    hideError(qrErrorMessage);
                } else if (provider === 'bitly' && shouldRequestUserToken(shortenData, bitlyToken)) {
                    revealTinyurlSection(qrBitlySection, qrBitlyTokenInput);
                    hideError(qrErrorMessage);
                } else {
                    showError(qrErrorMessage, shortenData.error || 'Failed to prepare URL for QR code.');
                }
                return;
            }

            // Get currently selected color
            const activeColorOpt = document.querySelector('.color-opt.active');
            const darkColor = activeColorOpt ? activeColorOpt.dataset.color : '#0f172a';

            const qrResponse = await fetch('/api/qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: shortenData.shortUrl, darkColor: darkColor })
            });
            const qrData = await qrResponse.json();

            if (!qrResponse.ok) {
                showError(qrErrorMessage, qrData.error || 'Failed to generate QR.');
                return;
            }

            // Store shortUrl on the result container for real-time color changes
            qrResultBox.dataset.shortUrl = shortenData.shortUrl;

            qrImg.src       = qrData.qrCode;
            qrDownload.href = qrData.qrCode;
            qrResultBox.classList.remove('hidden');
            qrUrlInput.value = '';
            if (qrAliasInput) qrAliasInput.value = '';
        } catch {
            showError(qrErrorMessage, 'An error occurred. Please try again.');
        } finally {
            generateQrBtn.disabled = false;
            generateQrBtn.textContent = 'Generate QR Code';
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function populateDomainSelect(el) {
        if (!el) return;
        el.innerHTML = `
            <option value="bitly">bit.ly</option>
            <option value="tinyurl">tinyurl.com</option>
        `;
        el.value    = 'bitly';
        el.disabled = false;
    }

    function getProvider(selectEl) {
        return selectEl && selectEl.value === 'bitly' ? 'bitly' : 'tinyurl';
    }

    function toggleAliasGroup(aliasGroup, isBitly) {
        if (!aliasGroup) return;
        aliasGroup.style.display = isBitly ? 'none' : '';
    }

    function revealTinyurlSection(section, input) {
        if (!section) return;
        section.classList.remove('hidden');
        if (input) {
            input.focus();
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function getTinyurlTokenValue() {
        for (const input of tinyurlTokenInputs) {
            if (input && input.value.trim()) return input.value.trim();
        }
        return tinyurlTokenInputs[0] ? tinyurlTokenInputs[0].value.trim() : '';
    }

    function setTinyurlTokenValue(value) {
        tinyurlTokenInputs.forEach(i => { if (i) i.value = value; });
    }

    function getBitlyTokenValue() {
        for (const input of bitlyTokenInputs) {
            if (input && input.value.trim()) return input.value.trim();
        }
        return bitlyTokenInputs[0] ? bitlyTokenInputs[0].value.trim() : '';
    }

    function setBitlyTokenValue(value) {
        bitlyTokenInputs.forEach(i => { if (i) i.value = value; });
    }

    function syncInputs(inputs, sourceInput) {
        inputs.forEach(input => {
            if (input && input !== sourceInput && input.value !== sourceInput.value) {
                input.value = sourceInput.value;
            }
        });
    }

    function shouldRequestUserToken(responseData, submittedToken) {
        if (submittedToken) return false;
        if (responseData && responseData.requiresUserToken) return true;
        return isTokenError(responseData && responseData.error);
    }

    function isTokenError(message) {
        if (typeof message !== 'string') return false;
        const m = message.toLowerCase();
        return ['token', 'permission', 'unauthorized', 'forbidden', 'rate', 'limit', 'quota', 'plan']
            .some(f => m.includes(f));
    }

    function showError(el, message) {
        el.textContent = normalizeMessage(message);
        el.classList.remove('hidden');
    }

    function hideError(el) {
        el.classList.add('hidden');
        el.textContent = '';
    }

    function showFieldValidation(input, shell, msgEl, message) {
        if (msgEl) { msgEl.textContent = message; msgEl.classList.remove('hidden'); }
        if (shell) shell.classList.add('is-invalid');
        if (input) input.focus();
    }

    function clearFieldValidation(shell, msgEl) {
        if (msgEl) { msgEl.classList.add('hidden'); msgEl.textContent = 'Required field'; }
        if (shell) shell.classList.remove('is-invalid');
    }

    function normalizeMessage(message) {
        if (typeof message !== 'string') return 'Something went wrong.';
        if (message.toLowerCase().includes('unauthenticated')) {
            return 'Please enter a valid TinyURL API token.';
        }
        return message
            .replace(/\bAlias\b/g, 'Custom link')
            .replace(/\balias\b/g, 'custom link');
    }

    function loadToken(key) {
        try { return window.localStorage.getItem(key) || ''; }
        catch { return ''; }
    }

    function saveToken(key, value) {
        try {
            const v = value.trim();
            if (v) window.localStorage.setItem(key, v);
            else   window.localStorage.removeItem(key);
        } catch { /* ignore */ }
    }
});
