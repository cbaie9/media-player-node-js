const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { USERNAME, PASSWORD } = require('./auth.config.js');

const app = express();
const PORT = 3000;
const MEDIA_ROOT = path.join(__dirname, 'Appluncher');
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const SESSIONS = new Set();

// Configuration Multer pour l'upload
const upload = multer({
  dest: 'uploads/tmp/',
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = ['.jpg','.jpeg','.png','.gif','.webp','.mp4','.webm','.mov','.avi','.mkv'];
    cb(null, allowed.includes(ext));
  }
});

app.use(cookieParser());
app.use('/login', express.static(path.join(__dirname, 'login'))); // Sert le dossier login en public
app.use(express.static(path.join(__dirname, 'site')));
app.use(express.json());

// Middleware d'authentification par cookie
function requireAuth(req, res, next) {
  const sid = req.cookies['sid'];
  if (sid && SESSIONS.has(sid)) {
    return next();
  }
  // Si requête API, renvoie 401, sinon redirige vers /login
  if (req.path.startsWith('/api') || req.path.startsWith('/media')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/login');
}

// Page de login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Traitement du login
app.post('/api/login', express.json(), (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    const sid = crypto.randomBytes(32).toString('hex');
    SESSIONS.add(sid);
    res.cookie('sid', sid, { httpOnly: true, sameSite: 'Strict' });
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Identifiants invalides' });
});

// Déconnexion
app.post('/api/logout', (req, res) => {
  const sid = req.cookies['sid'];
  if (sid) SESSIONS.delete(sid);
  res.clearCookie('sid');
  res.json({ success: true });
});

// Toutes les routes suivantes nécessitent l'auth
app.use(requireAuth);

// Upload
app.post('/api/upload', upload.array('mediaFiles'), (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files received' });

    const targetDir = path.join(MEDIA_ROOT, req.body.path || '');
    if (!targetDir.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Forbidden path' });

    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const results = [];
    req.files.forEach(file => {
      const finalPath = path.join(targetDir, file.originalname);
      fs.renameSync(file.path, finalPath);
      results.push({ name: file.originalname, path: finalPath.replace(MEDIA_ROOT, '') });
    });

    res.json({ success: true, uploaded: results });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Liste de fichiers
app.get('/api/list', (req, res) => {
  const relPath = req.query.path || '/';
  // Correction : retire le préfixe /site si présent
  let safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  // Si le chemin commence par /site/, on l'enlève
  if (safePath.startsWith('/site/')) safePath = safePath.slice(5);
  if (safePath.startsWith('site/')) safePath = safePath.slice(4);
  const targetDir = path.join(MEDIA_ROOT, safePath);

  if (!targetDir.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Access denied' });

  fs.readdir(targetDir, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ error: 'Read error' });

    const files = entries
      .filter(entry => !entry.name.startsWith('.'))
      .map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: entry.isDirectory() 
          ? `${relPath}${entry.name}/`
          : `${relPath}${entry.name}`
      }));

    res.json({ files });
  });
});

// Route média
app.get('/media', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('Missing path');

  const absolutePath = path.join(MEDIA_ROOT, filePath);
  if (!absolutePath.startsWith(MEDIA_ROOT)) return res.status(403).send('Forbidden');

  fs.stat(absolutePath, (err, stats) => {
    if (err) return res.status(404).send('Not found');

    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const file = fs.createReadStream(absolutePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4'
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4'
      });
      fs.createReadStream(absolutePath).pipe(res);
    }
  });
});

// Suppression de fichier
app.delete('/api/delete', (req, res) => {
  const filePath = req.body?.path;
  if (!filePath) return res.status(400).json({ error: 'Missing file path' });

  const absolutePath = path.join(MEDIA_ROOT, filePath);
  if (!absolutePath.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Access denied' });

  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats) return res.status(404).json({ error: 'File not found' });

    if (stats.isDirectory()) {
      fs.rm(absolutePath, { recursive: true, force: true }, (err) => {
        if (err) return res.status(500).json({ error: 'Deletion failed' });
        res.json({ success: true });
      });
    } else {
      fs.unlink(absolutePath, (err) => {
        if (err) return res.status(500).json({ error: 'Deletion failed' });
        res.json({ success: true });
      });
    }
  });
});

// ➕ Création de dossier
app.post('/api/mkdir', (req, res) => {
  const { path: folderPath, name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const target = path.join(MEDIA_ROOT, folderPath || '', name);
  if (!target.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Forbidden path' });

  fs.mkdir(target, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ error: 'Creation failed' });
    res.json({ success: true });
  });
});

// ➡️ Renommage de fichier/dossier
app.post('/api/rename', (req, res) => {
  const { path: filePath, newName } = req.body;
  if (!filePath || !newName) return res.status(400).json({ error: 'Missing parameters' });

  // Vérification caractères interdits
  if (/[\\/:*?"<>|]/.test(newName)) return res.status(400).json({ error: 'Nom de fichier invalide.' });

  const absolutePath = path.join(MEDIA_ROOT, filePath);
  if (!absolutePath.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Access denied' });

  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats) return res.status(404).json({ error: 'File not found' });

    const parentDir = path.dirname(absolutePath);
    const targetPath = path.join(parentDir, newName);

    // Vérifie si le fichier/dossier existe déjà
    if (fs.existsSync(targetPath)) {
      return res.status(400).json({ error: 'Un fichier ou dossier avec ce nom existe déjà.' });
    }

    fs.rename(absolutePath, targetPath, (err) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du renommage.' });
      res.json({ success: true });
    });
  });
});

// Démarrer serveur
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
