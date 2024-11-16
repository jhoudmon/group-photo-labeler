import "./app.css";
import "bootstrap/dist/js/bootstrap.bundle.js";
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "file-saver/dist/FileSaver.js";
import "panzoom/dist/panzoom.js";

let data = {
    image: null,
    metadata: {
        createDate: null,
        modifyDate: null,
        metadataDate: null,
        persons: [
        ]
    }
}
let imageHeight = 0;
let imageWidth = 0;
let initialZoom = 1;
let panzoomInstance = null;
document.addEventListener("DOMContentLoaded", function() {
    initPage1();
});
function initPage1() {
    const inputFile = document.getElementById('inputFile');
    
    // Soumission du formulaire
    const importForm = document.getElementById('import');
    importForm.addEventListener('submit', handleImportFormSubmit);
    function handleImportFormSubmit(e) {
        e.preventDefault();
        if (inputFile.files.length > 0) {
            const file = inputFile.files[0];
            if (file) {
                const reader = new FileReader();
                
                // Conversion de l'image en base64
                reader.onload = function(e) {
                    data.image=e.target.result;
                    loadImageMetadata();
                    prepareImage(e.target.result).then(() => {
                        switchPage2();
                        initPage2();
                        initZones();
                        panzoomInstance.on('transform', function(e) {
                            initZones();
                        });
                    });
                };
                
                reader.readAsDataURL(file);  // Lecture du fichier image et conversion en base64
            }
        }
    }
}

function initZones() {
    const container = document.getElementById('container');
    let transform = panzoomInstance.getTransform();
    let elements = document.querySelectorAll('.zone');
    elements.forEach(element => {
      element.remove();
    });
    elements = document.querySelectorAll('.zone-overlay');
    elements.forEach(element => {
      element.remove();
    });
    data.metadata.persons.forEach((person, index) => {
        const area = person.area;
        const newZone = document.createElement('div');
        newZone.className = 'zone';
        newZone.style.left = parseInt((area.x - (area.w / 2)) * imageWidth * initialZoom * transform.scale + transform.x) + 'px';
        newZone.style.top = parseInt((area.y - (area.h / 2)) * imageHeight * initialZoom * transform.scale + transform.y) + 'px';
        newZone.style.visibility = 'hidden';
        const newFace = document.createElement('div');
        newFace.className = 'face';
        newFace.style.width = parseInt(area.w * imageWidth * initialZoom * transform.scale) + 'px';
        newFace.style.height = parseInt(area.h * imageHeight * initialZoom * transform.scale) + 'px';
        newZone.appendChild(newFace);
        const newLabel = document.createElement('div');
        newLabel.className = 'label';
        var content = document.createTextNode(person.label);
        newLabel.appendChild(content);
        newZone.appendChild(newLabel);
        container.appendChild(newZone);
        
        // Création de l'overlay pour la détection du survol et le clic
        const overlay = document.createElement('div');
        overlay.className = 'zone-overlay';
        overlay.style.left = newZone.style.left;
        overlay.style.top = newZone.style.top;
        overlay.style.width = newFace.style.width;
        overlay.style.height = newFace.style.height;
        container.appendChild(overlay);
        
        overlay.addEventListener('mouseenter', function () {
            newZone.style.visibility = 'visible';
        });
        overlay.addEventListener('mouseleave', function () {
            newZone.style.visibility = 'hidden';
        });
    });
}

function loadImageMetadata() {
    let xmpString = extractXmpString();
    if (null != xmpString) {
        loadXmpMetadata(xmpString);
    }
    console.log(data.metadata);
}

function extractXmpString() {
    // Décoder la chaîne base64 en ArrayBuffer
    const binaryString = atob(data.image.split(',')[1]); // Enlever le préfixe 'data:image/...;base64,'
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Convertir ArrayBuffer en texte pour analyser les balises XML
    const decoder = new TextDecoder("utf-8");
    const content = decoder.decode(bytes);

    // Rechercher les balises de début et de fin du bloc XMP
    const xmpStartTag = "<x:xmpmeta";
    const xmpEndTag = "</x:xmpmeta>";
    const xmpStartIndex = content.indexOf(xmpStartTag);
    const xmpEndIndex = content.indexOf(xmpEndTag);

    // Vérifier si les balises XMP sont présentes
    if (xmpStartIndex !== -1 && xmpEndIndex !== -1) {
        // Extraire le contenu XMP entre les balises
        const xmpString = content.substring(xmpStartIndex, xmpEndIndex + xmpEndTag.length);
        return xmpString;
    } else {
        console.debug("Pas de métadonnées XMP trouvées dans cette image.");
        return null;
    }
}

