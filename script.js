/* Version: #11 */

// === SEKSJON: Systemlogg ===
const systemLog = document.getElementById('systemLog');
const logContainer = document.querySelector('.log-container');

function logMessage(message, type = 'normal') {
    const li = document.createElement('li');
    const timestamp = new Date().toLocaleTimeString();
    li.textContent = `[${timestamp}] ${message}`;
    if (type !== 'normal') li.classList.add(`log-${type}`);
    systemLog.appendChild(li);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// === SEKSJON: Variabler og DOM-elementer ===
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
let originalImage = null; 

const imageInput = document.getElementById('imageInput');
const contrastSlider = document.getElementById('contrastSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const invertCheckbox = document.getElementById('invertCheckbox');
const generateBtn = document.getElementById('generateBtn');

const maxWidthSlider = document.getElementById('maxWidthSlider');
const minThickSlider = document.getElementById('minThickSlider');
const maxThickSlider = document.getElementById('maxThickSlider');
const borderSlider = document.getElementById('borderSlider');

const enableBaseCheckbox = document.getElementById('enableBaseCheckbox');
const baseDepthSlider = document.getElementById('baseDepthSlider');
const baseHeightSlider = document.getElementById('baseHeightSlider');
const supportHeightSlider = document.getElementById('supportHeightSlider');
const toleranceSlider = document.getElementById('toleranceSlider');

// === SEKSJON: Hendelseslyttere for UI ===
document.querySelectorAll('input[type="range"]').forEach(slider => {
    slider.addEventListener('input', (e) => {
        const spanId = e.target.id.replace('Slider', 'Value');
        const span = document.getElementById(spanId);
        if (span) span.textContent = e.target.value;
        
        if (e.target.id === 'contrastSlider' || e.target.id === 'brightnessSlider') {
            updateCanvas();
        }
    });
});

invertCheckbox.addEventListener('change', updateCanvas);

// === SEKSJON: Bildeopplasting ===
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    logMessage(`Starter innlesing av fil: ${file.name}`, 'normal');
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            logMessage(`Bilde dekodet vellykket: ${img.width}x${img.height}`, 'success');
            updateCanvas();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// === SEKSJON: Canvas & Bildebehandling (2D) ===
function updateCanvas() {
    if (!originalImage) return;
    
    const MAX_PREVIEW_WIDTH = 800;
    let drawWidth = originalImage.width;
    let drawHeight = originalImage.height;

    if (drawWidth > MAX_PREVIEW_WIDTH) {
        const ratio = MAX_PREVIEW_WIDTH / drawWidth;
        drawWidth = MAX_PREVIEW_WIDTH;
        drawHeight = drawHeight * ratio;
    }

    canvas.width = drawWidth;
    canvas.height = drawHeight;
    ctx.drawImage(originalImage, 0, 0, drawWidth, drawHeight);

    const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight);
    const data = imageData.data;
    const contrast = parseInt(contrastSlider.value);
    const brightness = parseInt(brightnessSlider.value);
    const invert = invertCheckbox.checked;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
        let r = data[i] + brightness;
        let g = data[i+1] + brightness;
        let b = data[i+2] + brightness;

        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;

        let gray = Math.max(0, Math.min(255, (0.299 * r) + (0.587 * g) + (0.114 * b)));
        if (invert) gray = 255 - gray;

        data[i] = data[i+1] = data[i+2] = gray;
    }

    ctx.putImageData(imageData, 0, 0);
    logMessage('Piksel-prosessering fullført. Canvas oppdatert.', 'success');
    generateBtn.disabled = false;
}

