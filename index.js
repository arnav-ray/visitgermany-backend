'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { TranslationServiceClient } = require('@google-cloud/translate');

// ---------------------------------------------------------------------------
// Configuration — all secrets via environment variables, never hardcoded
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_LOCATION = process.env.GCP_LOCATION || 'global';
const SHEETS_API_KEY = process.env.SHEETS_API_KEY;
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';  // e.g. https://your-frontend.com
const API_SECRET = process.env.API_SECRET;                // Shared secret for X-API-Key header

if (!GCP_PROJECT_ID) {
    console.error('FATAL: GCP_PROJECT_ID environment variable is not set.');
    process.exit(1);
}
if (!SHEETS_API_KEY || !SHEET_ID) {
    console.error('FATAL: SHEETS_API_KEY and SHEET_ID environment variables must be set.');
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Allowed target languages — strict allowlist, no arbitrary language codes
// ---------------------------------------------------------------------------
const ALLOWED_LANGS = new Set(['hi', 'bn', 'mr', 'gu', 'ta', 'te', 'kn', 'ml']);
const MAX_TEXT_LENGTH = 500;

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
const translationClient = new TranslationServiceClient();

// Security headers
app.use(helmet());

// CORS — restrict to the known frontend origin
const corsOptions = ALLOWED_ORIGIN
    ? { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'X-API-Key'] }
    : { origin: false };
app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' }));  // Prevent oversized request bodies

// ---------------------------------------------------------------------------
// Rate limiting — 30 requests per minute per IP
// ---------------------------------------------------------------------------
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// ---------------------------------------------------------------------------
// Authentication middleware — validate shared-secret header
// ---------------------------------------------------------------------------
function requireApiKey(req, res, next) {
    if (!API_SECRET) {
        // If no secret is configured, skip auth (development mode)
        return next();
    }
    const providedKey = req.headers['x-api-key'];
    if (!providedKey || providedKey !== API_SECRET) {
        return res.status(401).json({ error: 'Unauthorized.' });
    }
    next();
}

// ---------------------------------------------------------------------------
// Health check — public, no auth required
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Translation service is running.' });
});

// ---------------------------------------------------------------------------
// GET /phrases — proxies Google Sheets, keeps SHEETS_API_KEY server-side
// ---------------------------------------------------------------------------
app.get('/phrases', requireApiKey, async (req, res) => {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}?key=${SHEETS_API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) {
            console.error('Sheets API error:', response.status);
            return res.status(502).json({ error: 'Failed to fetch phrases.' });
        }
        const data = await response.json();
        const phrases = parseSheetData(data.values);
        res.status(200).json(phrases);
    } catch (error) {
        console.error('ERROR in /phrases:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

function parseSheetData(rows) {
    if (!rows || rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    const idx = {
        germanClean:  headers.indexOf('German_Phrase_Clean'),
        germanStyled: headers.indexOf('Color_Coded_German'),
        english:      headers.indexOf('English_Translation'),
        category:     headers.indexOf('Category'),
        status:       headers.indexOf('Status'),
    };

    const phrases = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row[idx.status] === 'Published') {
            phrases.push({
                germanClean:  String(row[idx.germanClean]  || ''),
                germanStyled: String(row[idx.germanStyled] || ''),
                english:      String(row[idx.english]      || ''),
                category:     String(row[idx.category]     || ''),
            });
        }
    }
    return phrases;
}

// ---------------------------------------------------------------------------
// POST /translate — translates + transliterates German text
// ---------------------------------------------------------------------------
app.post('/translate', requireApiKey, async (req, res) => {
    try {
        const { text, targetLang } = req.body;

        // Input validation
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Missing or empty "text" parameter.' });
        }
        if (text.length > MAX_TEXT_LENGTH) {
            return res.status(400).json({ error: `"text" exceeds maximum length of ${MAX_TEXT_LENGTH} characters.` });
        }
        if (!targetLang || !ALLOWED_LANGS.has(targetLang)) {
            return res.status(400).json({ error: 'Invalid or unsupported "targetLang".' });
        }

        const parent = `projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}`;
        const sourceLang = 'de';

        // Translation
        const [translateResponse] = await translationClient.translateText({
            parent,
            contents: [text],
            mimeType: 'text/plain',
            sourceLanguageCode: sourceLang,
            targetLanguageCode: targetLang,
        });
        const translation = translateResponse.translations[0].translatedText;

        // Transliteration (best-effort — not all language pairs are supported)
        let phonetic = text;
        try {
            const [transliterateResponse] = await translationClient.transliterateText({
                parent,
                contents: [text],
                targetLanguageCode: targetLang,
                sourceLanguageCode: sourceLang,
            });
            phonetic = transliterateResponse.transliterations[0].transliteratedText;
        } catch (e) {
            console.warn(`Transliteration unavailable for "${text}" → ${targetLang}`);
        }

        res.status(200).json({ translation, phonetic });

    } catch (error) {
        console.error('ERROR in /translate:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((req, res) => {
    res.status(404).json({ error: 'Not found.' });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
