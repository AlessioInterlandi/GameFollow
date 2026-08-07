import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.redirect('/login.html');
});

app.use((_req, res) => {
  res.status(404).send('Pagina non trovata.');
});

app.listen(port, () => {
  console.log(`App disponibile su http://localhost:${port}`);
});
