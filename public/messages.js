        // Cambiar los mensajes de validación de los inputs
        document.querySelector('input[name="image"]').addEventListener('invalid', function() {
            this.setCustomValidity('Por favor, sube una imagen.');
        });

        document.querySelector('input[name="criterio"]').addEventListener('invalid', function() {
            this.setCustomValidity('Por favor, introduce un criterio de evaluación.');
        });

        // Restablecer mensajes cuando el usuario interactúa con el campo
        document.querySelector('input[name="image"]').addEventListener('input', function() {
            this.setCustomValidity('');
        });

        document.querySelector('input[name="criterio"]').addEventListener('input', function() {
            this.setCustomValidity('');
        });