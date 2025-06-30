const SUPPORTED_FORMATS = {
  images: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  videos: ['.mp4', '.webm', '.mov', '.avi', '.mkv']
};

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

let currentFiles = [];
let currentIndex = 0;
let currentPath = '/';
let touchStartX = 0;
let mouseStartX = null;

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  loadDirectory(currentPath);
});

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && systemDark)) {
    document.body.setAttribute('data-theme', 'dark');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
  }
}

themeToggle.addEventListener('click', () => {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
  themeToggle.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
});

backButton.addEventListener('click', resetView);
backButton2.addEventListener('click', resetView);

function setupEventListeners() {
  document.getElementById('prev-btn').addEventListener('click', prevMedia);
  document.getElementById('next-btn').addEventListener('click', nextMedia);
  document.getElementById('fullscreen-btn').addEventListener('click', () => {
    enterFullscreen(mediaElement);
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) resetView();
  });

  mediaElement.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
  mediaElement.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? nextMedia() : prevMedia();
  });

  mediaElement.addEventListener('mousedown', e => mouseStartX = e.clientX);
  mediaElement.addEventListener('mouseup', e => {
    if (mouseStartX === null) return;
    const diff = mouseStartX - e.clientX;
    if (Math.abs(diff) > 50) diff > 0 ? nextMedia() : prevMedia();
    mouseStartX = null;
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') prevMedia();
    if (e.key === 'ArrowRight') nextMedia();
  });
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

async function loadDirectory(path) {
  showLoading(true);
  currentPath = path;
  currentPathElement.textContent = path;

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
      const newPath = '/' + parts.join('/') + (parts.length ? '/' : '');
      loadDirectory(newPath);
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

    item.appendChild(icon);
    item.appendChild(name);

    item.addEventListener('click', () => {
      if (file.isDirectory) {
        loadDirectory(`${currentPath}${file.name}/`);
      } else {
        openMedia(index);
      }
    });

    fileListElement.appendChild(item);
  });
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
    mediaControls.style.display = 'flex';
    document.getElementById('fullscreen-btn').style.display = 'inline-block';

    mediaElement.onloadeddata = () => {
      showLoading(false);
      enterFullscreen(mediaElement);
      mediaElement.play().catch(() => showError());
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

function showError() {
  showLoading(false);
  errorDisplay.style.display = 'block';
}

function hideError() {
  errorDisplay.style.display = 'none';
}
