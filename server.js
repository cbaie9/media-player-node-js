const express = require('express');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const { USERNAME, PASSWORD } = require('./auth.config.js');

const app = express();
const PORT = 3000;
const MEDIA_ROOT = path.join(__dirname, 'Appluncher');

// Configuration de l'authentification
app.use(basicAuth({
    users: { [USERNAME]: PASSWORD },
    challenge: true,
    realm: 'Media Viewer - Authentification Requise'
}));

// Middleware pour servir les fichiers statiques
app.use(express.static(__dirname));

// Route sécurisée pour les médias (version simplifiée)
app.get('/media', (req, res) => {
    const filePath = req.query.path;
    
    if (!filePath) {
        return res.status(400).send('Paramètre path manquant');
    }

    const absolutePath = path.join(MEDIA_ROOT, filePath);

    // Vérification de sécurité
    if (!absolutePath.startsWith(MEDIA_ROOT)) {
        return res.status(403).send('Accès interdit');
    }

    // Vérifie que le fichier existe
    fs.access(absolutePath, fs.constants.R_OK, (err) => {
        if (err) {
            return res.status(404).send('Fichier non trouvé');
        }

        const stream = fs.createReadStream(absolutePath);
        stream.on('error', () => res.status(500).end());
        stream.pipe(res);
    });
});

// API pour l'explorateur de fichiers
app.get('/api/list', (req, res) => {
    const relPath = req.query.path || '/';
    const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    const targetDir = path.join(MEDIA_ROOT, safePath);

    if (!targetDir.startsWith(MEDIA_ROOT)) {
        return res.status(403).json({ error: 'Accès refusé' });
    }

    fs.readdir(targetDir, { withFileTypes: true }, (err, entries) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur de lecture' });
        }

        const files = entries
            .filter(entry => !entry.name.startsWith('.'))
            .map(entry => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                path: entry.isDirectory() 
                    ? `${relPath}${entry.name}/`
                    : `/media?path=${encodeURIComponent(path.join(safePath, entry.name))}`
            }));

        res.json(files);
    });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Erreur serveur');
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
    console.log(`Dossier média: ${MEDIA_ROOT}`);
});