/* Version: #5 */

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

// Nye DOM-elementer for 3D innstillinger
const maxWidthSlider = document.getElementById('maxWidthSlider');
const minThickSlider = document.getElementById('minThickSlider');
const maxThickSlider = document.getElementById('maxThickSlider');
const borderSlider = document.getElementById('borderSlider');

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

// === SEKSJON: 3D Geometri og 3MF Eksport ===

generateBtn.addEventListener('click', async () => {
    if (!originalImage || !window.JSZip) {
        logMessage('Feil: Bilde mangler eller JSZip er ikke lastet.', 'error');
        return;
    }

    // Lås UI under generering
    generateBtn.disabled = true;
    const originalBtnText = generateBtn.textContent;
    generateBtn.textContent = 'Genererer 3MF... Vennligst vent';

    try {
        logMessage('Starter 3D-generering. Henter innstillinger...', 'normal');

        // 1. Hent variabler
        const maxWidth = parseFloat(maxWidthSlider.value);
        const minThick = parseFloat(minThickSlider.value);
        const maxThick = parseFloat(maxThickSlider.value);
        const borderWidth = parseFloat(borderSlider.value);

        // Vi fastsetter en oppløsning (vertices per millimeter) for å unngå nettleserkrasj
        const resolution = 4; // 4 punkter per mm gir en god balanse mellom detaljer og filstørrelse

        // 2. Regn ut dimensjoner for bilde-delen
        const aspectRatio = canvas.height / canvas.width;
        const imgRealWidth = maxWidth;
        const imgRealHeight = maxWidth * aspectRatio;

        const imgCols = Math.floor(imgRealWidth * resolution);
        const imgRows = Math.floor(imgRealHeight * resolution);

        logMessage(`Beregnet bilde-mesh: ${imgCols} x ${imgRows} vertices (${imgRealWidth.toFixed(1)}mm x ${imgRealHeight.toFixed(1)}mm)`, 'normal');

        // 3. Regn ut dimensjoner for rammen
        const borderCells = Math.round(borderWidth * resolution);
        const totalCols = imgCols + (borderCells * 2);
        const totalRows = imgRows + (borderCells * 2);

        const totalWidth = totalCols / resolution;
        const totalHeight = totalRows / resolution;

        logMessage(`Total mesh inkl. ramme: ${totalCols} x ${totalRows} vertices. Total stående størrelse: B:${totalWidth.toFixed(1)}mm, H:${totalHeight.toFixed(1)}mm`, 'normal');

        // 4. Skaler canvasdata ned til vår oppløsning i et temporært canvas for å hente riktige piksler
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgCols;
        tempCanvas.height = imgRows;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0, imgCols, imgRows);
        const imgData = tempCtx.getImageData(0, 0, imgCols, imgRows).data;

        // 5. Bygg XML strings direkte i minnet
        logMessage('Kalkulerer 3D vertices (punkter)...', 'normal');
        let verticesXML = [];
        
        // Hjelpefunksjon for å hente tykkelse på en gitt (row, col)
        const getThickness = (r, c) => {
            // Sjekk om vi er i rammen
            if (r < borderCells || r >= totalRows - borderCells || c < borderCells || c >= totalCols - borderCells) {
                return maxThick; // Rammen er alltid maks tykkelse
            }
            
            // Vi er i bildet. Hent piksel.
            const imgR = r - borderCells;
            const imgC = c - borderCells;
            const idx = (imgR * imgCols + imgC) * 4;
            const gray = imgData[idx]; // R kanal er nok siden vi har gjort bildet grått
            
            // Konverter gråtone (0-255) til tykkelse.
            // Svart (0) = maks tykkelse, Hvit (255) = min tykkelse
            return minThick + (1 - (gray / 255)) * (maxThick - minThick);
        };

        // Generer Front Vertices
        for (let r = 0; r < totalRows; r++) {
            for (let c = 0; c < totalCols; c++) {
                let x = (c / resolution);
                // For at den skal stå oppreist, lar vi Z være høyde.
                // r=0 er toppen, så Z er høyest her.
                let z = totalHeight - (r / resolution); 
                let y = getThickness(r, c); // Y er dybden/tykkelsen
                verticesXML.push(`<vertex x="${x.toFixed(3)}" y="${y.toFixed(3)}" z="${z.toFixed(3)}"/>`);
            }
        }

        // Generer Bakside Vertices (Flatt på Y=0)
        let backStartIndex = totalRows * totalCols;
        for (let r = 0; r < totalRows; r++) {
            for (let c = 0; c < totalCols; c++) {
                let x = (c / resolution);
                let z = totalHeight - (r / resolution);
                let y = 0;
                verticesXML.push(`<vertex x="${x.toFixed(3)}" y="${y.toFixed(3)}" z="${z.toFixed(3)}"/>`);
            }
        }

        logMessage('Kalkulerer 3D faces (trekanter)...', 'normal');
        let trianglesXML = [];
        const addTri = (v1, v2, v3) => trianglesXML.push(`<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`);

        // Front faces
        for (let r = 0; r < totalRows - 1; r++) {
            for (let c = 0; c < totalCols - 1; c++) {
                let i = r * totalCols + c;
                addTri(i, i + totalCols, i + totalCols + 1);
                addTri(i, i + totalCols + 1, i + 1);
            }
        }

        // Bakside faces
        for (let r = 0; r < totalRows - 1; r++) {
            for (let c = 0; c < totalCols - 1; c++) {
                let i = backStartIndex + r * totalCols + c;
                addTri(i, i + 1, i + totalCols + 1);
                addTri(i, i + totalCols + 1, i + totalCols);
            }
        }

        // Vegger: Forbinder forside og bakside
        // Topp kant
        for (let c = 0; c < totalCols - 1; c++) {
            let f1 = c; let f2 = c + 1;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, b1, b2); addTri(f1, b2, f2);
        }
        // Bunn kant
        let botR = totalRows - 1;
        for (let c = 0; c < totalCols - 1; c++) {
            let f1 = botR * totalCols + c; let f2 = botR * totalCols + c + 1;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, f2, b2); addTri(f1, b2, b1);
        }
        // Venstre kant
        for (let r = 0; r < totalRows - 1; r++) {
            let f1 = r * totalCols; let f2 = (r + 1) * totalCols;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, b2, b1); addTri(f1, f2, b2);
        }
        // Høyre kant
        let rightC = totalCols - 1;
        for (let r = 0; r < totalRows - 1; r++) {
            let f1 = r * totalCols + rightC; let f2 = (r + 1) * totalCols + rightC;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, b1, b2); addTri(f1, b2, f2);
        }

        logMessage(`Mesh ferdig. ${verticesXML.length} vertices og ${trianglesXML.length} trekanter. Pakker 3MF...`, 'success');

        // 6. Bygg 3MF filer (Zippet XML)
        const zip = new JSZip();

        // [Content_Types].xml
        const contentTypesXML = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;
        zip.file("[Content_Types].xml", contentTypesXML);

        // _rels/.rels
        const relsXML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;
        zip.folder("_rels").file(".rels", relsXML);

        // 3D/3dmodel.model
        const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>\n${verticesXML.join('\n')}\n</vertices>
        <triangles>\n${trianglesXML.join('\n')}\n</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;
        zip.folder("3D").file("3dmodel.model", modelXML);

        // 7. Generer og last ned
        logMessage('Komprimerer data, vennligst vent...', 'normal');
        
        // Siden generateAsync tar litt tid på store filer, bruker vi await
        const content = await zip.generateAsync({type: "blob", compression: "DEFLATE"});
        
        logMessage('Generering fullført! Starter nedlasting.', 'success');
        
        // Trigger nedlasting
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "lithophane.3mf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

    } catch (error) {
        logMessage(`En feil oppstod under generering: ${error.message}`, 'error');
        console.error(error);
    } finally {
        // Lås opp UI igjen
        generateBtn.disabled = false;
        generateBtn.textContent = originalBtnText;
    }
});

// Initialisering ved oppstart
logMessage('Lithophane Generator Engine startet v1.0', 'success');
logMessage('Venter på bilde...', 'normal');

/* Version: #5 */