// === SEKSJON: 3D Geometri og 3MF Eksport ===
generateBtn.addEventListener('click', async () => {
    if (!originalImage || !window.JSZip) return;

    generateBtn.disabled = true;
    const originalBtnText = generateBtn.textContent;
    generateBtn.textContent = 'Genererer 3MF...';

    try {
        logMessage('Starter 3D-generering. Henter innstillinger...', 'normal');

        const maxWidth = parseFloat(maxWidthSlider.value);
        const minThick = parseFloat(minThickSlider.value);
        const maxThick = parseFloat(maxThickSlider.value);
        const borderWidth = parseFloat(borderSlider.value);
        const resolution = 4;

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

        const useBase = enableBaseCheckbox.checked;
        const baseDepth = parseFloat(baseDepthSlider.value);
        const baseHeight = parseFloat(baseHeightSlider.value);
        const supportH = parseFloat(supportHeightSlider.value);
        const tolerance = parseFloat(toleranceSlider.value);
        
        const slotDepth = 3.0; 
        const slotWidth = maxThick + (tolerance * 2); 
        
        // Z-Offset inkludere toleranse for perfekt 1-lags luftspalte i bunnen av sporet
        const lithoOffsetZ = useBase ? (baseHeight - slotDepth + tolerance) : 0.0;
        const lithoOffsetY = useBase ? (baseDepth / 2) - (slotWidth / 2) + tolerance : 0.0;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgCols;
        tempCanvas.height = imgRows;
        tempCanvas.getContext('2d').drawImage(canvas, 0, 0, imgCols, imgRows);
        const imgData = tempCanvas.getContext('2d').getImageData(0, 0, imgCols, imgRows).data;

        let vertices = [];
        let triangles = [];

        logMessage('Kalkulerer 3D vertices for Lithophane...', 'normal');
        
        const getThickness = (r, c) => {
            if (r < borderCells || r >= totalRows - borderCells || c < borderCells || c >= totalCols - borderCells) {
                return maxThick;
            }
            const imgR = r - borderCells;
            const imgC = c - borderCells;
            const gray = imgData[(imgR * imgCols + imgC) * 4];
            return minThick + (1 - (gray / 255)) * (maxThick - minThick);
        };

        for (let r = 0; r < totalRows; r++) {
            for (let c = 0; c < totalCols; c++) {
                vertices.push({x: c / resolution, y: lithoOffsetY + getThickness(r, c), z: lithoOffsetZ + totalHeight - (r / resolution)});
            }
        }

        let backStartIndex = totalRows * totalCols;
        for (let r = 0; r < totalRows; r++) {
            for (let c = 0; c < totalCols; c++) {
                vertices.push({x: c / resolution, y: lithoOffsetY, z: lithoOffsetZ + totalHeight - (r / resolution)});
            }
        }

        const addTri = (v1, v2, v3) => triangles.push({v1, v2, v3});

        for (let r = 0; r < totalRows - 1; r++) {
            for (let c = 0; c < totalCols - 1; c++) {
                let i = r * totalCols + c;
                addTri(i, i + totalCols, i + totalCols + 1); addTri(i, i + totalCols + 1, i + 1);
            }
        }

        for (let r = 0; r < totalRows - 1; r++) {
            for (let c = 0; c < totalCols - 1; c++) {
                let i = backStartIndex + r * totalCols + c;
                addTri(i, i + 1, i + totalCols + 1); addTri(i, i + totalCols + 1, i + totalCols);
            }
        }

        for (let c = 0; c < totalCols - 1; c++) {
            let f1 = c; let f2 = c + 1;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, b1, b2); addTri(f1, b2, f2);
        }
        let botR = totalRows - 1;
        for (let c = 0; c < totalCols - 1; c++) {
            let f1 = botR * totalCols + c; let f2 = botR * totalCols + c + 1;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, f2, b2); addTri(f1, b2, b1);
        }
        for (let r = 0; r < totalRows - 1; r++) {
            let f1 = r * totalCols; let f2 = (r + 1) * totalCols;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, b2, b1); addTri(f1, f2, b2);
        }
        let rightC = totalCols - 1;
        for (let r = 0; r < totalRows - 1; r++) {
            let f1 = r * totalCols + rightC; let f2 = (r + 1) * totalCols + rightC;
            let b1 = backStartIndex + f1; let b2 = backStartIndex + f2;
            addTri(f1, b1, b2); addTri(f1, b2, f2);
        }

        // --- GENERER PRINT-IN-PLACE BASE (FEILRETTET) ---
        if (useBase) {
            logMessage('Bygger solid Print-in-Place Base med spor og støtter...', 'normal');
            
            const frontSlotY = 5.0; 
            const centerSlotY = lithoOffsetY - tolerance; 
            const supportThickness = 5.0; // Gjør trekantene 5mm tykke for stabilitet
            
            // Forlenget bunnplate slik at side-trekantene hviler på den
            const baseMinX = -tolerance - supportThickness;
            const baseMaxX = totalWidth + tolerance + supportThickness;

            const addBox = (x1, y1, z1, x2, y2, z2) => {
                let s = vertices.length;
                vertices.push(
                    {x:x1, y:y1, z:z1}, {x:x2, y:y1, z:z1}, {x:x2, y:y2, z:z1}, {x:x1, y:y2, z:z1},
                    {x:x1, y:y1, z:z2}, {x:x2, y:y1, z:z2}, {x:x2, y:y2, z:z2}, {x:x1, y:y2, z:z2} 
                );
                addTri(s+0, s+2, s+1); addTri(s+0, s+3, s+2); 
                addTri(s+4, s+5, s+6); addTri(s+4, s+6, s+7); 
                addTri(s+0, s+1, s+5); addTri(s+0, s+5, s+4); 
                addTri(s+3, s+6, s+7); addTri(s+3, s+2, s+6); 
                addTri(s+0, s+4, s+7); addTri(s+0, s+7, s+3); 
                addTri(s+1, s+6, s+2); addTri(s+1, s+5, s+6); 
            };

            addBox(baseMinX, 0, 0, baseMaxX, baseDepth, baseHeight - slotDepth);
            addBox(baseMinX, 0, baseHeight - slotDepth, baseMaxX, frontSlotY, baseHeight);
            addBox(baseMinX, frontSlotY + slotWidth, baseHeight - slotDepth, baseMaxX, centerSlotY, baseHeight);
            addBox(baseMinX, centerSlotY + slotWidth, baseHeight - slotDepth, baseMaxX, baseDepth, baseHeight);

            // Side-støtter forankres nå til Z=0 for fullstendig fletting med bunnplaten
            const addSupportTriangle = (isLeft) => {
                let xInner = isLeft ? -tolerance : totalWidth + tolerance;
                let xOuter = isLeft ? baseMinX : baseMaxX;
                let s = vertices.length;
                let startZ = 0.0; // Nøkkelrettelse: Starter fra platen!

                vertices.push({x: xInner, y: 0, z: startZ}); 
                vertices.push({x: xInner, y: baseDepth, z: startZ}); 
                vertices.push({x: xInner, y: baseDepth/2, z: baseHeight + supportH}); 
                
                vertices.push({x: xOuter, y: 0, z: startZ}); 
                vertices.push({x: xOuter, y: baseDepth, z: startZ}); 
                vertices.push({x: xOuter, y: baseDepth/2, z: baseHeight + supportH}); 

                if (isLeft) {
                    addTri(s+0, s+1, s+2); 
                    addTri(s+3, s+5, s+4); 
                    addTri(s+0, s+3, s+4); addTri(s+0, s+4, s+1); 
                    addTri(s+0, s+2, s+5); addTri(s+0, s+5, s+3); 
                    addTri(s+1, s+4, s+5); addTri(s+1, s+5, s+2); 
                } else {
                    addTri(s+0, s+2, s+1); 
                    addTri(s+3, s+4, s+5); 
                    addTri(s+0, s+4, s+3); addTri(s+0, s+1, s+4); 
                    addTri(s+0, s+5, s+2); addTri(s+0, s+3, s+5); 
                    addTri(s+1, s+5, s+4); addTri(s+1, s+2, s+5); 
                }
            };
            
            addSupportTriangle(true);  
            addSupportTriangle(false); 
        }

        logMessage('Bygger XML for 3MF filen...', 'normal');
        
        const verticesXML = vertices.map(v => `<vertex x="${v.x.toFixed(3)}" y="${v.y.toFixed(3)}" z="${v.z.toFixed(3)}"/>`).join('\n');
        const trianglesXML = triangles.map(t => `<triangle v1="${t.v1}" v2="${t.v2}" v3="${t.v3}"/>`).join('\n');

        const zip = new JSZip();
        zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />\n  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />\n</Types>`);
        zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />\n</Relationships>`);
        zip.folder("3D").file("3dmodel.model", `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n  <resources>\n    <object id="1" type="model">\n      <mesh>\n        <vertices>\n${verticesXML}\n</vertices>\n        <triangles>\n${trianglesXML}\n</triangles>\n      </mesh>\n    </object>\n  </resources>\n  <build>\n    <item objectid="1"/>\n  </build>\n</model>`);

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
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = originalBtnText;
    }
});

logMessage('Lithophane Generator Engine startet v1.3 (Feilrettet Support)', 'success');
logMessage('Venter på bilde...', 'normal');

/* Version: #11 */
