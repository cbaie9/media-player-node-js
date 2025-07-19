const express = require('express');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const multer = require('multer');
const { USERNAME, PASSWORD } = require('./auth.config.js');

const app = express();
const PORT = 3000;
const MEDIA_ROOT = path.join(__dirname, 'Appluncher');

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

// Middleware
app.use(basicAuth({
  users: { [USERNAME]: PASSWORD },
  challenge: true,
  realm: 'Media Viewer'
}));
app.use(express.static(__dirname));
app.use(express.json());

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
  const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
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

// Démarrer serveur
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
