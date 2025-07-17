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
const backButton2 = document.getElementById('back-to-explorer-2');
const mediaControls = document.getElementById('media-controls');

// Variables d'état
let currentFiles = [];
let currentIndex = 0;
let currentPath = '/';
let touchStartX = 0;
let mouseStartX = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  setupUpload();
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
  if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
    document.body.setAttribute('data-theme', 'dark');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
}

// Configuration de l'upload
function setupUpload() {
  const uploadForm = document.createElement('div');
  uploadForm.className = 'upload-form';
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

  document.querySelector('.header-right').prepend(uploadForm);

  document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', handleFileUpload);
}

async function handleFileUpload(e) {
  const files = e.target.files;
  if (files.length === 0) return;

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
    showError('Échec de l upload');
  } finally {
    setTimeout(() => progress.style.display = 'none', 2000);
    document.getElementById('file-input').value = '';
  }
}

function filterFiles(query) {
  const items = fileListElement.querySelectorAll('.file-item');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(query) ? 'block' : 'none';
  });
}

function setupEventListeners() {
  themeToggle.addEventListener('click', toggleTheme);
  backButton.addEventListener('click', resetView);
  backButton2.addEventListener('click', resetView);

  document.getElementById('prev-btn').addEventListener('click', prevMedia);
  document.getElementById('next-btn').addEventListener('click', nextMedia);
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    enterFullscreen(mediaElement.style.display !== 'none' ? mediaElement : imageElement);
  });

  mediaElement.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
  mediaElement.addEventListener('touchend', handleSwipe);
  imageElement.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
  imageElement.addEventListener('touchend', handleSwipe);

  mediaElement.addEventListener('mousedown', e => mouseStartX = e.clientX);
  mediaElement.addEventListener('mouseup', handleMouseSwipe);
  imageElement.addEventListener('mousedown', e => mouseStartX = e.clientX);
  imageElement.addEventListener('mouseup', handleMouseSwipe);

  document.addEventListener('keydown', handleKeyPress);
}

function handleSwipe(e) {
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 50) diff > 0 ? nextMedia() : prevMedia();
}

function handleMouseSwipe(e) {
  if (mouseStartX === null) return;
  const diff = mouseStartX - e.clientX;
  if (Math.abs(diff) > 50) diff > 0 ? nextMedia() : prevMedia();
  mouseStartX = null;
}

function handleKeyPress(e) {
  if (e.key === 'ArrowLeft') prevMedia();
  if (e.key === 'ArrowRight') nextMedia();
  if (e.key === 'Escape' && document.fullscreenElement) resetView();
}

function toggleTheme() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeToggle.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

async function loadDirectory(path) {
  showLoading(true);
  currentPath = path;
  currentPathElement.textContent = path;
  document.getElementById('path-input').value = path;

  try {
    const res = await fetch(`/api/list?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error("Erreur de chargement");
    currentFiles = await res.json();
    renderFileList();
  } catch (error) {
    console.error("Erreur:", error);
    fileListElement.innerHTML = `
      <div class="file-item error">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Erreur de chargement</span>
      </div>
    `;
  } finally {
    showLoading(false);
  }
}

function renderFileList() {
  fileListElement.innerHTML = '';

  if (currentPath !== '/') {
    const parentItem = document.createElement('div');
    parentItem.className = 'file-item';
    parentItem.innerHTML = `<i class="fas fa-level-up-alt"></i><span>..</span>`;
    parentItem.addEventListener('click', () => {
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      loadDirectory('/' + parts.join('/') + (parts.length ? '/' : ''));
    });
    fileListElement.appendChild(parentItem);
  }

  currentFiles.forEach((file, index) => {
    const lower = file.name.toLowerCase();
    if (['.bat', '.txt', '.url'].some(ext => lower.endsWith(ext))) return;

    const item = document.createElement('div');
    item.className = 'file-item';

    const icon = document.createElement('i');
    icon.className = file.isDirectory ? 'fas fa-folder' :
      SUPPORTED_FORMATS.images.some(ext => lower.endsWith(ext)) ? 'fas fa-image' :
      'fas fa-film';

    const name = document.createElement('span');
    name.textContent = file.name;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'control-btn';
    deleteBtn.style.fontSize = '0.8rem';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.title = 'Supprimer';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Supprimer "${file.name}" ?`)) {
        deleteFile(file.path);
      }
    });

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(deleteBtn);

    item.addEventListener('click', () => {
      if (file.isDirectory) {
        loadDirectory(file.path);
      } else {
        openMedia(index);
      }
    });

    fileListElement.appendChild(item);
  });
}

async function deleteFile(path) {
  try {
    const res = await fetch('/api/delete', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
    if (!res.ok) throw new Error('Erreur suppression');
    loadDirectory(currentPath);
  } catch (err) {
    console.error('Suppression échouée:', err);
    showError('Impossible de supprimer ce fichier');
  }
}

function openMedia(index) {
  currentIndex = index;
  const file = currentFiles[index];
  showLoading(true);
  hideError();

  document.querySelector('.file-explorer').style.display = 'none';
  backButton.style.display = 'inline-block';
  backButton2.style.display = 'inline-block';

  const isVideo = SUPPORTED_FORMATS.videos.some(ext => file.name.toLowerCase().endsWith(ext));
  const isImage = SUPPORTED_FORMATS.images.some(ext => file.name.toLowerCase().endsWith(ext));

  if (isVideo) {
    imageElement.style.display = 'none';
    mediaElement.style.display = 'block';
    mediaElement.src = file.path;
    mediaElement.controls = true;
    mediaControls.style.display = 'flex';
    document.getElementById('fullscreen-btn').style.display = 'inline-block';

    mediaElement.onloadedmetadata = () => {
      showLoading(false);
    };

    mediaElement.onerror = () => showError();
  } else if (isImage) {
    mediaElement.style.display = 'none';
    imageElement.style.display = 'block';
    imageElement.src = file.path;
    mediaControls.style.display = 'flex';
    document.getElementById('fullscreen-btn').style.display = 'none';

    imageElement.onload = () => showLoading(false);
    imageElement.onerror = () => showError();

    imageElement.onclick = (e) => {
      const rect = imageElement.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      if (clickX < width / 2) {
        prevMedia();
      } else {
        nextMedia();
      }
    };
  }
}

function resetView() {
  document.querySelector('.file-explorer').style.display = 'block';
  backButton.style.display = 'none';
  backButton2.style.display = 'none';
  mediaControls.style.display = 'none';
  mediaElement.pause();
  mediaElement.src = '';
  imageElement.src = '';
  mediaElement.style.display = 'none';
  imageElement.style.display = 'none';
  errorDisplay.style.display = 'none';
  if (document.fullscreenElement) document.exitFullscreen();
}

function prevMedia() {
  if (currentIndex > 0) openMedia(currentIndex - 1);
}

function nextMedia() {
  if (currentIndex < currentFiles.length - 1) openMedia(currentIndex + 1);
}

function enterFullscreen(element) {
  if (element.requestFullscreen) {
    element.requestFullscreen();
  } else if (element.webkitRequestFullscreen) {
    element.webkitRequestFullscreen();
  } else if (element.msRequestFullscreen) {
    element.msRequestFullscreen();
  }
}

function showLoading(show) {
  loadingIndicator.style.display = show ? 'block' : 'none';
}

function showError(message = 'Fichier non supporté') {
  showLoading(false);
  errorDisplay.textContent = message;
  errorDisplay.style.display = 'block';
}

function hideError() {
  errorDisplay.style.display = 'none';
}
