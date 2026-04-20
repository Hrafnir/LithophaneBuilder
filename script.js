/* Version: #10 */

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

// DOM-elementer for 3D innstillinger (fra V5)
const maxWidthSlider = document.getElementById('maxWidthSlider');
const minThickSlider = document.getElementById('minThickSlider');
const maxThickSlider = document.getElementById('maxThickSlider');
const borderSlider = document.getElementById('borderSlider');

// Nye DOM-elementer for Print-in-Place Base (fra V7/V8)
const enableBaseCheckbox = document.getElementById('enableBaseCheckbox');
const baseDepthSlider = document.getElementById('baseDepthSlider');
const baseHeightSlider = document.getElementById('baseHeightSlider');
const supportHeightSlider = document.getElementById('supportHeightSlider');
const toleranceSlider = document.getElementById('toleranceSlider');

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
 * basert på brukerens innstillinger. FULLT GJENOPPRETTET FRA V5.
 */
function updateCanvas() {
    if (!originalImage) return;

    logMessage('Starter piksel-prosessering for 2D-forhåndsvisning...', 'normal');
    
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

    // 2. Hent ut den rå pikseldataen
    const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);
    const data = imageData.data;

    // Hent verdier fra UI
    const contrast = parseInt(contrastSlider.value);
    const brightness = parseInt(brightnessSlider.value);
    const invert = invertCheckbox.checked;

    logMessage(`Påfører filtre: Kontrast=${contrast}, Lysstyrke=${brightness}, Invertert=${invert}`, 'normal');

    // Forhåndsberegn kontrastfaktor for algoritmen
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    // Iterer gjennom hver piksel (steg-for-steg for lesbarhet)
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
        let gray = (0.299 * r) + (0.587 * g) + (0.114 * b);

        // Clamping: Sørg for at verdien forblir innenfor 0 - 255
        gray = Math.max(0, Math.min(255, gray));

        // --- Inverter ---
        if (invert) {
            gray = 255 - gray;
        }

        // Skriv den nye gråtone-verdien tilbake
        data[i]     = gray;
        data[i+1]   = gray;
        data[i+2]   = gray;
    }

    // 3. Tegn de modifiserte pikslene tilbake til canvas
    ctx.putImageData(imageData, 0, 0);
    logMessage('Piksel-prosessering fullført. Canvas oppdatert.', 'success');
    
    generateBtn.disabled = false;
}

// === SEKSJON: 3D Geometri og 3MF Eksport ===

