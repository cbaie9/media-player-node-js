const SUPPORTED_FORMATS = {
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  videos: ['.mp4', '.webm', '.mov', '.avi', '.mkv']
};

// Éléments DOM
const mediaElement = document.getElementById('media-element');
const imageElement = document.getElementById('image-element');
const fileListElement = document.getElementById('file-list');
const currentPathElement = document.getElementById('current-path');
const loadingIndicator = document.getElementById('loading-indicator');
const errorDisplay = document.getElementById('media-error');
const themeToggle = document.getElementById('theme-toggle');
const backButton = document.getElementById('back-to-explorer');
const mediaControls = document.getElementById('media-controls');

// Variables d'état
let currentFiles = [];
let currentIndex = 0;
let currentPath = '/';
let touchStartX = 0;
let mouseStartX = null;
let deleteMode = false;
let selectedPaths = new Set();
let renameMode = false;
let selectedRenamePath = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  setupUpload();
  setupDeletionAndFolderControls();
  loadDirectory(currentPath);

  document.getElementById('search-input').addEventListener('input', (e) => {
    filterFiles(e.target.value.toLowerCase());
  });

  document.getElementById('go-path-btn').addEventListener('click', () => {
    const newPath = document.getElementById('path-input').value.trim();
    if (newPath) loadDirectory(newPath.startsWith('/') ? newPath : '/' + newPath);
  });
});

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const prefersDark = savedTheme === 'dark' || (!savedTheme && systemDark);
  document.body.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  themeToggle.innerHTML = prefersDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// Thème
function toggleTheme() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.body.setAttribute('data-theme', newTheme);
  themeToggle.innerHTML = newTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  localStorage.setItem('theme', newTheme);
}

// Upload
function setupUpload() {
  const uploadForm = document.querySelector('.upload-form');
  uploadForm.innerHTML = `
    <input type="file" id="file-input" multiple accept="image/*,video/*" style="display:none">
    <button id="upload-btn" class="control-btn">
      <i class="fas fa-upload"></i> Upload
    </button>
    <div id="upload-progress" style="display:none">
      <progress value="0" max="100"></progress>
      <span id="progress-text">0%</span>
    </div>
  `;

  document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', handleFileUpload);
}