function loadXmpMetadata(xmpString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmpString, "application/xml");

    // Vérifier les erreurs de parsing
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        console.error("Erreur lors de l'analyse du contenu XMP.");
        return;
    }
    
    const descriptionNode = xmlDoc.getElementsByTagName("rdf:Description")[0];
    if (undefined !== descriptionNode) {
        data.metadata.createDate = descriptionNode.getAttribute("xmp:CreateDate");
        data.metadata.modifyDate = descriptionNode.getAttribute("xmp:ModifyDate");
        data.metadata.metadataDate = descriptionNode.getAttribute("xmp:MetadataDate");
    }

    // Extraire la liste des régions
    const regionNodes = xmlDoc.getElementsByTagName("rdf:li");

    for (let i = 0; i < regionNodes.length; i++) {
        const descriptionNode = regionNodes[i].getElementsByTagName("rdf:Description")[0];
        
        if (undefined !== descriptionNode) {

            // Extraire le nom et le type de la région (ex : "Face")
            const name = descriptionNode.getAttribute("mwg-rs:Name");
            const type = descriptionNode.getAttribute("mwg-rs:Type");

            // Extraire les coordonnées d'aire (x, y, w, h)
            const areaNode = descriptionNode.getElementsByTagName("mwg-rs:Area")[0];
            const x = parseFloat(areaNode.getAttribute("stArea:x"));
            const y = parseFloat(areaNode.getAttribute("stArea:y"));
            const w = parseFloat(areaNode.getAttribute("stArea:w"));
            const h = parseFloat(areaNode.getAttribute("stArea:h"));
            const unit = areaNode.getAttribute("stArea:unit");
            
            if (type == 'Face' && unit == 'normalized') {
                data.metadata.persons.push(
                    {
                        label: name,
                        area: { x: x, y: y, w: w, h: h }
                    }
                );
            }
        }
    }
}

function prepareImage(base64Image) {
    const image = document.getElementById('my-image');
    image.src = base64Image;
    return image.decode().then(() => {
        imageWidth = image.naturalWidth;
        imageHeight = image.naturalHeight;
    });
}

function switchPage2() {
    const page1 = document.getElementById('page1');
    const page2 = document.getElementById('page2');
    page1.style.display = 'none';
    page2.style.display = 'flex';
}
function initPage2() {
    const image = document.getElementById('my-image'); // Image sur laquelle on travaille
    let minZoom = 1;
    if ((window.document.body.clientHeight / imageHeight) < (window.document.body.clientWidth / imageWidth)) {
        initialZoom = window.document.body.clientHeight / imageHeight;
        minZoom = Math.min(1, initialZoom);
    } else {
        initialZoom = window.document.body.clientWidth / imageWidth;
        minZoom = Math.min(1, initialZoom);
    }

    // On instancie panzoom sur l'image
    panzoomInstance = panzoom(image, { 
        maxZoom: 10,
        minZoom: minZoom,
        initialX: (window.document.body.clientWidth - (imageWidth * initialZoom)) / 2,
        initialY: 0,
        initialZoom: initialZoom,
        beforeMouseDown: function(e) {
            var shouldIgnore = !e.altKey;
            return shouldIgnore;
         }
    });
    panzoomInstance.moveTo((window.document.body.clientWidth - (imageWidth * initialZoom)) / 2, 0);
    
    // On annule le comportement par défaut du navigateur du drag sur l'image
    image.addEventListener('dragstart', function(event) {
        event.preventDefault();
    });
    
    // Gestion des clics sur les boutons de zoom
     Array.from(
      document.querySelectorAll('.zoom-button')
    ).forEach((el) => {
      el.addEventListener('click', handleZoomButtonClick);
    });
    function handleZoomButtonClick(e) {
      e.preventDefault();
      let isZoomIn = e.target.id === 'zoom-in';
      let zoomBy = isZoomIn ? 2 : 0.5;
      panzoomInstance.smoothZoom(image.width/2, image.height/2, zoomBy);
    }
    
    // Gestion des clics sur les boutons de déplacement
     Array.from(
      document.querySelectorAll('.move-button')
    ).forEach((el) => {
      el.addEventListener('click', handleMoveButtonClick);
      el.addEventListener('dblclick', (e) => { e.stopPropagation();});
    });
    function handleMoveButtonClick(e) {
      e.preventDefault();
      let dx = 0;
      let dy = 0;
      let smooth = true;
      if (e.target.id === 'move-left') {
          dx = 100;
      } else if (e.target.id === 'move-right') {
          dx = -100;
      } else if (e.target.id === 'move-up') {
          dy = 100;
      } else if (e.target.id === 'move-down') {
          dy = -100;
      }
      panzoomInstance.moveBy(dx, dy, smooth);
    }
    
    // Gestion du clic sur le bouton d'enregistrement
    Array.from(
      document.querySelectorAll('.save-button')
    ).forEach((el) => {
      el.addEventListener('click', handleSaveButtonClick);
      el.addEventListener('dblclick', (e) => { e.stopPropagation();});
    });
    function handleSaveButtonClick(e) {
      e.preventDefault();
      saveAs(data.image, 'photo-annotee.jpg');
    }
}