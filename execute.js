let isCameraActive = false;  // Para rastrear si la cámara está activa
let capturedBlob = null; // Para almacenar la imagen capturada

document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Mostrar el spinner de carga
    const spinner = document.getElementById('loadingSpinner');
    spinner.style.display = 'flex';

    const formData = new FormData();
    const fileInput = document.getElementById('fileInput');
    const cameraPreview = document.getElementById('camera-preview');

    if (capturedBlob) {
        // Si se ha capturado una imagen desde la cámara, agregarla
        formData.append('image', capturedBlob, 'camera-image.jpg');
        console.log('Enviando imagen desde la cámara');
    } else if (fileInput.files.length > 0) {
        // Si se ha seleccionado un archivo, agregar el archivo
        formData.append('image', fileInput.files[0]);
        console.log('Enviando archivo seleccionado');
    } else {
        console.error('No se ha seleccionado ningún archivo ni se ha capturado una imagen.');
        return;
    }

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
        console.error('Error al procesar la imagen:', error);
    } finally {
        // Ocultar el spinner de carga
        spinner.style.display = 'none';
    }
});

// Función para captura de imagen con cámara
document.getElementById('camera-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const cameraPreview = document.getElementById('camera-preview');
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('image-preview');
    const cameraButton = document.getElementById('camera-btn');

    if (!isCameraActive) {
        // Activar la cámara
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraPreview.srcObject = stream;
            cameraPreview.style.display = 'block';
            fileInput.style.display = 'none'; // Ocultar el input de archivo
            imagePreview.innerHTML = ''; // Limpiar la previsualización de imagen
            cameraButton.textContent = 'Tomar Foto'; // Cambiar el texto del botón
            isCameraActive = true;  // Marcar la cámara como activa
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            alert('No se pudo acceder a la cámara.');
        }
    } else {
        // Tomar la foto desde la cámara
        const canvas = document.createElement('canvas');
        canvas.width = cameraPreview.videoWidth;
        canvas.height = cameraPreview.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
        capturedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));

        // Mostrar la imagen capturada en la previsualización
        const imageDataURL = canvas.toDataURL('image/jpeg');
        imagePreview.innerHTML = `<img src="${imageDataURL}" alt="Captured image" />`;

        // Detener la cámara
        const stream = cameraPreview.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());

        cameraPreview.style.display = 'none'; // Ocultar el video
        cameraButton.textContent = 'Usar Cámara'; // Cambiar el texto del botón de nuevo
        fileInput.style.display = 'none'; // Mantener el input oculto
        fileInput.removeAttribute('required');  // Asegurarse de que el input de archivo no es requerido
        isCameraActive = false;  // Resetear la variable
    }
});

// Previsualización de la imagen seleccionada
document.querySelector('input[type="file"]').addEventListener('change', function() {
    const imagePreview = document.getElementById('image-preview');
    const file = this.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Image preview">`;
    }
    
    if (file) {
        reader.readAsDataURL(file);
        capturedBlob = null;  // Reiniciar el blob capturado ya que se seleccionó un archivo
    }
});