generateBtn.addEventListener('click', async () => {
    if (!originalImage || !window.JSZip) {
        logMessage('Feil: Bilde mangler eller JSZip er ikke lastet.', 'error');
        return;
    }

    generateBtn.disabled = true;
    const originalBtnText = generateBtn.textContent;
    generateBtn.textContent = 'Genererer 3MF... Vennligst vent';

    try {
        logMessage('Starter 3D-generering. Henter innstillinger...', 'normal');

        // 1. Hent variabler for Lithophane
        const maxWidth = parseFloat(maxWidthSlider.value);
        const minThick = parseFloat(minThickSlider.value);
        const maxThick = parseFloat(maxThickSlider.value);
        const borderWidth = parseFloat(borderSlider.value);
        const resolution = 4; // 4 punkter per mm

        // 2. Regn ut dimensjoner for bilde-delen
        const aspectRatio = canvas.height / canvas.width;
        const imgRealWidth = maxWidth;
        const imgRealHeight = maxWidth * aspectRatio;

        const imgCols = Math.floor(imgRealWidth * resolution);
        const imgRows = Math.floor(imgRealHeight * resolution);
        const borderCells = Math.round(borderWidth * resolution);
        
        const totalCols = imgCols + (borderCells * 2);
        const totalRows = imgRows + (borderCells * 2);
        const totalWidth = totalCols / resolution;
        const totalHeight = totalRows / resolution;

        // 3. Hent variabler for Print-in-Place Base
        const useBase = enableBaseCheckbox.checked;
        const baseDepth = parseFloat(baseDepthSlider.value);
        const baseHeight = parseFloat(baseHeightSlider.value);
        const supportH = parseFloat(supportHeightSlider.value);
        const tolerance = parseFloat(toleranceSlider.value);
        
        // Faste parametere for Base
        const slotDepth = 3.0; // Bildet går 3mm ned i basen
        const slotWidth = maxThick + (tolerance * 2); // Plass til maks tykkelse + toleranse
        
        // Offset for å flytte Lithophanen i 3D-rommet hvis basen brukes
        const lithoOffsetZ = useBase ? (baseHeight - slotDepth) : 0.0;
        const lithoOffsetY = useBase ? (baseDepth / 2) - (slotWidth / 2) + tolerance : 0.0;

        // 4. Skaler canvasdata ned for å hente riktige piksler
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgCols;
        tempCanvas.height = imgRows;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0, imgCols, imgRows);
        const imgData = tempCtx.getImageData(0, 0, imgCols, imgRows).data;

        // Opprett datastrukturer for 3D-geometri
        let vertices = [];
        let triangles = [];

        logMessage('Kalkulerer 3D vertices for Lithophane...', 'normal');
        
        const getThickness = (r, c) => {
            if (r < borderCells || r >= totalRows - borderCells || c < borderCells || c >= totalCols - borderCells) {
                return maxThick;
            }
            const imgR = r - borderCells;
            const imgC = c - borderCells;
            const idx = (imgR * imgCols + imgC) * 4;
            const gray = imgData[idx];
            return minThick + (1 - (gray / 255)) * (maxThick - minThick);
        };

        // --- GENERER LITHOPHANE (Fullstendig gjenopprettet fra V5, med Offsets) ---
        
        // Generer Front Vertices
        for (let r = 0; r < totalRows; r++) {
            for (let c = 0; c < totalCols; c++) {
                let x = (c / resolution);
                let z = lithoOffsetZ + totalHeight - (r / resolution); 
                let y = lithoOffsetY + getThickness(r, c); 
                vertices.push({x, y, z});
            }
        }

        // Generer Bakside Vertices (Flatt på lokal Y=0)
        let backStartIndex = totalRows * totalCols;
        for (let r = 0; r < totalRows; r++) {
            for (let c = 0; c < totalCols; c++) {
                let x = (c / resolution);
                let z = lithoOffsetZ + totalHeight - (r / resolution);
                let y = lithoOffsetY;
                vertices.push({x, y, z});
            }
        }

        logMessage('Kalkulerer solide 3D faces for Lithophane...', 'normal');
        const addTri = (v1, v2, v3) => triangles.push({v1, v2, v3});

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

        // Vegger: Forbinder forside og bakside (Kritisk manifold-kode gjenopprettet)
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

        // --- GENERER PRINT-IN-PLACE BASE (Integrert uten å slette noe) ---
        if (useBase) {
            logMessage('Bygger solid Print-in-Place Base med spor og støtter...', 'normal');
            
            const frontSlotY = 5.0; // Hvor front-sporet starter (5mm fra frontkanten)
            const centerSlotY = lithoOffsetY - tolerance; // Plasserer sentersporet nøyaktig der lithophanen er

            // Hjelpefunksjon for å generere manifold-bokser til basen
            const addBox = (x1, y1, z1, x2, y2, z2) => {
                let s = vertices.length;
                vertices.push(
                    {x:x1, y:y1, z:z1}, {x:x2, y:y1, z:z1}, {x:x2, y:y2, z:z1}, {x:x1, y:y2, z:z1}, // Bunn 0,1,2,3
                    {x:x1, y:y1, z:z2}, {x:x2, y:y1, z:z2}, {x:x2, y:y2, z:z2}, {x:x1, y:y2, z:z2}  // Topp 4,5,6,7
                );
                // Faces for boksen (Manifold)
                addTri(s+0, s+2, s+1); addTri(s+0, s+3, s+2); // Bunn
                addTri(s+4, s+5, s+6); addTri(s+4, s+6, s+7); // Topp
                addTri(s+0, s+1, s+5); addTri(s+0, s+5, s+4); // Front
                addTri(s+3, s+6, s+7); addTri(s+3, s+2, s+6); // Bak
                addTri(s+0, s+4, s+7); addTri(s+0, s+7, s+3); // Venstre
                addTri(s+1, s+6, s+2); addTri(s+1, s+5, s+6); // Høyre
            };

            // 1. Solid bunnplate (under sporene)
            addBox(0, 0, 0, totalWidth, baseDepth, baseHeight - slotDepth);
            
            // 2. Vegg foran front-sporet
            addBox(0, 0, baseHeight - slotDepth, totalWidth, frontSlotY, baseHeight);
            
            // 3. Midtvegg (mellom front-spor og senter-spor)
            addBox(0, frontSlotY + slotWidth, baseHeight - slotDepth, totalWidth, centerSlotY, baseHeight);
            
            // 4. Bakvegg (bak senter-sporet)
            addBox(0, centerSlotY + slotWidth, baseHeight - slotDepth, totalWidth, baseDepth, baseHeight);

            // 5. Side-støtter (Bygget som tykke, solide trekanter for manifold-sikkerhet)
            const addSupportTriangle = (isLeft) => {
                let xInner = isLeft ? -tolerance : totalWidth + tolerance;
                let xOuter = isLeft ? -tolerance - 2.0 : totalWidth + tolerance + 2.0;
                let s = vertices.length;

                // Inner punkter (mot lithophanen)
                vertices.push({x: xInner, y: 0, z: baseHeight}); // 0: Bunn front
                vertices.push({x: xInner, y: baseDepth, z: baseHeight}); // 1: Bunn bak
                vertices.push({x: xInner, y: baseDepth/2, z: baseHeight + supportH}); // 2: Topp
                
                // Outer punkter (utsiden av støtten)
                vertices.push({x: xOuter, y: 0, z: baseHeight}); // 3: Bunn front
                vertices.push({x: xOuter, y: baseDepth, z: baseHeight}); // 4: Bunn bak
                vertices.push({x: xOuter, y: baseDepth/2, z: baseHeight + supportH}); // 5: Topp

                // Faces (Ulik retning basert på hvilken side for å ha riktige normaler)
                if (isLeft) {
                    addTri(s+0, s+1, s+2); // Inner
                    addTri(s+3, s+5, s+4); // Outer
                    addTri(s+0, s+3, s+4); addTri(s+0, s+4, s+1); // Bunn
                    addTri(s+0, s+2, s+5); addTri(s+0, s+5, s+3); // Front/Skrå
                    addTri(s+1, s+4, s+5); addTri(s+1, s+5, s+2); // Bak/Skrå
                } else {
                    addTri(s+0, s+2, s+1); // Inner
                    addTri(s+3, s+4, s+5); // Outer
                    addTri(s+0, s+4, s+3); addTri(s+0, s+1, s+4); // Bunn
                    addTri(s+0, s+5, s+2); addTri(s+0, s+3, s+5); // Front/Skrå
                    addTri(s+1, s+5, s+4); addTri(s+1, s+2, s+5); // Bak/Skrå
                }
            };
            
            addSupportTriangle(true);  // Venstre side
            addSupportTriangle(false); // Høyre side
        }

        logMessage(`Mesh ferdig. Total Vertices: ${vertices.length}, Trekanter: ${triangles.length}.`, 'success');

        // --- EKSPORT 3MF ---
        logMessage('Bygger XML for 3MF filen...', 'normal');
        
        // Gjør objekt-arrayene om til rene tekststrenger før eksport
        const verticesXML = vertices.map(v => `<vertex x="${v.x.toFixed(3)}" y="${v.y.toFixed(3)}" z="${v.z.toFixed(3)}"/>`).join('\n');
        const trianglesXML = triangles.map(t => `<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`).join('\n');

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
        <vertices>\n${verticesXML}\n</vertices>
        <triangles>\n${trianglesXML}\n</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;
        zip.folder("3D").file("3dmodel.model", modelXML);

        logMessage('Komprimerer data, vennligst vent...', 'normal');
        
        const content = await zip.generateAsync({type: "blob", compression: "DEFLATE"});
        
        logMessage('Generering fullført! Starter nedlasting.', 'success');
        
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "lithophane_print_in_place.3mf";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

    } catch (error) {
        logMessage(`En feil oppstod under generering: ${error.message}`, 'error');
        console.error(error);
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = originalBtnText;
    }
});

// Initialisering ved oppstart
logMessage('Lithophane Generator Engine startet v1.2 (Sikker versjon)', 'success');
logMessage('Venter på bilde...', 'normal');

/* Version: #10 */
