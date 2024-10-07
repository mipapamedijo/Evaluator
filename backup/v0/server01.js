import express from 'express';
import multer from 'multer';
import tesseract from 'tesseract.js';
import fs from 'fs';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import OpenAI from 'openai';
dotenv.config();

const app = express();
const port = 3000;
const openai = new OpenAI({ apiKey:""}); // Clave de API de OpenAI desde .env

// Configurar multer para manejar archivos subidos
const upload = multer({ dest: 'uploads/' });

app.use(express.json()); // Para manejar JSON en el cuerpo de las solicitudes
app.use(express.urlencoded({ extended: true })); // Para manejar datos de formulario

// Ruta para subir archivos
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        // Verificar si el archivo fue recibido
        console.log('Archivo recibido:', req.file);  // Agrega este log
        console.log('Criterio recibido:', req.body.criterio);  // Agrega este log

        // Verificar si se recibió el archivo
        if (!req.file) {
            console.error('No se recibió ningún archivo');  // Agrega este log
            return res.status(400).json({ message: 'No se recibió ningún archivo.' });
        }

        const path = req.file.path; // Ruta del archivo de imagen
        const criterio = req.body.criterio; // Obtener el criterio de evaluación del frontend

        // Realiza el OCR con Tesseract.js
        const { data: { text } } = await tesseract.recognize(path, 'eng');
        console.log('Texto extraído:', text);  // Agrega este log

        // Enviar el texto a Google Sheets (función previamente definida)
        await sendToGoogleSheets(text);

        // Procesar el texto con GPT-4 y el criterio
        const { correctedText, evaluation } = await analyzeWithGPT4(text, criterio);

        // Enviar la respuesta JSON
        res.json({ message: 'Archivo procesado', text, correctedText, evaluation });
    } catch (error) {
        // Registrar cualquier error que ocurra durante el procesamiento
        console.error('Error durante el procesamiento del archivo:', error);
        res.status(500).json({ message: 'Error al procesar el archivo' });
    } finally {
        // Intentar eliminar el archivo después del procesamiento, si es posible
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path); // Eliminar archivo temporal
                console.log('Archivo temporal eliminado:', req.file.path);  // Agrega este log
            } catch (unlinkError) {
                console.error('Error al eliminar el archivo temporal:', unlinkError);
            }
        }
    }
});


// Función para enviar el texto extraído a Google Sheets
async function sendToGoogleSheets(text) {
    const auth = new google.auth.GoogleAuth({
        keyFile: 'credentials.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const range = 'ORIGINAL!A1:A'; // Suponiendo que el texto va a la columna A

    await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: {
            values: [[text]],
        },
    });
}

// Función para procesar el texto con GPT-4 y devolver texto corregido y evaluación
async function analyzeWithGPT4(text, criterio) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Eres un asistente útil." },
                { role: "user", content: `Este texto proviene de OCR. Corrige los errores y evalúa el texto del 5 al 10 según el siguiente criterio: ${criterio}. El texto es: ${text}` }
            ],
        });
        const correctedText = completion.choices[0].message.content;
        console.log(correctedText);

        // Usar una expresión regular para extraer la calificación
        const evaluationRegex = /calificación.*?(\d+)/i;
        const evaluationMatch = correctedText.match(evaluationRegex);

        if (evaluationMatch && evaluationMatch[1]) {
            const evaluation = parseInt(evaluationMatch[1], 10); // Convertir a número entero
            console.log('Texto corregido:', correctedText);
            console.log('Evaluación:', evaluation);
            return { correctedText, evaluation };
        } else {
            throw new Error('No se pudo extraer la evaluación de OpenAI.');
        }
    } catch (error) {
        console.error('Error en la solicitud a OpenAI:', error);
        throw error;
    }
}

// Servir el frontend (carpeta pública estática)
app.use(express.static('public'));

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});