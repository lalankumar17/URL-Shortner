document.addEventListener('DOMContentLoaded', () => {
    const TINYURL_TOKEN_STORAGE_KEY = 'shorturl.tinyurlToken';
    const TINYURL_DOMAIN = 'https://tinyurl.com';

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(button => button.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-target')).classList.add('active');
        });
    });

    const domainSelect = document.getElementById('domain-select');
    const qrDomainSelect = document.getElementById('qr-domain-select');
    const tokenSections = document.querySelectorAll('.token-section');
    const shortenTinyurlTokenInput = document.getElementById('shorten-tinyurl-token');
    const qrTinyurlTokenInput = document.getElementById('qr-tinyurl-token');
    const tinyurlTokenInputs = [shortenTinyurlTokenInput, qrTinyurlTokenInput].filter(Boolean);
    const tokenToggleButtons = document.querySelectorAll('.token-toggle-btn');

    populateDomainSelect(domainSelect);
    populateDomainSelect(qrDomainSelect);

    const storedTinyurlToken = loadStoredTinyurlToken();
    if (storedTinyurlToken) {
        setTinyurlTokenValue(storedTinyurlToken);
    }

    tinyurlTokenInputs.forEach(input => {
        input.addEventListener('input', () => {
            syncTinyurlTokenInputs(input);
            persistTinyurlToken(input.value);
        });
    });

    tokenToggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetInput = document.getElementById(button.dataset.target);
            if (!targetInput) {
                return;
            }

            const isPassword = targetInput.type === 'password';
            targetInput.type = isPassword ? 'text' : 'password';
            button.innerHTML = isPassword
                ? '<i class="fa-regular fa-eye-slash"></i>'
                : '<i class="fa-regular fa-eye"></i>';
            button.setAttribute('aria-label', isPassword ? 'Hide TinyURL API token' : 'Show TinyURL API token');
        });
    });

    const shortenBtn = document.getElementById('shorten-btn');
    const longUrlInput = document.getElementById('long-url');
    const longUrlShell = document.getElementById('long-url-shell');
    const longUrlValidation = document.getElementById('long-url-validation');
    const aliasInput = document.getElementById('short-alias');
    const shortenResultBox = document.getElementById('shorten-result');
    const resultUrlInput = document.getElementById('result-url');
    const errorMessage = document.getElementById('error-message');
    const copyBtn = document.getElementById('copy-btn');

    longUrlInput.addEventListener('input', () => {
        if (longUrlInput.value.trim()) {
            clearFieldValidation(longUrlShell, longUrlValidation);
        }
    });

    shortenBtn.addEventListener('click', async () => {
        const longUrl = longUrlInput.value.trim();
        const alias = aliasInput.value.trim();
        const tinyurlToken = getTinyurlTokenValue();

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
            const response = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ longUrl, alias, tinyurlToken })
            });

            const data = await response.json();

            if (response.ok) {
                resultUrlInput.value = data.shortUrl;
                shortenResultBox.classList.remove('hidden');
                longUrlInput.value = '';
                aliasInput.value = '';
            } else {
                if (shouldRequestUserToken(data, tinyurlToken)) {
                    requestTinyurlToken(shortenTinyurlTokenInput);
                }

                showError(errorMessage, data.error || 'Failed to shorten URL.');
            }
        } catch (error) {
            showError(errorMessage, 'An error occurred. Please try again.');
        } finally {
            shortenBtn.disabled = false;
            shortenBtn.textContent = 'Shorten URL';
        }
    });

    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(resultUrlInput.value);
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        } catch (error) {
            resultUrlInput.select();
            document.execCommand('copy');
        }
    });

    const generateQrBtn = document.getElementById('generate-qr-btn');
    const qrUrlInput = document.getElementById('qr-url');
    const qrUrlShell = document.getElementById('qr-url-shell');
    const qrUrlValidation = document.getElementById('qr-url-validation');
    const qrAliasInput = document.getElementById('qr-short-alias');
    const qrResultBox = document.getElementById('qr-result');
    const qrImg = document.getElementById('qr-img');
    const qrDownload = document.getElementById('qr-download');
    const qrErrorMessage = document.getElementById('qr-error-message');

    qrUrlInput.addEventListener('input', () => {
        if (qrUrlInput.value.trim()) {
            clearFieldValidation(qrUrlShell, qrUrlValidation);
        }
    });

    generateQrBtn.addEventListener('click', async () => {
        const longUrl = qrUrlInput.value.trim();
        const alias = qrAliasInput ? qrAliasInput.value.trim() : '';
        const tinyurlToken = getTinyurlTokenValue();

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
            const shortenResponse = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ longUrl, alias, tinyurlToken })
            });

            const shortenData = await shortenResponse.json();
            if (!shortenResponse.ok) {
                if (shouldRequestUserToken(shortenData, tinyurlToken)) {
                    requestTinyurlToken(qrTinyurlTokenInput);
                }

                showError(qrErrorMessage, shortenData.error || 'Failed to prepare URL for QR code.');
                return;
            }

            const qrResponse = await fetch('/api/qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: shortenData.shortUrl })
            });

            const qrData = await qrResponse.json();
            if (!qrResponse.ok) {
                showError(qrErrorMessage, qrData.error || 'Failed to generate QR.');
                return;
            }

            qrImg.src = qrData.qrCode;
            qrDownload.href = qrData.qrCode;
            qrResultBox.classList.remove('hidden');
            qrUrlInput.value = '';
            if (qrAliasInput) {
                qrAliasInput.value = '';
            }
        } catch (error) {
            showError(qrErrorMessage, 'An error occurred. Please try again.');
        } finally {
            generateQrBtn.disabled = false;
            generateQrBtn.textContent = 'Generate QR Code';
        }
    });

    function populateDomainSelect(selectElement) {
        if (!selectElement) {
            return;
        }

        selectElement.innerHTML = `<option value="${TINYURL_DOMAIN}">tinyurl.com</option>`;
        selectElement.value = TINYURL_DOMAIN;
        selectElement.disabled = true;
    }

    function showError(element, message) {
        element.textContent = normalizeDisplayMessage(message);
        element.classList.remove('hidden');
    }

    function hideError(element) {
        element.classList.add('hidden');
        element.textContent = '';
    }

    function showFieldValidation(input, shell, messageElement, message) {
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.classList.remove('hidden');
        }

        if (shell) {
            shell.classList.add('is-invalid');
        }

        if (input) {
            input.focus();
        }
    }

    function clearFieldValidation(shell, messageElement) {
        if (messageElement) {
            messageElement.classList.add('hidden');
            messageElement.textContent = 'Required field';
        }

        if (shell) {
            shell.classList.remove('is-invalid');
        }
    }

    function getTinyurlTokenValue() {
        if (!tinyurlTokenInputs.length || !areTinyurlTokenSectionsVisible()) {
            return '';
        }

        return tinyurlTokenInputs[0].value.trim();
    }

    function setTinyurlTokenValue(value) {
        tinyurlTokenInputs.forEach(input => {
            input.value = value;
        });
    }

    function syncTinyurlTokenInputs(sourceInput) {
        tinyurlTokenInputs.forEach(input => {
            if (input !== sourceInput && input.value !== sourceInput.value) {
                input.value = sourceInput.value;
            }
        });
    }

    function requestTinyurlToken(targetInput) {
        if (!targetInput) {
            return;
        }

        showTinyurlTokenSections();
        targetInput.focus();
        targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function shouldRequestUserToken(responseData, submittedToken) {
        if (submittedToken) {
            return false;
        }

        if (responseData && responseData.requiresUserToken) {
            return true;
        }

        return isTokenError(responseData && responseData.error);
    }

    function isTokenError(message) {
        if (typeof message !== 'string') {
            return false;
        }

        const normalizedMessage = message.toLowerCase();
        return ['token', 'permission', 'unauthorized', 'forbidden', 'rate', 'limit', 'quota', 'plan']
            .some(fragment => normalizedMessage.includes(fragment));
    }

    function normalizeDisplayMessage(message) {
        if (typeof message !== 'string') {
            return 'Something went wrong.';
        }

        return message
            .replace(/\bAlias\b/g, 'Custom link')
            .replace(/\balias\b/g, 'custom link');
    }

    function areTinyurlTokenSectionsVisible() {
        return Array.from(tokenSections).some(section => !section.classList.contains('hidden'));
    }

    function showTinyurlTokenSections() {
        tokenSections.forEach(section => {
            section.classList.remove('hidden');
        });
    }

    function loadStoredTinyurlToken() {
        try {
            return window.localStorage.getItem(TINYURL_TOKEN_STORAGE_KEY) || '';
        } catch (error) {
            return '';
        }
    }

    function persistTinyurlToken(value) {
        try {
            const trimmedValue = value.trim();

            if (trimmedValue) {
                window.localStorage.setItem(TINYURL_TOKEN_STORAGE_KEY, trimmedValue);
            } else {
                window.localStorage.removeItem(TINYURL_TOKEN_STORAGE_KEY);
            }
        } catch (error) {
            // Ignore storage errors and continue using the in-memory input value.
        }
    }
});
