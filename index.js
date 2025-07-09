const express = require('express');
const cors = require('cors');
const { TranslationServiceClient } = require('@google-cloud/translate');

const app = express();
const translationClient = new TranslationServiceClient();
const projectId = 'visitgermany';
const location = 'global';

// Use the cors library to handle all security and permission checks.
app.use(cors());
app.use(express.json());

// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Translation service is running.' });
});

// Main Translation Route
app.post('/', async (req, res) => {
    try {
        if (!req.body.text || !req.body.targetLang) {
            return res.status(400).json({ error: 'Missing parameters' });
        }
        const { text, targetLang } = req.body;
        const sourceLang = 'de';

        const translateRequest = {
            parent: `projects/${projectId}/locations/${location}`,
            contents: [text],
            mimeType: 'text/plain',
            sourceLanguageCode: sourceLang,
            targetLanguageCode: targetLang,
        };
        const [translateResponse] = await translationClient.translateText(translateRequest);
        const translation = translateResponse.translations[0].translatedText;

        let phonetic = text;
        try {
            const transliterateRequest = {
                parent: `projects/${projectId}/locations/${location}`,
                contents: [text],
                targetLanguageCode: targetLang,
                sourceLanguageCode: sourceLang,
            };
            const [transliterateResponse] = await translationClient.transliterateText(transliterateRequest);
            phonetic = transliterateResponse.transliterations[0].transliteratedText;
        } catch (e) {
            console.warn(`Could not transliterate "${text}" to ${targetLang}.`);
        }

        res.status(200).json({ translation, phonetic });

    } catch (error) {
        console.error('ERROR:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
