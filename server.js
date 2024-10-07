import express from 'express';
import multer from 'multer';
import tesseract from 'tesseract.js';
import fs from 'fs';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import vision from '@google-cloud/vision';

dotenv.config();

const app = express();
const port = 3000;
const openai =new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // API OPENAI
});

// Inicializamos el cliente de Google Cloud Vision con las mismas credenciales
const auth = new google.auth.GoogleAuth({
    keyFile: 'credentials.json',
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/cloud-platform'],
});
const visionClient = new vision.ImageAnnotatorClient({ auth }); // Google Vision

// Configurar multer para manejar archivos subidos
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        console.log('Archivo recibido:', req.file);
        console.log('Criterio recibido:', req.body.criterio);

        if (!req.file) {
            console.error('No se recibió ningún archivo');
            return res.status(400).json({ message: 'No se recibió ningún archivo.' });
        }

        const path = req.file.path;
        const criterio = req.body.criterio;

        // 1. Realiza el OCR con Tesseract.js
        let text = await recognizeTextWithTesseract(path);

        // 2. Si el texto extraído con Tesseract es de baja fidelidad, intenta con Google Vision
        if (!isTextValid(text)) {
            console.log('Texto de baja calidad. Cambiando a Google Vision...');
            text = await recognizeTextWithGoogleVision(path);
        }

        if (!text) {
            throw new Error('No se pudo extraer texto legible con ninguno de los métodos.');
        }

        // Procesar el texto con GPT-4o-mini para corregir el texto
        const correctedText = await correctTextWithGPT4(text);

        // Evaluar el texto corregido con el criterio
        const { evaluation, justification } = await evaluateTextWithGPT4(correctedText, criterio);

        // Enviar los datos a Google Sheets
        await sendToGoogleSheets(text, correctedText, evaluation, justification);

        // Enviar la respuesta JSON al cliente
        res.json({
            message: 'Archivo procesado',
            text,
            correctedText,
            evaluation,
            justification,
        });
    } catch (error) {
        console.error('Error durante el procesamiento del archivo:', error);
        res.status(500).json({ message: 'Error al procesar el archivo' });
    } finally {
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('Archivo temporal eliminado:', req.file.path);
            } catch (unlinkError) {
                console.error('Error al eliminar el archivo temporal:', unlinkError);
            }
        }
    }
});

// Función para reconocer texto con Tesseract.js
async function recognizeTextWithTesseract(path) {
    try {
        const { data: { text } } = await tesseract.recognize(path, 'spa+eng');
        console.log('Texto extraído con Tesseract:', text);
        return text;
    } catch (error) {
        console.error('Error con Tesseract:', error);
        return null;
    }
}

// Función para reconocer texto con Google Cloud Vision
async function recognizeTextWithGoogleVision(path) {
    try {
        const [result] = await visionClient.textDetection(path);
        const detections = result.textAnnotations;
        const text = detections[0] ? detections[0].description : null;
        console.log('Texto detectado con Google Vision:', text);
        return text;
    } catch (error) {
        console.error('Error con Google Vision:', error);
        return null;
    }
}

// Función para verificar la validez del texto extraído
function isTextValid(text) {
    return text && false;
    // return text && text.length > 20;
}

// Función para enviar el texto extraído y corregido a Google Sheets
async function sendToGoogleSheets(text, correctedText, evaluation, justification) {
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    // Enviar texto original a la hoja ORIGINAL!A
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'ORIGINAL!A:A',
        valueInputOption: 'RAW',
        resource: {
            values: [[text]],
        },
    });

    // Enviar texto corregido, evaluación y justificación a la hoja EVALUACIÓN!A, B, C
    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'EVALUACIÓN!A:C',
        valueInputOption: 'RAW',
        resource: {
            values: [[correctedText, evaluation, justification]],
        },
    });
}

// Función para corregir el texto con GPT-4
async function correctTextWithGPT4(text) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Corrige errores de caracteres por OCR, no agregues información que no esté escrita." },
                { role: "user", content: `Texto a corregir: ${text}` },
            ],
        });
        const correctedText = completion.choices[0].message.content;
        console.log('Texto corregido:', correctedText);
        return correctedText;
    } catch (error) {
        console.error('Error al corregir el texto con OpenAI:', error);
        throw error;
    }
}

// Función para evaluar el texto corregido con GPT-4
async function evaluateTextWithGPT4(correctedText, criterio) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Evalúa este texto en una escala del 5 al 10 basado en el criterio dado y proporciona una calificación y justificación. Presenta la respuesta en el formato 'Calificación: N' y 'Justificación: texto'." },
                { role: "user", content: `Texto corregido: ${correctedText}\nCriterio: ${criterio}` },
            ],
        });

        const response = completion.choices[0].message.content;
        console.log('Respuesta de OpenAI:', response);

        // Expresión regular ajustada para capturar "Calificación: N"
        const evaluationRegex = /Calificación:\s*(\d+)/i;
        const justificationRegex = /Justificación:\s*(.*)/i;

        const evaluationMatch = response.match(evaluationRegex);
        const justificationMatch = response.match(justificationRegex);

        if (evaluationMatch && evaluationMatch[1] && justificationMatch && justificationMatch[1]) {
            const evaluation = parseInt(evaluationMatch[1], 10); // Extraer la calificación numérica
            const justification = justificationMatch[1].trim(); // Extraer la justificación
            console.log('Calificación:', evaluation);
            console.log('Justificación:', justification);
            return { evaluation, justification };
        } else {
            throw new Error('No se pudo extraer la calificación o la justificación de OpenAI.');
        }
    } catch (error) {
        console.error('Error en la solicitud de evaluación a OpenAI:', error);
        throw error;
    }
}

// Servir el frontend (carpeta pública estática)
app.use(express.static('/'));

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
