const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const bcrypt = require('bcryptjs'); // Pour hashage si besoin

const app = express();
const PORT = 3000;
const MEDIA_ROOT = path.join(__dirname, 'Appluncher');
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const SESSIONS = new Map(); // sid -> { username, level }

const USERS_PATH = path.join(__dirname, 'users.json');

// Utilitaires pour charger les utilisateurs
function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) return [];
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}
function getUser(username) {
  return loadUsers().find(u => u.username === username);
}

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
app.use('/login', express.static(path.join(__dirname, 'login')));
app.use(express.static(path.join(__dirname, 'site')));
app.use(express.json());

// Middleware d'authentification par cookie
function requireAuth(req, res, next) {
  const sid = req.cookies['sid'];
  const session = SESSIONS.get(sid);
  if (sid && session) {
    req.user = session;
    return next();
  }
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
  const user = getUser(username);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides' });
  // Pour la démo, mot de passe en clair, sinon utiliser bcrypt.compareSync(password, user.password)
  if (user.password !== password) return res.status(401).json({ error: 'Identifiants invalides' });
  const sid = crypto.randomBytes(32).toString('hex');
  SESSIONS.set(sid, { username, level: user.level });
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'Strict' });
  res.json({ success: true, level: user.level });
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

// Middleware de vérification de niveau
function requireLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user || req.user.level < minLevel) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
}

// Upload (niveau 2+)
app.post('/api/upload', requireLevel(2), upload.array('mediaFiles'), (req, res) => {
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

// Liste de fichiers (niveau 1+)
app.get('/api/list', (req, res) => {
  const relPath = req.query.path || '/';
  // Correction : retire le préfixe /site si présent
  let safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  // Si le chemin commence par /site/, on l'enlève
  if (safePath.startsWith('/site/')) safePath = safePath.slice(5);
  if (safePath.startsWith('site/')) safePath = safePath.slice(4);
  const targetDir = path.join(MEDIA_ROOT, safePath);

  // Restriction dossier "tools" pour niveau < 3
  if (safePath.replace(/\\/g, '/').startsWith('/tools') && req.user.level < 3) {
    return res.status(403).json({ error: 'Accès refusé au dossier tools' });
  }

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

// Route média (lecture seule, niveau 1+)
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

// Suppression de fichier (niveau 2+)
app.delete('/api/delete', requireLevel(2), (req, res) => {
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

// ➕ Création de dossier (niveau 2+)
app.post('/api/mkdir', requireLevel(2), (req, res) => {
  const { path: folderPath, name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });

  const target = path.join(MEDIA_ROOT, folderPath || '', name);
  if (!target.startsWith(MEDIA_ROOT)) return res.status(403).json({ error: 'Forbidden path' });

  fs.mkdir(target, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ error: 'Creation failed' });
    res.json({ success: true });
  });
});

// ➡️ Renommage de fichier/dossier (niveau 2+)
app.post('/api/rename', requireLevel(2), (req, res) => {
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

// Ajoute une route pour donner le nom et le niveau de l'utilisateur courant
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username, level: req.user.level });
});

// Démarrer serveur
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