async function handleFileUpload(e) {
  const files = e.target.files;
  if (!files.length) return;

  const progress = document.getElementById('upload-progress');
  const progressBar = progress.querySelector('progress');
  const progressText = document.getElementById('progress-text');

  progress.style.display = 'flex';
  progressBar.value = 0;
  progressText.textContent = '0%';

  const formData = new FormData();
  formData.append('path', currentPath);
  Array.from(files).forEach(file => formData.append('mediaFiles', file));

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressBar.value = percent;
        progressText.textContent = `${percent}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        loadDirectory(currentPath);
      } else {
        throw new Error('Upload failed');
      }
    };

    xhr.onerror = () => {
      throw new Error('Upload error');
    };

    xhr.send(formData);
  } catch (error) {
    console.error('Upload error:', error);
    showError('Échec de l\'upload');
  } finally {
    setTimeout(() => progress.style.display = 'none', 2000);
    document.getElementById('file-input').value = '';
  }
}
function loadDirectory(path) {
  fetch(`/api/list?path=${encodeURIComponent(path)}`)
    .then(res => res.json())
    .then(data => {
      currentPath = path;
      currentPathElement.textContent = path;
      document.getElementById('path-input').value = path;
      currentFiles = data.files || [];
      renderFileList();
      hideMedia();
    })
    .catch(err => {
      console.error(err);
      showError('Impossible de charger le dossier.');
    });
}

function renderFileList() {
  fileListElement.innerHTML = '';

  // Ajout du bouton "Sortir du dossier" si on n'est pas à la racine
  if (currentPath !== '/' && currentPath !== '') {
    const upBtn = document.createElement('button');
    upBtn.className = 'control-btn up-btn';
    upBtn.innerHTML = '<i class="fas fa-level-up-alt"></i> Sortir du dossier';
    upBtn.onclick = () => {
      let parent = currentPath.replace(/\/+$/, '');
      parent = parent.substring(0, parent.lastIndexOf('/'));
      if (!parent || parent === '') parent = '/';
      loadDirectory(parent);
    };
    fileListElement.appendChild(upBtn);
  }

  if (currentFiles.length === 0) {
    const noFiles = document.createElement('div');
    noFiles.className = 'file-item error';
    noFiles.textContent = 'Aucun fichier trouvé.';
    fileListElement.appendChild(noFiles);
    return;
  }

  currentFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `<i class="fas ${file.isDirectory ? 'fa-folder' : 'fa-file'}"></i>${file.name}`;

    if (deleteMode) {
      item.classList.add('deletable');
      item.addEventListener('click', () => {
        const selected = item.classList.toggle('selected');
        if (selected) {
          selectedPaths.add(file.path);
        } else {
          selectedPaths.delete(file.path);
        }
      });
    } else if (renameMode) {
      // Mode renommage : sélection unique
      item.classList.add('renamable');
      item.addEventListener('click', () => {
        // Désélectionner l'ancien si besoin
        Array.from(fileListElement.getElementsByClassName('selected-rename')).forEach(el => {
          el.classList.remove('selected-rename');
        });
        if (selectedRenamePath === file.path) {
          selectedRenamePath = null;
        } else {
          item.classList.add('selected-rename');
          selectedRenamePath = file.path;
        }
      });
      if (selectedRenamePath === file.path) {
        item.classList.add('selected-rename');
      }
    } else {
      item.addEventListener('click', () => {
        if (file.isDirectory) {
          loadDirectory(file.path);
        } else {
          openMedia(index);
        }
      });
    }

    if (deleteMode && selectedPaths.has(file.path)) {
      item.classList.add('selected');
    }

    fileListElement.appendChild(item);
  });
}

function filterFiles(query) {
  Array.from(fileListElement.children).forEach(child => {
    // Ignore le bouton "Sortir du dossier" lors du filtrage
    if (child.classList.contains('up-btn')) return;
    const match = child.textContent.toLowerCase().includes(query);
    child.style.display = match ? '' : 'none';
  });
}

function openMedia(index) {
  const file = currentFiles[index];
  currentIndex = index;
  const extension = file.name.split('.').pop().toLowerCase();
  const isImage = SUPPORTED_FORMATS.images.includes(`.${extension}`);
  const isVideo = SUPPORTED_FORMATS.videos.includes(`.${extension}`);

  if (!isImage && !isVideo) {
    showError('Format non supporté');
    return;
  }

  document.body.classList.add('media-active');
  // Affiche le bouton retour explorateur dans le header
  backButton.style.display = 'inline-block';

  // Masque les barres et boutons inutiles en mode média
  document.querySelector('.upload-form').style.display = 'none';
  document.getElementById('search-input').style.display = 'none';
  document.querySelector('.path-controls').style.display = 'none';

  const src = `/media?path=${encodeURIComponent(file.path)}`;
  errorDisplay.style.display = 'none';

  if (isImage) {
    mediaElement.style.display = 'none';
    imageElement.style.display = 'block';
    imageElement.src = src;
  } else {
    imageElement.style.display = 'none';
    mediaElement.style.display = 'block';
    mediaElement.src = src;
    mediaElement.play();
  }

  mediaControls.style.display = 'flex';
}

function hideMedia() {
  document.body.classList.remove('media-active');
  imageElement.style.display = 'none';
  mediaElement.style.display = 'none';
  imageElement.src = '';
  mediaElement.pause();
  mediaElement.src = '';
  mediaControls.style.display = 'none';
  // Cache le bouton retour explorateur dans le header
  backButton.style.display = 'none';

  // Réaffiche les barres et boutons en mode explorateur
  document.querySelector('.upload-form').style.display = '';
  document.getElementById('search-input').style.display = '';
  document.querySelector('.path-controls').style.display = '';
}
function showError(message) {
  errorDisplay.textContent = message;
  errorDisplay.style.display = 'block';
}

function setupEventListeners() {
  themeToggle.addEventListener('click', toggleTheme);
  backButton.addEventListener('click', hideMedia);

  document.addEventListener('keydown', (e) => {
    if (mediaElement.style.display !== 'none' || imageElement.style.display !== 'none') {
      if (e.key === 'ArrowLeft') showPrevious();
      else if (e.key === 'ArrowRight') showNext();
    }
  });

  imageElement.addEventListener('click', (e) => {
    const mid = window.innerWidth / 2;
    e.clientX < mid ? showPrevious() : showNext();
  });

  document.addEventListener('mousedown', e => mouseStartX = e.clientX);
  document.addEventListener('mouseup', e => {
    if (mouseStartX === null) return;
    const delta = e.clientX - mouseStartX;
    if (Math.abs(delta) > 100) {
      delta < 0 ? showNext() : showPrevious();
    }
    mouseStartX = null;
  });

  imageElement.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
  imageElement.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 50) {
      delta < 0 ? showNext() : showPrevious();
    }
  });

  document.getElementById('prev-btn').addEventListener('click', showPrevious);
  document.getElementById('next-btn').addEventListener('click', showNext);
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    const el = mediaElement.style.display !== 'none' ? mediaElement : imageElement;
    if (el.requestFullscreen) el.requestFullscreen();
  });
}

function showPrevious() {
  if (currentIndex > 0) openMedia(currentIndex - 1);
}

function showNext() {
  if (currentIndex < currentFiles.length - 1) openMedia(currentIndex + 1);
}

async function deleteFile(filePath) {
  const res = await fetch('/api/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath })
  });
  if (!res.ok) throw new Error('Échec suppression');
}

// 🔧 Contrôles Supprimer / Annuler / Nouveau dossier
function setupDeletionAndFolderControls() {
  const container = document.querySelector('.upload-form');

  const deleteToggleBtn = document.createElement('button');
  deleteToggleBtn.id = 'toggle-delete-mode';
  deleteToggleBtn.className = 'control-btn';
  deleteToggleBtn.innerHTML = '<i class="fas fa-trash"></i> Supprimer';
  container.appendChild(deleteToggleBtn);

  const cancelDeleteBtn = document.createElement('button');
  cancelDeleteBtn.id = 'cancel-delete-mode';
  cancelDeleteBtn.className = 'control-btn';
  cancelDeleteBtn.innerHTML = '<i class="fas fa-times"></i> Annuler';
  cancelDeleteBtn.style.display = 'none';
  container.appendChild(cancelDeleteBtn);

  const createFolderBtn = document.createElement('button');
  createFolderBtn.id = 'create-folder-btn';
  createFolderBtn.className = 'control-btn';
  createFolderBtn.innerHTML = '<i class="fas fa-folder-plus"></i> Nouveau dossier';
  container.appendChild(createFolderBtn);

  const renameToggleBtn = document.createElement('button');
  renameToggleBtn.id = 'toggle-rename-mode';
  renameToggleBtn.className = 'control-btn';
  renameToggleBtn.innerHTML = '<i class="fas fa-i-cursor"></i> Renommer';
  container.appendChild(renameToggleBtn);

  const cancelRenameBtn = document.createElement('button');
  cancelRenameBtn.id = 'cancel-rename-mode';
  cancelRenameBtn.className = 'control-btn';
  cancelRenameBtn.innerHTML = '<i class="fas fa-times"></i> Annuler';
  cancelRenameBtn.style.display = 'none';
  container.appendChild(cancelRenameBtn);

  deleteToggleBtn.addEventListener('click', () => {
    if (deleteMode && selectedPaths.size > 0) {
      if (confirm(`Supprimer ${selectedPaths.size} élément(s) ?`)) {
        Promise.all([...selectedPaths].map(path => deleteFile(path)))
          .then(() => {
            selectedPaths.clear();
            exitDeleteMode();
            loadDirectory(currentPath);
          });
      }
    } else {
      enterDeleteMode();
    }
  });

  cancelDeleteBtn.addEventListener('click', exitDeleteMode);

  createFolderBtn.addEventListener('click', async () => {
    const name = prompt("Nom du nouveau dossier :");
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/mkdir', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ path: currentPath, name: name.trim() })
      });
      if (!res.ok) throw new Error("Échec création dossier");
      loadDirectory(currentPath);
    } catch (e) {
      console.error(e);
      showError("Impossible de créer le dossier");
    }
  });

  renameToggleBtn.addEventListener('click', async () => {
    if (deleteMode) return; // Ne pas activer en mode suppression

    if (!renameMode) {
      enterRenameMode();
    } else if (selectedRenamePath) {
      // Demander le nouveau nom
      const fileObj = currentFiles.find(f => f.path === selectedRenamePath);
      if (!fileObj) return;
      let newName = prompt("Nouveau nom pour : " + fileObj.name, fileObj.name);
      if (!newName || !newName.trim()) return;

      newName = newName.trim();

      // Vérification caractères interdits (simple)
      if (/[\\/:*?"<>|]/.test(newName)) {
        showError("Nom de fichier invalide.");
        return;
      }

      // Vérifie si le nom existe déjà dans le dossier courant
      const exists = currentFiles.some(f =>
        f.name.toLowerCase() === newName.toLowerCase() && f.path !== selectedRenamePath
      );
      if (exists) {
        showError("Un fichier ou dossier avec ce nom existe déjà.");
        return;
      }

      // Gestion extension
      let finalName = newName;
      if (!fileObj.isDirectory) {
        const oldExt = fileObj.name.includes('.') ? fileObj.name.substring(fileObj.name.lastIndexOf('.')) : '';
        const hasExt = /\.[^\/\\]+$/.test(newName);
        if (!hasExt && oldExt) {
          finalName += oldExt;
        }
      }

      try {
        const res = await fetch('/api/rename', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedRenamePath, newName: finalName })
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showError(data.error || "Erreur lors du renommage.");
          return;
        }
        exitRenameMode();
        loadDirectory(currentPath);
      } catch (e) {
        showError("Erreur lors du renommage.");
      }
    }
  });

  cancelRenameBtn.addEventListener('click', exitRenameMode);
}

function enterDeleteMode() {
  deleteMode = true;
  selectedPaths.clear();
  document.getElementById('toggle-delete-mode').innerHTML = '<i class="fas fa-trash"></i> Supprimer';
  document.getElementById('cancel-delete-mode').style.display = 'inline-block';
  renderFileList();
}

function exitDeleteMode() {
  deleteMode = false;
  selectedPaths.clear();
  document.getElementById('toggle-delete-mode').innerHTML = '<i class="fas fa-trash"></i> Supprimer';
  document.getElementById('cancel-delete-mode').style.display = 'none';
  renderFileList();
}

function enterRenameMode() {
  if (deleteMode) return;
  renameMode = true;
  selectedRenamePath = null;
  document.getElementById('toggle-rename-mode').innerHTML = '<i class="fas fa-i-cursor"></i> Renommer';
  document.getElementById('cancel-rename-mode').style.display = 'inline-block';
  // Désactive le bouton suppression pendant renommage
  document.getElementById('toggle-delete-mode').disabled = true;
  renderFileList();
}

function exitRenameMode() {
  renameMode = false;
  selectedRenamePath = null;
  document.getElementById('toggle-rename-mode').innerHTML = '<i class="fas fa-i-cursor"></i> Renommer';
  document.getElementById('cancel-rename-mode').style.display = 'none';
  document.getElementById('toggle-delete-mode').disabled = false;
  renderFileList();
}
