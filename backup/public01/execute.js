document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Mostrar el spinner de carga
    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = 'block';

    const formData = new FormData();
    formData.append('image', document.querySelector('input[type="file"]').files[0]);
    formData.append('criterio', document.querySelector('input[name="criterio"]').value);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        const resultBox = document.getElementById('result');
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <strong>Texto Original (OCR):</strong> ${result.text}<br>
            <strong>Procesado:</strong> ${result.correctedText}<br>
            <strong>Evaluación:</strong> ${result.evaluation}<br>
            <strong>Justificación:</strong> ${result.justification}
        `;
    } catch (error) {
        const resultBox = document.getElementById('result');
        resultBox.style.display = 'block';
        resultBox.innerText = 'Error al procesar la imagen.';
    } finally {
        // Ocultar el spinner de carga
        spinner.style.display = 'none';
    }
});