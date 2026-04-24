// Esperar a que el HTML cargue completamente
document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    if (imageInput) {
        imageInput.addEventListener('change', (event) => {
            const processButton = document.getElementById('processButton');
            if (processButton) {
                processButton.disabled = event.target.files.length === 0;
            }
        });
    }
});

/**
 * Procesa la imagen cargada y extrae el texto mediante OCR.
 */
async function processImage() {
    const imageInput = document.getElementById('imageInput');
    const imageFile = imageInput.files[0];
    const progressStatus = document.getElementById('progressStatus');
    const processButton = document.getElementById('processButton');

    if (!imageFile) return;

    processButton.disabled = true;
    progressStatus.textContent = 'Preparando imagen...';

    const img = new Image();
    img.src = URL.createObjectURL(imageFile);

    img.onload = async () => {
        const processedImage = preprocessImage(img);

        try {
            progressStatus.textContent = 'Iniciando reconocimiento (OCR)...';
            const { data: { text } } = await Tesseract.recognize(
                processedImage, 
                'spa+eng',
                { logger: m => progressStatus.textContent = `Analizando imagen: ${Math.round(m.progress * 100)}%` }
            );

            // Limpieza del texto extraído
            const textWithLines = text.replace(/[|\\/_«»°¬]/g, '').trim();
            const lines = textWithLines.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            if (lines.length > 0) {
                document.getElementById('titulo').value = lines[0];
                document.getElementById('descripcion').value = lines.slice(1).join('\n');
                document.getElementById('ocrOutput').textContent = textWithLines;
                progressStatus.textContent = '¡Hecho! Título y descripción identificados.';
            } else {
                progressStatus.textContent = 'No se encontró texto claro en la imagen.';
            }

        } catch (error) {
            console.error("Error OCR:", error);
            progressStatus.textContent = 'Error al leer la imagen.';
        } finally {
            processButton.disabled = false;
        }
    };
}

/**
 * Compara el título y la descripción usando la API de Gemini.
 */
async function compareTextWithAI() {
    const titulo = document.getElementById('titulo').value;
    const descripcion = document.getElementById('descripcion').value;
    const apiKey = document.getElementById('apiKey').value.trim();
    const responseElement = document.getElementById('aiResponse');
    const percentageSpan = document.getElementById('percentage');

    if (!apiKey) {
        alert("Por favor, pega tu API Key de Gemini.");
        return;
    }

    if (!titulo || !descripcion) {
        alert("Asegúrate de tener texto en el título y la descripción.");
        return;
    }

    responseElement.textContent = "Consultando a la IA...";
    percentageSpan.textContent = "";

    const prompt = `Actúa como un experto en semántica. Compara la relación entre estos dos textos:
    TEXTO A: "${titulo}"
    TEXTO B: "${descripcion}"
    Responde únicamente con un objeto JSON: {"porcentaje": de 0 a 100, "explicacion": "breve resumen"}`;

    try {
        // Usamos la versión v1beta que es la más común para Gemini Flash
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();

        // Manejo de errores de la API de Google
        if (data.error) {
            throw new Error(`${data.error.code} - ${data.error.message}`);
        }

        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("La IA no devolvió candidatos. Revisa tu cuota de uso.");
        }

        const rawText = data.candidates[0].content.parts[0].text;
        
        // Extracción robusta del JSON entre llaves
        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        
        if (jsonStart === -1 || jsonEnd === -1) {
            throw new Error("La respuesta de la IA no tiene el formato correcto.");
        }
        
        const result = JSON.parse(rawText.substring(jsonStart, jsonEnd + 1));

        // Actualización de la interfaz
        percentageSpan.textContent = `${result.porcentaje}%`;
        responseElement.innerHTML = `<strong>Análisis:</strong> ${result.explicacion}`;
        
        // Aplicar clases de color según el porcentaje
        if (result.porcentaje > 70) percentageSpan.className = 'green';
        else if (result.porcentaje > 40) percentageSpan.className = 'yellow';
        else percentageSpan.className = 'red';

    } catch (error) {
        console.error("Error detallado:", error);
        responseElement.innerHTML = `<span style="color:red">Error: ${error.message}</span>`;
    }
}

/**
 * Procesa la imagen en un canvas para mejorar la lectura del OCR.
 */
function preprocessImage(imageElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = imageElement.width;
    canvas.height = imageElement.height;

    ctx.drawImage(imageElement, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const threshold = avg > 125 ? 255 : 0; 
        
        data[i]     = threshold;
        data[i + 1] = threshold;
        data[i + 2] = threshold;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
}
if (typeof module !== 'undefined') {
    module.exports = { preprocessImage, processImage, compareTextWithAI };
}