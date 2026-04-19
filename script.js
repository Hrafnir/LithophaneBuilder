/* Version: #4 */

// === SEKSJON: Systemlogg ===
const systemLog = document.getElementById('systemLog');
const logContainer = document.querySelector('.log-container');

/**
 * Hjelpefunksjon for å skrive ut detaljert logg i brukergrensesnittet.
 * @param {string} message - Meldingen som skal logges
 * @param {string} type - 'normal', 'success', 'warning', eller 'error'
 */
function logMessage(message, type = 'normal') {
    const li = document.createElement('li');
    const timestamp = new Date().toLocaleTimeString();
    li.textContent = `[${timestamp}] ${message}`;
    
    if (type !== 'normal') {
        li.classList.add(`log-${type}`);
    }
    
    systemLog.appendChild(li);
    // Auto-scroll til bunnen slik at nyeste logg alltid synes
    logContainer.scrollTop = logContainer.scrollHeight;
}

// === SEKSJON: Variabler og DOM-elementer ===
const canvas = document.getElementById('previewCanvas');
// Bruker willReadFrequently for bedre ytelse når vi henter ut pikseldata ofte
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let originalImage = null; // Lagrer bildeobjektet for å unngå tap av kvalitet ved gjentatte filter-applikasjoner

// UI Elementer for 2D og 3D justeringer
const imageInput = document.getElementById('imageInput');
const contrastSlider = document.getElementById('contrastSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const invertCheckbox = document.getElementById('invertCheckbox');
const generateBtn = document.getElementById('generateBtn');

// === SEKSJON: Hendelseslyttere for UI ===

// Oppdaterer tallverdiene (spans) dynamisk når glidere dras
document.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.addEventListener('input', (e) => {
        const spanId = e.target.id.replace('Slider', 'Value');
        const span = document.getElementById(spanId);
        if (span) {
            span.textContent = e.target.value;
        }
        
        // Hvis brukeren drar i 2D-filter gliderne, oppdater Canvas umiddelbart i sanntid
        if (e.target.id === 'contrastSlider' || e.target.id === 'brightnessSlider') {
            updateCanvas();
        }
    });
});

invertCheckbox.addEventListener('change', updateCanvas);

// === SEKSJON: Bildeopplasting ===
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
        logMessage('Ingen fil valgt. Avbryter bildeinnlesing.', 'warning');
        return;
    }

    logMessage(`Starter innlesing av fil: ${file.name} (Størrelse: ${Math.round(file.size / 1024)} KB)`, 'normal');
    
    const reader = new FileReader();
    
    reader.onload = (event) => {
        logMessage('Fil lest til minnet. Dekoder bilde...', 'normal');
        const img = new Image();
        
        img.onload = () => {
            originalImage = img;
            logMessage(`Bilde dekodet vellykket: ${img.width}x${img.height} piksler`, 'success');
            // Når bildet er lastet, tegn det på canvas med en gang
            updateCanvas();
        };
        
        img.onerror = () => {
            logMessage('Kritisk feil: Kunne ikke dekode bildedata.', 'error');
        };
        
        img.src = event.target.result;
    };
    
    reader.onerror = () => {
        logMessage('Kritisk feil ved lesing av fil fra disk.', 'error');
    };
    
    reader.readAsDataURL(file);
});

// === SEKSJON: Canvas & Bildebehandling (2D) ===

/**
 * Tegner bildet til canvas og påfører 2D-filtrene (Mono, Kontrast, Lysstyrke)
 * basert på brukerens innstillinger. Denne kalkulerer på pikselnivå.
 */
function updateCanvas() {
    if (!originalImage) return;

    logMessage('Starter piksel-prosessering for 2D-forhåndsvisning...', 'normal');
    
    // Sett canvas-dimensjoner basert på bildet (begrenset for visning, 
    // men vi beholder aspektforholdet)
    const MAX_PREVIEW_WIDTH = 800;
    let drawWidth = originalImage.width;
    let drawHeight = originalImage.height;

    if (drawWidth > MAX_PREVIEW_WIDTH) {
        const ratio = MAX_PREVIEW_WIDTH / drawWidth;
        drawWidth = MAX_PREVIEW_WIDTH;
        drawHeight = drawHeight * ratio;
        logMessage(`Skalerer preview-canvas til ${drawWidth.toFixed(0)}x${drawHeight.toFixed(0)} for bedre ytelse.`, 'normal');
    }

    canvas.width = drawWidth;
    canvas.height = drawHeight;

    // 1. Tegn originalbildet rent på canvas
    ctx.drawImage(originalImage, 0, 0, drawWidth, drawHeight);

    // 2. Hent ut den rå pikseldataen (et gigantisk array av RGBA verdier: [R, G, B, A, R, G, B, A...])
    const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);
    const data = imageData.data;

    // Hent verdier fra UI
    const contrast = parseInt(contrastSlider.value);
    const brightness = parseInt(brightnessSlider.value);
    const invert = invertCheckbox.checked;

    logMessage(`Påfører filtre: Kontrast=${contrast}, Lysstyrke=${brightness}, Invertert=${invert}`, 'normal');

    // Forhåndsberegn kontrastfaktor for algoritmen: (259 * (C + 255)) / (255 * (259 - C))
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Iterer gjennom hver piksel. data-arrayet hopper med 4 for hver piksel (R, G, B, Alpha)
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i+1];
        let b = data[i+2];

        // --- Juster lysstyrke ---
        r += brightness;
        g += brightness;
        b += brightness;

        // --- Juster kontrast ---
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;

        // --- Konverter til Mono (Gråtone) ---
        // Bruker standard Luminance formel som tilsvarer hvordan det menneskelige øyet oppfatter lysstyrke
        let gray = (0.299 * r) + (0.587 * g) + (0.114 * b);

        // Clamping: Sørg for at verdien forblir innenfor 0 - 255
        gray = Math.max(0, Math.min(255, gray));

        // --- Inverter ---
        if (invert) {
            gray = 255 - gray;
        }

        // Skriv den nye gråtone-verdien tilbake til R, G, og B kanalene
        data[i]     = gray; // Red
        data[i+1]   = gray; // Green
        data[i+2]   = gray; // Blue
        // data[i+3] er Alpha, den rører vi ikke (forblir opak)
    }

    // 3. Tegn de modifiserte pikslene tilbake til canvas
    ctx.putImageData(imageData, 0, 0);
    logMessage('Piksel-prosessering fullført. Canvas oppdatert.', 'success');
    
    // Nå som vi har et behandlet bilde, kan vi la brukeren eksportere det
    generateBtn.disabled = false;
}

// Initialisering ved oppstart
logMessage('Lithophane Generator Engine startet v1.0', 'success');
logMessage('Venter på bilde...', 'normal');

/* Version: #4 */
